import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { appUrl } from '../common/app-url.js';
import { DeliveryStatus, OrderStatus, Role } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SmsService } from '../sms/sms.service.js';
import { areaByKey } from './areas.js';
import { CourierDispatchService } from './courier-dispatch.service.js';
import { CustomerAlertsService } from './customer-alerts.service.js';
import { arriveBy } from './eta.js';

/** A job nobody has accepted for this long needs a person to step in. */
export const STALE_JOB_MINUTES = 10;
const IN_FLIGHT: OrderStatus[] = [OrderStatus.PREPARING, OrderStatus.READY, OrderStatus.PICKED_UP];
const minutesSince = (d: Date, now: Date) => Math.max(0, Math.round((now.getTime() - d.getTime()) / 60_000));

/**
 * Watches deliveries for trouble, every LATE_CHECK_MS (default a minute): orders past their
 * promised time (the customer is texted) and jobs no rider has taken. New problems go to platform
 * admins as one short text; the admin page shows the live list.
 */
@Injectable()
export class DeliveryWatchService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(DeliveryWatchService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
    private readonly customers: CustomerAlertsService,
    private readonly config: ConfigService,
    private readonly couriers: CourierDispatchService,
  ) {}

  onApplicationBootstrap() {
    const every = Number(this.config.get('LATE_CHECK_MS') ?? 60_000);
    if (every > 0) {
      this.timer = setInterval(() => void this.check().catch((e: unknown) => this.log.error(`Delivery check failed: ${String(e)}`)), every);
      this.timer.unref();
    }
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  /** Flag new problems (each once), text the customers and the ops team. Returns the newly flagged order codes. */
  async check(now = new Date()) {
    // Courier statuses first (webhooks can be missed), so lateness is judged on fresh data.
    await this.couriers.sync().catch((e: unknown) => this.log.warn(`Courier status sync failed: ${String(e)}`));
    const late = await this.customers.checkLate(now);

    const cutoff = new Date(now.getTime() - STALE_JOB_MINUTES * 60_000);
    const stale = await this.prisma.delivery.findMany({
      where: { status: DeliveryStatus.AWAITING_RIDER, staleAlertAt: null, createdAt: { lte: cutoff } },
      select: { id: true, order: { select: { code: true } } },
      take: 200,
    });
    const unassigned: string[] = [];
    for (const d of stale) {
      const claimed = await this.prisma.delivery.updateMany({ where: { id: d.id, staleAlertAt: null }, data: { staleAlertAt: now } });
      if (claimed.count) unassigned.push(d.order.code);
    }

    if (late.length || unassigned.length) await this.textOps(late, unassigned);
    return { late, unassigned };
  }

  /** What's going wrong right now, for the admin page. */
  async snapshot(now = new Date()) {
    const [inFlight, open, courierJobs] = await Promise.all([
      this.prisma.order.findMany({
        where: { status: { in: IN_FLIGHT }, paidAt: { not: null }, etaMinutes: { not: null } },
        select: {
          code: true, status: true, paidAt: true, etaMinutes: true, deliveryArea: true,
          pharmacy: { select: { name: true, area: true } },
          deliveries: {
            orderBy: { createdAt: 'desc' }, take: 1,
            select: { code: true, status: true, rider: { select: { firstName: true, lastName: true, phone: true, riderProfile: { select: { partner: true } } } } },
          },
        },
        orderBy: { paidAt: 'asc' },
        take: 500,
      }),
      this.prisma.delivery.findMany({
        where: { status: DeliveryStatus.AWAITING_RIDER },
        select: {
          code: true, createdAt: true, coldChain: true, bookingError: true,
          order: { select: { code: true, status: true, deliveryArea: true, pharmacy: { select: { name: true, area: true } }, items: { select: { product: { select: { classification: true } } } } } },
        },
        orderBy: { createdAt: 'asc' },
        take: 300,
      }),
      this.prisma.delivery.findMany({
        where: { provider: 'COURIER', status: { in: [DeliveryStatus.ASSIGNED, DeliveryStatus.PICKED_UP] } },
        select: {
          code: true, status: true, providerRef: true, feeKobo: true, trackingUrl: true, assignedAt: true, pickedUpAt: true, providerStatus: true, bookingError: true,
          courier: { select: { name: true, contact: true, api: true } },
          order: { select: { code: true, status: true, deliveryArea: true, pharmacy: { select: { name: true, area: true } } } },
        },
        orderBy: { assignedAt: 'asc' },
      }),
    ]);

    const late = inFlight.flatMap((o) => {
      const due = arriveBy(o);
      if (!due || due > now) return [];
      const d = o.deliveries[0];
      const r = d?.rider;
      return [{
        order: o.code,
        status: o.status,
        dueAt: due,
        minutesLate: minutesSince(due, now),
        pharmacy: `${o.pharmacy.name}, ${o.pharmacy.area}`,
        dropoffArea: areaByKey(o.deliveryArea)?.name ?? null,
        delivery: d ? { code: d.code, status: d.status } : null,
        rider: r ? { name: [r.firstName, r.lastName].filter(Boolean).join(' '), phone: r.phone, partner: r.riderProfile?.partner ?? null } : null,
      }];
    });
    const queue = open.map((d) => ({
      order: d.order.code,
      orderStatus: d.order.status,
      delivery: d.code,
      waitingMinutes: minutesSince(d.createdAt, now),
      coldChain: d.coldChain,
      prescription: d.order.items.some((i) => i.product.classification === 'POM'),
      bookingError: d.bookingError,
      pharmacy: `${d.order.pharmacy.name}, ${d.order.pharmacy.area}`,
      dropoffArea: areaByKey(d.order.deliveryArea)?.name ?? null,
    }));
    return {
      late: late.sort((a, b) => b.minutesLate - a.minutesLate),
      unassigned: queue.filter((q) => q.waitingMinutes >= STALE_JOB_MINUTES),
      /** Every job without a rider or courier — ready ones first (book couriers when ready, to avoid waiting fees). */
      queue: queue.sort((a, b) => Number(b.orderStatus === 'READY') - Number(a.orderStatus === 'READY') || b.waitingMinutes - a.waitingMinutes),
      courierJobs: courierJobs.map((d) => ({
        delivery: d.code,
        status: d.status,
        order: d.order.code,
        orderStatus: d.order.status,
        courier: d.courier?.name ?? null,
        courierContact: d.courier?.contact ?? null,
        providerRef: d.providerRef,
        feeKobo: d.feeKobo,
        trackingUrl: d.trackingUrl,
        connected: !!d.courier?.api,
        providerStatus: d.providerStatus,
        warning: d.bookingError === 'delivered-without-handover' ? 'Courier reports delivered, but the pharmacy never recorded the handover' : null,
        pharmacy: `${d.order.pharmacy.name}, ${d.order.pharmacy.area}`,
        dropoffArea: areaByKey(d.order.deliveryArea)?.name ?? null,
      })),
    };
  }

  /** One short text to each platform admin, e.g. "Pilbridge ops: 2 late (PB-1, PB-2), 1 with no rider 10+ min (PB-3)." */
  private async textOps(late: string[], unassigned: string[]) {
    const admins = await this.prisma.user.findMany({ where: { role: Role.PLATFORM_ADMIN, phone: { not: null }, disabledAt: null }, select: { phone: true } });
    if (!admins.length) return;
    const list = (codes: string[]) => (codes.length > 3 ? `${codes.slice(0, 3).join(', ')} +${codes.length - 3} more` : codes.join(', '));
    const parts = [
      ...(late.length ? [`${late.length} late (${list(late)})`] : []),
      ...(unassigned.length ? [`${unassigned.length} with no rider ${STALE_JOB_MINUTES}+ min (${list(unassigned)})`] : []),
    ];
    const text = `Pilbridge ops: ${parts.join(', ')}. ${appUrl(this.config)}/admin`;
    for (const a of admins) {
      try {
        await this.sms.sendText(a.phone!, text);
      } catch (e) {
        this.log.warn(`Ops text not sent: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
}
