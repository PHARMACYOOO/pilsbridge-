import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import { appUrl } from '../common/app-url.js';
import type { AuthUser } from '../common/auth-user.js';
import { FEES } from '../common/fees.js';
import { DeliveryStatus, Role, type Courier } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SmsService } from '../sms/sms.service.js';
import { ChowdeckRelayAdapter, relayStatus } from './couriers/chowdeck-relay.adapter.js';
import { CourierApiError, localPhone, type CourierApi, type CourierStatus } from './couriers/courier-api.js';
import { DeliveryService } from './delivery.service.js';
import { RiderAlertsService } from './rider-alerts.service.js';

const QUOTE_TTL_MS = 20 * 60_000;
const PARCEL_NOTE = 'Sealed pharmacy parcel. Do not open. Hand only to the named recipient. Seal';

/**
 * Courier companies through their APIs (behind the CourierApi interface; Chowdeck Relay first):
 * live delivery quotes at checkout, automatic booking when a ready order has no rider, status
 * updates (polled every minute, plus webhooks), and cancellations. Couriers are tried in priority
 * order and only for parcels they've accepted in writing; if every courier fails, operations is told
 * and the job stays open for riders or a manual booking.
 */
@Injectable()
export class CourierDispatchService {
  private readonly log = new Logger(CourierDispatchService.name);
  private readonly apis: Map<string, CourierApi>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly sms: SmsService,
    private readonly delivery: DeliveryService,
    private readonly riders: RiderAlertsService,
    relay: ChowdeckRelayAdapter,
  ) {
    this.apis = new Map<string, CourierApi>([[relay.key, relay]]);
  }

  /** Adapters that can be linked to a courier, and whether their credentials are set. */
  available() {
    return [...this.apis.values()].map((a) => ({ key: a.key, label: a.label, configured: a.configured() }));
  }

  apiFor(courier: Pick<Courier, 'api'>) {
    const api = courier.api ? this.apis.get(courier.api) : undefined;
    return api?.configured() ? api : undefined;
  }

  /** Active API couriers that may carry these parcel categories, in priority order. */
  private async eligible(opts: { prescription: boolean; coldChain: boolean }) {
    const couriers = await this.prisma.courier.findMany({
      where: { active: true, api: { not: null }, ...(opts.prescription ? { acceptsPrescription: true } : {}), ...(opts.coldChain ? { acceptsColdChain: true } : {}) },
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
    });
    return couriers.flatMap((c) => {
      const api = this.apiFor(c);
      return api ? [{ courier: c, api }] : [];
    });
  }

  // ——— Checkout ———

  /**
   * The delivery price for a basket going from this pharmacy to the customer's pinned location.
   * With DELIVERY_PRICING=courier: the courier's live quote plus our margin (rounded to ₦50, within
   * the min/max). Otherwise — or if no courier can quote — the standard flat fee.
   */
  async checkoutQuote(dto: { pharmacyId: string; lat: number; lng: number; prescription: boolean; coldChain: boolean; address?: string }) {
    const standard = { deliveryKobo: dto.coldChain ? FEES.coldChainDeliveryKobo : FEES.deliveryKobo, quoteId: null, source: 'standard' as const };
    if (this.config.get('DELIVERY_PRICING') !== 'courier') return standard;
    const pharmacy = await this.prisma.pharmacy.findUnique({ where: { id: dto.pharmacyId } });
    if (!pharmacy || pharmacy.lat == null || pharmacy.lng == null) return standard;

    for (const { courier, api } of await this.eligible(dto)) {
      try {
        const q = await api.quote({ lat: pharmacy.lat, lng: pharmacy.lng }, { lat: dto.lat, lng: dto.lng }, { pickupAddress: pharmacy.address, dropoffAddress: dto.address });
        const margin = Number(this.config.get('DELIVERY_MARGIN_KOBO') ?? 30_000);
        const min = Number(this.config.get('DELIVERY_MIN_KOBO') ?? 100_000);
        const max = Number(this.config.get('DELIVERY_MAX_KOBO') ?? 1_000_000);
        const priceKobo = Math.min(max, Math.max(min, Math.ceil((q.amountKobo + margin) / 5_000) * 5_000));
        const saved = await this.prisma.deliveryQuote.create({
          data: { pharmacyId: pharmacy.id, courierId: courier.id, lat: dto.lat, lng: dto.lng, courierFeeKobo: q.amountKobo, priceKobo, expiresAt: new Date(Date.now() + QUOTE_TTL_MS) },
        });
        return { deliveryKobo: priceKobo, quoteId: saved.id, source: 'courier' as const };
      } catch (e) {
        this.log.warn(`${courier.name} couldn’t quote: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return standard;
  }

  // ——— Booking ———

  /**
   * Book a courier for an order whose job no rider has taken. Runs automatically when the order is
   * marked ready (AUTO_BOOK_COURIERS=true), or when operations presses "Book through API".
   * Returns the courier booked, or the reasons it couldn't.
   */
  async book(orderId: string, actorId: string | null): Promise<{ booked: string } | { failed: string }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        pharmacy: true,
        patient: { select: { firstName: true, phone: true } },
        items: { select: { product: { select: { classification: true, coldChain: true } } } },
        deliveries: { where: { status: DeliveryStatus.AWAITING_RIDER }, take: 1 },
      },
    });
    const job = order?.deliveries[0];
    if (!order || !job) return { failed: 'No open job for this order' };

    const missing = [
      order.dropoffLat == null || order.dropoffLng == null ? 'the customer didn’t pin their location' : null,
      !order.patient.phone ? 'the customer has no phone number' : null,
      !order.pharmacy.phone ? `${order.pharmacy.name} has no phone number on file` : null,
      order.pharmacy.lat == null ? `${order.pharmacy.name} has no location on file` : null,
    ].filter(Boolean);
    const candidates = missing.length
      ? []
      : await this.eligible({ prescription: order.items.some((i) => i.product.classification === 'POM'), coldChain: job.coldChain });
    if (!missing.length && !candidates.length) missing.push('no connected courier is approved for this parcel');

    const errors: string[] = [...(missing as string[])];
    for (const { courier, api } of candidates) {
      try {
        const q = await api.quote({ lat: order.pharmacy.lat!, lng: order.pharmacy.lng! }, { lat: order.dropoffLat!, lng: order.dropoffLng! }, { pickupAddress: order.pharmacy.address, dropoffAddress: order.deliveryAddress });
        const b = await api.book({
          feeId: q.feeId,
          reference: job.code,
          pickup: { name: order.pharmacy.name, phone: localPhone(order.pharmacy.phone!) },
          dropoff: { name: order.patient.firstName ?? 'Customer', phone: localPhone(order.patient.phone!) },
          note: `${PARCEL_NOTE} ${job.code}.`,
        });
        const claimed = await this.prisma.$transaction(async (tx) => {
          const r = await tx.delivery.updateMany({
            where: { id: job.id, status: DeliveryStatus.AWAITING_RIDER },
            data: {
              status: DeliveryStatus.ASSIGNED,
              provider: 'COURIER',
              courierId: courier.id,
              providerRef: b.reference,
              feeKobo: b.priceKobo ?? q.amountKobo,
              trackingUrl: b.trackingUrl,
              providerStatus: b.rawStatus,
              providerStatusAt: new Date(),
              bookingError: null,
              assignedAt: new Date(),
            },
          });
          if (r.count) {
            await this.audit.record({ actorId, action: 'delivery.courier_booked', entityType: 'Delivery', entityId: job.id, metadata: { courier: courier.name, providerRef: b.reference, feeKobo: b.priceKobo ?? q.amountKobo, via: 'api' } }, tx);
          }
          return r.count > 0;
        });
        if (!claimed) {
          // A rider took the job while we were booking: undo the courier booking.
          await api.cancel(b.reference, 'Booked by another rider').catch(() => undefined);
          return { failed: 'A rider took the job first' };
        }
        return { booked: courier.name };
      } catch (e) {
        errors.push(`${courier.name}: ${e instanceof CourierApiError ? e.message : 'unexpected error'}`);
        if (!(e instanceof CourierApiError)) this.log.error(`Booking ${job.code} with ${courier.name} failed: ${String(e)}`);
      }
    }

    const reason = errors.join('; ');
    await this.prisma.delivery.update({ where: { id: job.id }, data: { bookingError: reason.slice(0, 500) } });
    await this.textOps(`Pilbridge ops: couldn't book a courier for ${order.code} (${reason.slice(0, 70)}). Book by hand or find a rider: ${appUrl(this.config)}/admin`);
    return { failed: reason };
  }

  /** Called when an order is marked ready. */
  autoBook(orderId: string) {
    if (this.config.get('AUTO_BOOK_COURIERS') !== 'true') return;
    void this.book(orderId, null).catch((e: unknown) => this.log.error(`Auto-booking failed: ${String(e)}`));
  }

  /** Operations: book through a courier's API now, whatever the auto-booking setting. */
  async bookNow(admin: AuthUser, deliveryCode: string) {
    const job = await this.prisma.delivery.findUnique({ where: { code: deliveryCode }, select: { orderId: true, status: true } });
    if (!job) throw new NotFoundException('Job not found');
    if (job.status !== DeliveryStatus.AWAITING_RIDER) throw new ConflictException('This job already has a rider or courier');
    return this.book(job.orderId, admin.id);
  }

  /** Operations: the courier didn't come — cancel with them (if connected) and reopen the job. */
  async cancelBooking(admin: AuthUser, deliveryCode: string) {
    const job = await this.prisma.delivery.findUnique({ where: { code: deliveryCode }, include: { courier: true } });
    if (!job || job.provider !== 'COURIER') throw new NotFoundException('Courier booking not found');
    const api = job.courier && this.apiFor(job.courier);
    if (api && job.providerRef && job.status === DeliveryStatus.ASSIGNED) {
      await api.cancel(job.providerRef, 'Cancelled by Pilbridge operations').catch((e: unknown) => this.log.warn(`Courier cancel failed: ${String(e)}`));
    }
    return this.delivery.cancelCourier(admin, deliveryCode);
  }

  /** Jobs withdrawn because an order was cancelled: cancel any courier bookings too. */
  cancelAtProvider(jobs: { code: string; provider: string; providerRef: string | null; courier: { api: string | null } | null }[]) {
    for (const j of jobs) {
      const api = j.provider === 'COURIER' && j.providerRef && j.courier ? this.apiFor(j.courier) : undefined;
      if (api) void api.cancel(j.providerRef!, 'Order cancelled').catch((e: unknown) => this.log.warn(`Courier cancel for ${j.code} failed: ${String(e)}`));
    }
  }

  // ——— Status updates ———

  /** Poll connected couriers for every booking still in progress. */
  async sync() {
    const jobs = await this.prisma.delivery.findMany({
      where: { provider: 'COURIER', status: { in: [DeliveryStatus.ASSIGNED, DeliveryStatus.PICKED_UP] }, providerRef: { not: null }, courier: { api: { not: null } } },
      include: { courier: true },
      take: 200,
    });
    for (const j of jobs) {
      const api = j.courier && this.apiFor(j.courier);
      if (!api) continue;
      try {
        const s = await api.status(j.providerRef!);
        await this.apply(j.id, s.status, s.rawStatus, s.trackingUrl);
      } catch (e) {
        this.log.warn(`Status check for ${j.code} failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  /** Chowdeck webhook: verify the HMAC-SHA256 signature of the raw body, then apply the status. */
  async chowdeckWebhook(rawBody: Buffer | undefined, signature: string | undefined, body: unknown) {
    const secret = this.config.get<string>('CHOWDECK_WEBHOOK_SECRET');
    if (!secret || !rawBody || !signature) throw new NotFoundException();
    const expected = Buffer.from(createHmac('sha256', secret).update(rawBody).digest('hex'));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw new NotFoundException();

    const payload = (body as { payload?: { reference?: unknown; status?: unknown; tracking_url?: unknown } } | null)?.payload;
    if (typeof payload?.reference !== 'string' || typeof payload.status !== 'string') return { received: true };
    const job = await this.prisma.delivery.findFirst({ where: { OR: [{ providerRef: payload.reference }, { code: payload.reference }], provider: 'COURIER' } });
    if (job) {
      await this.apply(job.id, relayStatus(payload.status), payload.status, typeof payload.tracking_url === 'string' ? payload.tracking_url : null);
    }
    return { received: true };
  }

  /**
   * Apply a courier's status. Completion counts only after the pharmacy recorded the handover; a
   * courier cancelling before pickup reopens the job; after pickup, the parcel comes back.
   */
  async apply(deliveryId: string, status: CourierStatus, rawStatus: string, trackingUrl: string | null) {
    const job = await this.prisma.delivery.findUnique({ where: { id: deliveryId }, include: { order: { select: { code: true } }, courier: { select: { name: true } } } });
    if (!job || (job.status !== DeliveryStatus.ASSIGNED && job.status !== DeliveryStatus.PICKED_UP)) return;
    if (job.providerStatus !== rawStatus || (trackingUrl && trackingUrl !== job.trackingUrl)) {
      await this.prisma.delivery.update({ where: { id: job.id }, data: { providerStatus: rawStatus, providerStatusAt: new Date(), ...(trackingUrl ? { trackingUrl } : {}) } });
    }

    if (status === 'delivered') {
      if (job.status === DeliveryStatus.PICKED_UP) {
        await this.delivery.courierConfirmedDelivered(job, `courier confirmed delivery (${job.courier?.name ?? 'courier'} ${job.providerRef ?? ''} ${rawStatus})`.replace(/\s+/g, ' ').trim());
      } else if (job.bookingError !== 'delivered-without-handover') {
        await this.prisma.delivery.update({ where: { id: job.id }, data: { bookingError: 'delivered-without-handover' } });
        await this.textOps(`Pilbridge ops: ${job.courier?.name ?? 'courier'} reports ${job.order.code} delivered, but the pharmacy never recorded the handover. Check now: ${appUrl(this.config)}/admin`);
      }
    } else if (status === 'cancelled') {
      if (job.status === DeliveryStatus.ASSIGNED) {
        await this.delivery.cancelCourier(null, job.code).catch(() => undefined);
        await this.textOps(`Pilbridge ops: ${job.courier?.name ?? 'courier'} cancelled ${job.order.code} before pickup. It's open for riders again: ${appUrl(this.config)}/admin`);
        this.riders.newJob(job.id);
      } else {
        await this.delivery.courierAbandoned(job, `${job.courier?.name ?? 'Courier'} cancelled after pickup`);
      }
    }
  }

  private async textOps(text: string) {
    const admins = await this.prisma.user.findMany({ where: { role: Role.PLATFORM_ADMIN, phone: { not: null } }, select: { phone: true } });
    for (const a of admins) await this.sms.sendText(a.phone!, text.slice(0, 300)).catch((e: unknown) => this.log.warn(`Ops text not sent: ${String(e)}`));
  }
}
