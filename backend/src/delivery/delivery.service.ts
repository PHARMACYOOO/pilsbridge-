import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { randomBytes, randomInt } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { DeliveryStatus, FailureCause, OrderStatus, type Prisma } from '../generated/prisma/client.js';
import { causeFromReason, COST_BEARER } from '../reports/cost.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { areaByKey } from './areas.js';
import { arriveBy, distanceKm, MAX_ACTIVE_JOBS, RIDER_RADIUS_KM } from './eta.js';
import { CustomerAlertsService } from './customer-alerts.service.js';
import { RiderAlertsService } from './rider-alerts.service.js';

const ACTIVE: DeliveryStatus[] = [DeliveryStatus.AWAITING_RIDER, DeliveryStatus.ASSIGNED, DeliveryStatus.PICKED_UP];
const MAX_CODE_ATTEMPTS = 5;

const jobInclude = {
  order: {
    select: {
      code: true, status: true, deliveryAddress: true, deliveryArea: true, paidAt: true, etaMinutes: true,
      pharmacy: { select: { name: true, area: true, address: true, lat: true, lng: true } },
      patient: { select: { firstName: true, phone: true } },
    },
  },
} satisfies Prisma.DeliveryInclude;
type Job = Prisma.DeliveryGetPayload<{ include: typeof jobInclude }>;

/**
 * Last-mile delivery, through two providers: our rider app (riders from vetted logistics partners
 * take jobs themselves) and courier companies booked by operations. A job opens the moment the
 * pharmacy starts preparing a paid order. Either way the pharmacy checks the seal code at handover
 * and delivery completes only with the customer's code (or a courier's proof of delivery).
 * Riders see a sealed parcel — never the contents or the prescription.
 */
@Injectable()
export class DeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly alerts: RiderAlertsService,
    private readonly customers: CustomerAlertsService,
  ) {}

  /** Offer a new job for this order to nearby riders. Called inside the order's own transaction. */
  async dispatch(tx: Prisma.TransactionClient, orderId: string, actorId: string) {
    const items = await tx.orderItem.findMany({ where: { orderId }, select: { product: { select: { coldChain: true } } } });
    const delivery = await tx.delivery.create({
      data: {
        code: `DL-${randomBytes(4).toString('hex').toUpperCase()}`,
        orderId,
        coldChain: items.some((i) => i.product.coldChain),
        dropoffCode: String(randomInt(0, 10_000)).padStart(4, '0'),
      },
    });
    await this.audit.record({ actorId, action: 'delivery.requested', entityType: 'Delivery', entityId: delivery.id, metadata: { orderId } }, tx);
    return delivery;
  }

  /** Withdraw any job still in progress for a cancelled order. Returns them, so their riders can be told once saved. */
  async cancelActive(tx: Prisma.TransactionClient, orderId: string) {
    const jobs = await tx.delivery.findMany({
      where: { orderId, status: { in: ACTIVE } },
      select: { code: true, riderId: true, provider: true, providerRef: true, courier: { select: { api: true } } },
    });
    await tx.delivery.updateMany({ where: { orderId, status: { in: ACTIVE } }, data: { status: DeliveryStatus.CANCELLED } });
    return jobs;
  }

  /** Pharmacy: book a new rider after a failed attempt brought the parcel back. */
  async rebook(user: AuthUser, orderCode: string) {
    const order = await this.prisma.order.findFirst({ where: { code: orderCode, pharmacyId: user.pharmacyId! }, include: { deliveries: { where: { status: { in: ACTIVE } } } } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== OrderStatus.READY && order.status !== OrderStatus.PREPARING) throw new ConflictException('Only orders being prepared or ready can be sent out');
    if (order.deliveries.length) throw new ConflictException('A rider is already booked for this order');
    const delivery = await this.prisma.$transaction((tx) => this.dispatch(tx, order.id, user.id));
    this.alerts.newJob(delivery.id);
    return delivery;
  }

  // ——— Riders ———

  async setStatus(user: AuthUser, online: boolean, area?: string) {
    await this.profile(user);
    await this.prisma.riderProfile.update({
      where: { userId: user.id },
      data: online ? { area, onlineSince: new Date() } : { area: null, onlineSince: null },
    });
    return this.jobs(user);
  }

  /** The rider's own jobs, and — while online — open jobs nearby, nearest first. */
  async jobs(user: AuthUser) {
    const profile = await this.profile(user);
    const mine = await this.prisma.delivery.findMany({
      where: { riderId: user.id, status: { in: [DeliveryStatus.ASSIGNED, DeliveryStatus.PICKED_UP] } },
      include: jobInclude,
      orderBy: { assignedAt: 'asc' },
    });
    const here = areaByKey(profile.area);
    let open: (ReturnType<DeliveryService['view']> & { toPickupKm: number })[] = [];
    if (profile.onlineSince && here) {
      const waiting = await this.prisma.delivery.findMany({
        where: { status: DeliveryStatus.AWAITING_RIDER, ...(profile.coldChain ? {} : { coldChain: false }) },
        include: jobInclude,
        orderBy: { createdAt: 'asc' },
        take: 100,
      });
      open = waiting
        .flatMap((d) => {
          const ph = d.order.pharmacy;
          if (ph.lat == null || ph.lng == null) return [];
          const toPickupKm = distanceKm(here, { lat: ph.lat, lng: ph.lng });
          return toPickupKm <= RIDER_RADIUS_KM ? [{ ...this.view(d, false), toPickupKm: Math.round(toPickupKm * 10) / 10 }] : [];
        })
        .sort((a, b) => a.toPickupKm - b.toPickupKm);
    }
    return {
      rider: { partner: profile.partner, coldChain: profile.coldChain, online: !!profile.onlineSince, area: profile.area },
      mine: mine.map((d) => this.view(d, true)),
      open,
    };
  }

  /** First rider to accept gets the job. */
  async accept(user: AuthUser, code: string) {
    const profile = await this.profile(user);
    if (!profile.onlineSince) throw new ConflictException('Go online to take jobs');
    const active = await this.prisma.delivery.count({ where: { riderId: user.id, status: { in: [DeliveryStatus.ASSIGNED, DeliveryStatus.PICKED_UP] } } });
    if (active >= MAX_ACTIVE_JOBS) throw new ConflictException(`You can carry up to ${MAX_ACTIVE_JOBS} jobs at a time`);
    const job = await this.prisma.delivery.findUnique({ where: { code } });
    if (!job) throw new NotFoundException('Job not found');
    if (job.coldChain && !profile.coldChain) throw new ForbiddenException('This job needs a cold box');

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.delivery.updateMany({
        where: { id: job.id, status: DeliveryStatus.AWAITING_RIDER },
        data: { status: DeliveryStatus.ASSIGNED, riderId: user.id, assignedAt: new Date() },
      });
      if (claimed.count === 0) throw new ConflictException('Another rider has just taken this job');
      await this.audit.record({ actorId: user.id, action: 'delivery.assigned', entityType: 'Delivery', entityId: job.id }, tx);
      return this.view(await tx.delivery.findUniqueOrThrow({ where: { id: job.id }, include: jobInclude }), true);
    });
  }

  /** Hand a job back before pickup (e.g. breakdown): it's offered to other riders again. */
  async release(user: AuthUser, code: string) {
    const job = await this.mine(user, code);
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.delivery.updateMany({
        where: { id: job.id, riderId: user.id, status: DeliveryStatus.ASSIGNED },
        data: { status: DeliveryStatus.AWAITING_RIDER, riderId: null, assignedAt: null },
      });
      if (r.count === 0) throw new ConflictException('You can only hand back a job before collecting the parcel');
      await this.audit.record({ actorId: user.id, action: 'delivery.released', entityType: 'Delivery', entityId: job.id }, tx);
    });
    this.alerts.newJob(job.id, user.id);
    return { released: true };
  }

  /**
   * Pharmacy handover: the rider (or courier) shows the job's seal code, the pharmacy checks it
   * matches the parcel and records the handover. Riders can't mark a parcel collected themselves.
   */
  async handover(user: AuthUser, orderCode: string, sealCode: string) {
    const order = await this.prisma.order.findFirst({
      where: { code: orderCode, pharmacyId: user.pharmacyId! },
      include: { deliveries: { where: { status: DeliveryStatus.ASSIGNED }, take: 1 } },
    });
    if (!order) throw new NotFoundException('Order not found');
    const job = order.deliveries[0];
    if (!job) throw new ConflictException('No rider or courier is booked for this order yet');
    if (order.status !== OrderStatus.READY) throw new ConflictException('Mark the order ready before handing it over');
    const typed = sealCode.trim().toUpperCase().replace(/\s+/g, '');
    if (typed !== job.code && `DL-${typed}` !== job.code) {
      throw new UnprocessableEntityException('That seal code doesn’t match this parcel — don’t hand it over. Check the rider’s job and the label.');
    }
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({ where: { id: order.id, status: OrderStatus.READY }, data: { status: OrderStatus.PICKED_UP, statusNote: null } });
      if (claimed.count === 0) throw new ConflictException('This order was just updated — refresh and try again');
      const r = await tx.delivery.updateMany({
        where: { id: job.id, status: DeliveryStatus.ASSIGNED },
        data: { status: DeliveryStatus.PICKED_UP, pickedUpAt: new Date(), handedOverById: user.id },
      });
      if (r.count === 0) throw new ConflictException('This job was just updated — refresh and try again');
      await this.audit.record({ actorId: user.id, action: 'delivery.handed_over', entityType: 'Delivery', entityId: job.id, metadata: { provider: job.provider } }, tx);
    });
    this.customers.onTheWay(order.id);
    return { handedOver: job.code };
  }

  /** Rider hand-over — only with the 4-digit code the recipient has. No code, no completed delivery. */
  async delivered(user: AuthUser, code: string, dropoffCode: string) {
    const job = await this.mine(user, code);
    if (job.status !== DeliveryStatus.PICKED_UP) throw new ConflictException('The pharmacy hasn’t handed you this parcel yet');
    await this.checkDropoffCode(job, dropoffCode);
    await this.finishDelivered(job, user.id, 'customer code');
    return this.view(await this.prisma.delivery.findUniqueOrThrow({ where: { id: job.id }, include: jobInclude }), true);
  }

  /** Rider couldn't hand over: the parcel goes back to the pharmacy (still sealed) and can be rebooked. */
  async failed(user: AuthUser, code: string, reason: string, cause?: FailureCause) {
    const job = await this.mine(user, code);
    await this.finishFailed(job, user.id, reason, cause ?? causeFromReason(reason), { riderId: user.id });
    return { failed: true };
  }

  // ——— Courier bookings (operations) ———

  /**
   * Book an open job with a courier company — on their dashboard or API — and record it here. Only
   * couriers that have accepted the parcel's categories in writing can be used.
   */
  async bookCourier(admin: AuthUser, code: string, dto: { courierId: string; providerRef: string; feeKobo?: number; trackingUrl?: string }) {
    const job = await this.prisma.delivery.findUnique({ where: { code }, include: { order: { include: { items: { include: { product: { select: { classification: true } } } } } } } });
    if (!job) throw new NotFoundException('Job not found');
    if (job.status !== DeliveryStatus.AWAITING_RIDER) throw new ConflictException('This job already has a rider or courier');
    const courier = await this.prisma.courier.findUnique({ where: { id: dto.courierId } });
    if (!courier?.active) throw new NotFoundException('Courier not found or not active');
    if (job.coldChain && !courier.acceptsColdChain) throw new UnprocessableEntityException(`${courier.name} hasn’t been approved for cold-chain parcels`);
    if (job.order.items.some((i) => i.product.classification === 'POM') && !courier.acceptsPrescription) {
      throw new UnprocessableEntityException(`${courier.name} hasn’t accepted prescription-only parcels in writing`);
    }
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.delivery.updateMany({
        where: { id: job.id, status: DeliveryStatus.AWAITING_RIDER },
        data: {
          status: DeliveryStatus.ASSIGNED,
          provider: 'COURIER',
          courierId: courier.id,
          providerRef: dto.providerRef.trim(),
          feeKobo: dto.feeKobo ?? null,
          trackingUrl: dto.trackingUrl?.trim() || null,
          assignedAt: new Date(),
        },
      });
      if (r.count === 0) throw new ConflictException('A rider has just taken this job');
      await this.audit.record({ actorId: admin.id, action: 'delivery.courier_booked', entityType: 'Delivery', entityId: job.id, metadata: { courier: courier.name, providerRef: dto.providerRef.trim(), feeKobo: dto.feeKobo ?? null } }, tx);
    });
    return this.prisma.delivery.findUniqueOrThrow({ where: { id: job.id } });
  }

  /** The courier didn't come (or cancelled): put the job back on the open board (riders are texted). */
  async cancelCourier(admin: AuthUser | null, code: string) {
    const job = await this.courierJob(code);
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.delivery.updateMany({
        where: { id: job.id, status: DeliveryStatus.ASSIGNED },
        data: { status: DeliveryStatus.AWAITING_RIDER, provider: 'PILBRIDGE_RIDERS', courierId: null, providerRef: null, feeKobo: null, trackingUrl: null, assignedAt: null },
      });
      if (r.count === 0) throw new ConflictException('Only a booking that hasn’t been collected can be cancelled');
      await this.audit.record({ actorId: admin?.id ?? null, action: 'delivery.courier_cancelled', entityType: 'Delivery', entityId: job.id }, tx);
    });
    this.alerts.newJob(job.id);
    return { cancelled: true };
  }

  /** Courier delivered: with the customer's code (read back by the courier) or the courier's own proof of delivery. */
  async courierDelivered(admin: AuthUser, code: string, dto: { customerCode?: string; courierProof?: string }) {
    const job = await this.courierJob(code);
    if (job.status !== DeliveryStatus.PICKED_UP) throw new ConflictException('The pharmacy hasn’t handed this parcel over yet');
    if (dto.customerCode) await this.checkDropoffCode(job, dto.customerCode);
    else if (!dto.courierProof?.trim()) throw new UnprocessableEntityException('Enter the customer’s code or the courier’s proof-of-delivery reference');
    await this.finishDelivered(job, admin.id, dto.customerCode ? 'customer code' : `courier proof: ${dto.courierProof!.trim()}`);
    return this.prisma.delivery.findUniqueOrThrow({ where: { id: job.id } });
  }

  async courierFailed(admin: AuthUser, code: string, reason: string, cause?: FailureCause) {
    const job = await this.courierJob(code);
    await this.finishFailed(job, admin.id, reason, cause ?? causeFromReason(reason), {});
    return { failed: true };
  }

  /** The courier's API says it's delivered. Only after the pharmacy recorded the handover. */
  async courierConfirmedDelivered(job: { id: string; orderId: string }, proof: string) {
    await this.finishDelivered(job, null, proof);
  }

  /** The courier's API cancelled a parcel it had already collected: it comes back to the pharmacy. */
  async courierAbandoned(job: { id: string; orderId: string }, reason: string) {
    await this.finishFailed(job, null, reason, FailureCause.COURIER_FAULT, {});
  }

  private async courierJob(code: string) {
    const job = await this.prisma.delivery.findUnique({ where: { code } });
    if (!job || job.provider !== 'COURIER') throw new NotFoundException('Courier booking not found');
    return job;
  }

  private async checkDropoffCode(job: { id: string; dropoffCode: string; codeAttempts: number }, typed: string) {
    if (job.codeAttempts >= MAX_CODE_ATTEMPTS) throw new ForbiddenException('Too many wrong codes — call support to complete this delivery');
    if (job.dropoffCode !== typed.trim()) {
      await this.prisma.delivery.update({ where: { id: job.id }, data: { codeAttempts: { increment: 1 } } });
      throw new UnprocessableEntityException('That code doesn’t match — ask the customer to check it on their tracking page');
    }
  }

  private async finishDelivered(job: { id: string; orderId: string }, actorId: string | null, proof: string) {
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.delivery.updateMany({ where: { id: job.id, status: DeliveryStatus.PICKED_UP }, data: { status: DeliveryStatus.DELIVERED, deliveredAt: new Date(), proof } });
      if (r.count === 0) throw new ConflictException('This delivery was just updated');
      await tx.order.update({ where: { id: job.orderId }, data: { status: OrderStatus.DELIVERED, statusNote: null } });
      await this.audit.record({ actorId, action: 'delivery.delivered', entityType: 'Delivery', entityId: job.id, metadata: { proof } }, tx);
    });
  }

  private async finishFailed(job: { id: string; orderId: string }, actorId: string | null, reason: string, cause: FailureCause, where: Prisma.DeliveryWhereInput) {
    const why = reason.trim();
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.delivery.updateMany({
        where: { id: job.id, status: DeliveryStatus.PICKED_UP, ...where },
        data: { status: DeliveryStatus.FAILED, failedAt: new Date(), failReason: why, failureCause: cause, costBearer: COST_BEARER[cause] },
      });
      if (r.count === 0) throw new ConflictException('Only a parcel that has left the pharmacy can be marked as not delivered');
      await tx.order.update({ where: { id: job.orderId }, data: { status: OrderStatus.READY, statusNote: `Delivery attempt failed: ${why}. Returning to the pharmacy.` } });
      await this.audit.record({ actorId, action: 'delivery.failed', entityType: 'Delivery', entityId: job.id, metadata: { reason: why, cause, costBearer: COST_BEARER[cause] } }, tx);
    });
    this.customers.failed(job.orderId, why);
  }

  private async profile(user: AuthUser) {
    const profile = await this.prisma.riderProfile.findUnique({ where: { userId: user.id } });
    if (!profile) throw new ForbiddenException('This account isn’t set up as a rider');
    if (!profile.active) throw new ForbiddenException('Your rider account is paused — contact your logistics partner');
    return profile;
  }

  private async mine(user: AuthUser, code: string) {
    const job = await this.prisma.delivery.findUnique({ where: { code } });
    if (!job || job.riderId !== user.id) throw new NotFoundException('Job not found');
    return job;
  }

  /**
   * What a rider sees. Before accepting: pickup point and drop-off area only. After: the address,
   * the recipient's first name and number to call. Never the items or the prescription.
   */
  private view(d: Job, assigned: boolean) {
    const o = d.order;
    const area = areaByKey(o.deliveryArea);
    const ph = o.pharmacy;
    return {
      code: d.code,
      status: d.status,
      coldChain: d.coldChain,
      order: o.code,
      orderStatus: o.status,
      createdAt: d.createdAt,
      arriveBy: arriveBy(o),
      pickup: { name: ph.name, area: ph.area, address: ph.address },
      dropoff: {
        area: area?.name ?? null,
        tripKm: area && ph.lat != null && ph.lng != null ? Math.round(distanceKm({ lat: ph.lat, lng: ph.lng }, area) * 10) / 10 : null,
        ...(assigned ? { address: o.deliveryAddress, recipient: o.patient.firstName, phone: o.patient.phone } : {}),
      },
    };
  }
}
