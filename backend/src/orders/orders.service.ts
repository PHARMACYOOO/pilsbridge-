import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { orderCode, withUniqueCode } from '../common/codes.js';
import { FEES } from '../common/fees.js';
import { sellableBatch } from '../catalog/catalog.controller.js';
import { BatchStatus, OrderStatus, PaymentStatus, PharmacyStatus, PrescriptionStatus, ProductClass, type Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { areaByKey } from '../delivery/areas.js';
import { DeliveryService } from '../delivery/delivery.service.js';
import { CourierDispatchService } from '../delivery/courier-dispatch.service.js';
import { distanceKm, etaMinutes as etaFor } from '../delivery/eta.js';
import { RiderAlertsService } from '../delivery/rider-alerts.service.js';
import type { CreateOrderDto } from './dto.js';
import { allocateFefo, canPharmacyMove, PATIENT_CANCELLABLE } from './order-status.js';
import { patientOrderInclude, pharmacyOrderInclude, present } from './present.js';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly delivery: DeliveryService,
    private readonly alerts: RiderAlertsService,
    private readonly couriers: CourierDispatchService,
  ) {}

  async create(user: AuthUser, dto: CreateOrderDto) {
    const patient = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!patient.firstName || !patient.lastName || !patient.consentAt) throw new ForbiddenException('Complete your profile before ordering');

    const ids = dto.items.map((i) => i.productId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Each product should appear once — adjust the quantity instead');

    const pharmacy = await this.prisma.pharmacy.findUnique({ where: { id: dto.pharmacyId } });
    if (!pharmacy || pharmacy.status !== PharmacyStatus.VERIFIED) throw new NotFoundException('Pharmacy not available');
    // No areas listed: the pharmacy delivers everywhere we do.
    if (pharmacy.coverageAreas.length && !pharmacy.coverageAreas.includes(dto.deliveryArea)) {
      throw new UnprocessableEntityException(`${pharmacy.name} doesn’t deliver to ${areaByKey(dto.deliveryArea)?.name ?? 'that area'} — choose another pharmacy`);
    }

    const products = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      include: { batches: { where: { ...sellableBatch(), pharmacyId: pharmacy.id }, orderBy: { expiresAt: 'asc' } } },
    });
    if (products.length !== ids.length) throw new NotFoundException('One or more products were not found');

    const lines = dto.items.map((item) => {
      const p = products.find((x) => x.id === item.productId)!;
      if (!p.deliveryAllowed) throw new UnprocessableEntityException(`${p.name} is pharmacy pickup only — it can’t be delivered`);
      if (p.classification === ProductClass.CONTROLLED) throw new UnprocessableEntityException(`${p.name} is a controlled medicine and can’t be ordered on Pilbridge`);
      if (p.coldChain && !pharmacy.coldChain) throw new UnprocessableEntityException(`${pharmacy.name} can’t fulfil cold-chain products like ${p.name}`);
      const available = p.batches.reduce((s, b) => s + b.quantity, 0);
      if (available < item.quantity) throw new UnprocessableEntityException(`Only ${available} pack(s) of ${p.name} available at ${pharmacy.name}`);
      // Price from the batch that FEFO would dispense first.
      return { product: p, quantity: item.quantity, unitPriceKobo: p.batches[0].priceKobo };
    });

    const needsRx = lines.some((l) => l.product.classification === ProductClass.POM);
    if (needsRx) {
      if (!dto.prescriptionId) throw new UnprocessableEntityException('A prescription is required for prescription-only medicines');
      const rx = await this.prisma.prescription.findUnique({ where: { id: dto.prescriptionId } });
      if (!rx || rx.patientId !== user.id) throw new NotFoundException('Prescription not found');
      if (rx.orderId) throw new ConflictException('This prescription is already attached to an order');
      if (rx.status !== PrescriptionStatus.PENDING) throw new UnprocessableEntityException('Upload a new prescription for this order');
    }

    const subtotalKobo = lines.reduce((s, l) => s + l.unitPriceKobo * l.quantity, 0);
    let deliveryKobo: number = lines.some((l) => l.product.coldChain) ? FEES.coldChainDeliveryKobo : FEES.deliveryKobo;
    if (dto.deliveryQuoteId) {
      // A live courier price from checkout — only for this pharmacy, this pin, and while fresh.
      const q = await this.prisma.deliveryQuote.findUnique({ where: { id: dto.deliveryQuoteId } });
      const samePin = q && dto.dropoffLat != null && dto.dropoffLng != null && distanceKm(q, { lat: dto.dropoffLat, lng: dto.dropoffLng }) < 0.05;
      if (!q || q.pharmacyId !== pharmacy.id || !samePin || q.expiresAt < new Date()) {
        throw new UnprocessableEntityException('The delivery price has expired — please check out again for an updated price');
      }
      deliveryKobo = q.priceKobo;
    }
    const totalKobo = subtotalKobo + deliveryKobo + FEES.serviceKobo;

    return withUniqueCode(orderCode, (code) =>
      this.prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            code,
            patientId: user.id,
            pharmacyId: pharmacy.id,
            status: needsRx ? OrderStatus.PHARMACIST_REVIEW : OrderStatus.ACCEPTED,
            deliveryAddress: dto.deliveryAddress.trim(),
            deliveryArea: dto.deliveryArea,
            dropoffLat: dto.dropoffLat ?? null,
            dropoffLng: dto.dropoffLng ?? null,
            // From the exact pin when we have it, otherwise the area's centre.
            etaMinutes: etaFor(pharmacy, dto.dropoffLat != null && dto.dropoffLng != null ? { lat: dto.dropoffLat, lng: dto.dropoffLng } : areaByKey(dto.deliveryArea)!),
            subtotalKobo,
            deliveryKobo,
            serviceKobo: FEES.serviceKobo,
            totalKobo,
            items: { create: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity, unitPriceKobo: l.unitPriceKobo })) },
          },
        });
        if (needsRx) {
          const linked = await tx.prescription.updateMany({ where: { id: dto.prescriptionId!, orderId: null }, data: { orderId: order.id } });
          if (linked.count === 0) throw new ConflictException('This prescription is already attached to an order');
        }
        await this.audit.record({ actorId: user.id, action: 'order.created', entityType: 'Order', entityId: order.id, metadata: { code, totalKobo } }, tx);
        return present(await tx.order.findUniqueOrThrow({ where: { id: order.id }, include: patientOrderInclude }));
      }),
    );
  }

  async listMine(user: AuthUser) {
    return (await this.prisma.order.findMany({ where: { patientId: user.id }, include: patientOrderInclude, orderBy: { createdAt: 'desc' } })).map(present);
  }

  async getMine(user: AuthUser, code: string) {
    const order = await this.prisma.order.findFirst({ where: { code, patientId: user.id }, include: patientOrderInclude });
    if (!order) throw new NotFoundException('Order not found');
    return present(order);
  }

  async cancelMine(user: AuthUser, code: string) {
    const order = await this.getMine(user, code);
    if (!PATIENT_CANCELLABLE.includes(order.status)) throw new ConflictException('This order is already being prepared — contact the pharmacy');
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({ where: { id: order.id, status: { in: PATIENT_CANCELLABLE } }, data: { status: OrderStatus.CANCELLED, statusNote: 'Cancelled by patient' } });
      if (claimed.count === 0) throw new ConflictException('This order is already being prepared — contact the pharmacy');
      const refund = await this.refundIfPaid(tx, order.id);
      await this.audit.record({ actorId: user.id, action: 'order.cancelled', entityType: 'Order', entityId: order.id, metadata: { by: 'patient', refundDue: refund } }, tx);
      return present(await tx.order.findUniqueOrThrow({ where: { id: order.id }, include: patientOrderInclude }));
    });
  }

  async listForPharmacy(user: AuthUser, status?: OrderStatus) {
    const orders = await this.prisma.order.findMany({
      where: { pharmacyId: user.pharmacyId!, ...(status ? { status } : {}) },
      include: pharmacyOrderInclude,
      orderBy: { createdAt: 'desc' },
    });
    return orders.map(present);
  }

  async move(user: AuthUser, code: string, to: OrderStatus, note?: string) {
    const order = await this.prisma.order.findFirst({ where: { code, pharmacyId: user.pharmacyId! }, include: { items: true } });
    if (!order) throw new NotFoundException('Order not found');
    if (to === OrderStatus.PREPARING && order.paymentStatus !== PaymentStatus.PAID) {
      throw new ConflictException('The patient hasn’t paid for this order yet');
    }
    if (!canPharmacyMove(order.status, to)) {
      throw new ConflictException(
        order.status === OrderStatus.PHARMACIST_REVIEW
          ? 'This order is waiting for a pharmacist to review the prescription'
          : `Can’t move an order from ${order.status} to ${to}`,
      );
    }

    let dispatched: string | null = null;
    let withdrawn: Awaited<ReturnType<DeliveryService['cancelActive']>> = [];
    const result = await this.prisma.$transaction(async (tx) => {
      // Optimistic lock: the status must still be what we read.
      const claimed = await tx.order.updateMany({
        where: { id: order.id, status: order.status, ...(to === OrderStatus.PREPARING ? { paymentStatus: PaymentStatus.PAID } : {}) },
        data: { status: to, statusNote: note ?? null },
      });
      if (claimed.count === 0) throw new ConflictException('This order was just updated by someone else — refresh and try again');
      // For reports: packing time and pickup punctuality.
      if (to === OrderStatus.PREPARING) await tx.order.update({ where: { id: order.id }, data: { preparingAt: new Date() } });
      if (to === OrderStatus.READY) await tx.order.updateMany({ where: { id: order.id, readyAt: null }, data: { readyAt: new Date() } });

      if (to === OrderStatus.PREPARING) {
        await this.allocate(tx, order.pharmacyId, order.items);
        // Call a rider now, so they travel while the order is packed.
        dispatched = (await this.delivery.dispatch(tx, order.id, user.id)).id;
      }
      if (to === OrderStatus.CANCELLED) {
        if (order.status === OrderStatus.PREPARING || order.status === OrderStatus.READY) {
          // A parcel that has been out with a rider never goes straight back on sale.
          const leftPharmacy = (await tx.delivery.count({ where: { orderId: order.id, pickedUpAt: { not: null } } })) > 0;
          if (leftPharmacy) await this.quarantineReturned(tx, order.code, order.items);
          else await this.restock(tx, order.items);
        }
        withdrawn = await this.delivery.cancelActive(tx, order.id);
      }
      const refundDue = to === OrderStatus.CANCELLED && (await this.refundIfPaid(tx, order.id));

      await this.audit.record({ actorId: user.id, action: 'order.status_changed', entityType: 'Order', entityId: order.id, metadata: { from: order.status, to, note: note ?? null, ...(refundDue ? { refundDue } : {}) } }, tx);
      return present(await tx.order.findUniqueOrThrow({ where: { id: order.id }, include: pharmacyOrderInclude }));
    });

    // Text riders once the change is saved.
    if (dispatched) this.alerts.newJob(dispatched);
    if (to === OrderStatus.READY) {
      this.alerts.ready(order.id);
      // Ready and still no rider: book a connected courier (when AUTO_BOOK_COURIERS=true).
      this.couriers.autoBook(order.id);
    }
    if (withdrawn.length) {
      this.alerts.cancelled(withdrawn);
      this.couriers.cancelAtProvider(withdrawn);
    }
    return result;
  }

  /** Reserve stock FEFO; an item spanning several batches is split into one line per batch. */
  private async allocate(tx: Prisma.TransactionClient, pharmacyId: string, items: { id: string; productId: string; quantity: number; unitPriceKobo: number; orderId: string }[]) {
    for (const item of items) {
      const batches = await tx.batch.findMany({ where: { ...sellableBatch(), pharmacyId, productId: item.productId } });
      const plan = allocateFefo(batches, item.quantity);
      if (!plan) throw new ConflictException('Not enough in-date stock to prepare this order — check inventory');

      for (const { batchId, take } of plan) {
        const res = await tx.batch.updateMany({ where: { id: batchId, quantity: { gte: take } }, data: { quantity: { decrement: take } } });
        if (res.count === 0) throw new ConflictException('Stock changed while preparing — try again');
      }
      const [first, ...rest] = plan;
      await tx.orderItem.update({ where: { id: item.id }, data: { batchId: first.batchId, quantity: first.take } });
      for (const a of rest) {
        await tx.orderItem.create({ data: { orderId: item.orderId, productId: item.productId, quantity: a.take, unitPriceKobo: item.unitPriceKobo, batchId: a.batchId } });
      }
    }
  }

  private async restock(tx: Prisma.TransactionClient, items: { batchId: string | null; quantity: number }[]) {
    for (const item of items) {
      if (item.batchId) await tx.batch.update({ where: { id: item.batchId }, data: { quantity: { increment: item.quantity } } });
    }
  }

  /**
   * Medicines that came back from a delivery go into their own quarantined batch, for a
   * pharmacist to inspect (seal, condition, temperature) before anything is sold again.
   */
  private async quarantineReturned(tx: Prisma.TransactionClient, orderCode: string, items: { batchId: string | null; quantity: number }[]) {
    for (const item of items) {
      if (!item.batchId) continue;
      const b = await tx.batch.findUniqueOrThrow({ where: { id: item.batchId } });
      const returned = await tx.batch.create({
        data: {
          pharmacyId: b.pharmacyId,
          productId: b.productId,
          batchNumber: `${b.batchNumber}-RTN-${orderCode}`,
          expiresAt: b.expiresAt,
          quantity: item.quantity,
          priceKobo: b.priceKobo,
          location: 'Returns shelf',
          status: BatchStatus.QUARANTINED,
          quarantineReason: `Returned from delivery of ${orderCode} — inspect before resale`,
        },
      });
      await this.audit.record({ actorId: null, action: 'batch.returned_to_quarantine', entityType: 'Batch', entityId: returned.id, metadata: { from: b.id, order: orderCode, quantity: item.quantity } }, tx);
    }
  }

  /** A cancelled order that was already paid needs its money back (refunded through Flutterwave). */
  private async refundIfPaid(tx: Prisma.TransactionClient, orderId: string) {
    const r = await tx.order.updateMany({ where: { id: orderId, paymentStatus: PaymentStatus.PAID }, data: { paymentStatus: PaymentStatus.REFUND_DUE } });
    return r.count > 0;
  }
}
