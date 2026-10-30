import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { isUniqueViolation } from '../common/codes.js';
import { arriveBy } from '../delivery/eta.js';
import { InvoiceStatus, type Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateInvoiceDto } from './dto.js';
import { reconcile } from './reconcile.js';
import { breakdown, summarise, TARGETS, type DeliveryRow } from './summarise.js';

/** Days are Lagos days (UTC+1, no daylight saving). */
const lagosDayStart = (day: string) => new Date(`${day}T00:00:00+01:00`);
const DAY = 24 * 60 * 60_000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const lagosToday = () => new Date(Date.now() + 60 * 60_000).toISOString().slice(0, 10);

const rowInclude = {
  courier: { select: { name: true } },
  order: {
    select: {
      code: true, paidAt: true, etaMinutes: true, preparingAt: true, readyAt: true, deliveryKobo: true, deliveryArea: true,
      pharmacy: { select: { name: true } },
    },
  },
} satisfies Prisma.DeliveryInclude;

/** Delivery performance reports and courier invoice reconciliation, for operations and finance. */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** [from, to] in Lagos days, inclusive; the last 7 days by default. */
  period(from?: string, to?: string) {
    const end = to ?? lagosToday();
    const start = from ?? new Date(lagosDayStart(end).getTime() - 6 * DAY + 60 * 60_000).toISOString().slice(0, 10);
    if (!ISO_DAY.test(start) || !ISO_DAY.test(end)) throw new BadRequestException('Dates look like 2026-10-12');
    const gte = lagosDayStart(start);
    const lt = new Date(lagosDayStart(end).getTime() + DAY);
    if (lt <= gte) throw new BadRequestException('The start date must be before the end date');
    if (lt.getTime() - gte.getTime() > 366 * DAY) throw new BadRequestException('Choose a period of a year or less');
    return { from: start, to: end, gte, lt };
  }

  /** One row per delivery attempt created in the period. */
  async rows(gte: Date, lt: Date): Promise<DeliveryRow[]> {
    const ds = await this.prisma.delivery.findMany({ where: { createdAt: { gte, lt } }, include: rowInclude, orderBy: { createdAt: 'asc' } });
    return ds.map((d) => ({
      code: d.code,
      orderCode: d.order.code,
      provider: d.provider === 'COURIER' ? (d.courier?.name ?? 'Courier') : 'Pilbridge riders',
      pharmacy: d.order.pharmacy.name,
      area: d.order.deliveryArea,
      status: d.status,
      createdAt: d.createdAt,
      assignedAt: d.assignedAt,
      pickedUpAt: d.pickedUpAt,
      deliveredAt: d.deliveredAt,
      paidAt: d.order.paidAt,
      preparingAt: d.order.preparingAt,
      readyAt: d.order.readyAt,
      arriveBy: arriveBy(d.order),
      feeKobo: d.feeKobo,
      deliveryKobo: d.order.deliveryKobo,
      proof: d.proof,
      failureCause: d.failureCause,
      costBearer: d.costBearer,
    }));
  }

  async delivery(from?: string, to?: string) {
    const p = this.period(from, to);
    const rows = await this.rows(p.gte, p.lt);
    const incidents = await this.prisma.incident.groupBy({ by: ['type'], where: { createdAt: { gte: p.gte, lt: p.lt } }, _count: true });
    return {
      period: { from: p.from, to: p.to },
      targets: TARGETS,
      overall: summarise(rows),
      byProvider: breakdown(rows, (r) => r.provider),
      byPharmacy: breakdown(rows, (r) => r.pharmacy),
      incidents: incidents.map((i) => ({ type: i.type, count: i._count })).sort((a, b) => b.count - a.count),
    };
  }

  /** Every delivery attempt in the period, for finance spreadsheets. */
  async csv(from?: string, to?: string) {
    const p = this.period(from, to);
    const rows = await this.rows(p.gte, p.lt);
    const iso = (d: Date | null) => (d ? d.toISOString() : '');
    const naira = (k: number | null) => (k == null ? '' : (k / 100).toFixed(2));
    const header = ['delivery', 'order', 'provider', 'pharmacy', 'area', 'status', 'created', 'assigned', 'picked_up', 'delivered', 'due_by', 'on_time', 'courier_fee_ngn', 'customer_delivery_ngn', 'proof', 'failure_cause', 'cost_bearer'];
    const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = rows.map((r) =>
      [
        r.code, r.orderCode, r.provider, r.pharmacy, r.area ?? '', r.status, iso(r.createdAt), iso(r.assignedAt), iso(r.pickedUpAt), iso(r.deliveredAt), iso(r.arriveBy),
        r.deliveredAt && r.arriveBy ? String(r.deliveredAt <= r.arriveBy) : '', naira(r.feeKobo), naira(r.deliveryKobo), r.proof ?? '', r.failureCause ?? '', r.costBearer ?? '',
      ].map(cell).join(','),
    );
    return { filename: `pilbridge-deliveries-${p.from}-to-${p.to}.csv`, body: [header.join(','), ...lines].join('\n') + '\n' };
  }

  // ——— Courier invoices ———

  async createInvoice(admin: AuthUser, courierId: string, dto: CreateInvoiceDto) {
    if (!(await this.prisma.courier.findUnique({ where: { id: courierId }, select: { id: true } }))) throw new NotFoundException('Courier not found');
    const start = new Date(`${dto.periodStart.slice(0, 10)}T00:00:00+01:00`);
    const end = new Date(`${dto.periodEnd.slice(0, 10)}T00:00:00+01:00`);
    if (end < start) throw new BadRequestException('The period ends before it starts');
    try {
      const inv = await this.prisma.courierInvoice.create({
        data: {
          courierId,
          number: dto.number.trim(),
          periodStart: start,
          periodEnd: end,
          totalKobo: dto.lines.reduce((s, l) => s + l.amountKobo, 0),
          createdById: admin.id,
          lines: { create: dto.lines.map((l) => ({ providerRef: l.providerRef.trim(), amountKobo: l.amountKobo })) },
        },
      });
      await this.audit.record({ actorId: admin.id, action: 'invoice.entered', entityType: 'CourierInvoice', entityId: inv.id, metadata: { number: inv.number, totalKobo: inv.totalKobo, lines: dto.lines.length } });
      return this.invoice(inv.id);
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('This courier already has an invoice with that number');
      throw e;
    }
  }

  async invoices() {
    const list = await this.prisma.courierInvoice.findMany({
      include: { courier: { select: { name: true } }, _count: { select: { lines: true } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 100,
    });
    return list.map(({ _count, ...i }) => ({ ...i, lines: _count.lines }));
  }

  /** The invoice, checked line by line against our deliveries with that courier. */
  async invoice(id: string) {
    const inv = await this.prisma.courierInvoice.findUnique({ where: { id }, include: { lines: true, courier: { select: { id: true, name: true } } } });
    if (!inv) throw new NotFoundException('Invoice not found');
    const periodEndExclusive = new Date(inv.periodEnd.getTime() + DAY);
    const refs = inv.lines.map((l) => l.providerRef);
    const ours = await this.prisma.delivery.findMany({
      where: { courierId: inv.courierId, OR: [{ providerRef: { in: refs } }, { assignedAt: { gte: inv.periodStart, lt: periodEndExclusive } }] },
      include: { order: { select: { code: true } } },
    });
    const result = reconcile(
      inv.lines.map((l) => ({ providerRef: l.providerRef, amountKobo: l.amountKobo })),
      ours.map((d) => ({
        code: d.code,
        orderCode: d.order.code,
        providerRef: d.providerRef,
        status: d.status,
        feeKobo: d.feeKobo,
        pickedUpAt: d.pickedUpAt,
        costBearer: d.costBearer,
        inPeriod: !!d.assignedAt && d.assignedAt >= inv.periodStart && d.assignedAt < periodEndExclusive,
      })),
    );
    const { lines: _lines, ...head } = inv;
    void _lines;
    return { ...head, ...result };
  }

  async markReconciled(admin: AuthUser, id: string, note?: string) {
    const inv = await this.prisma.courierInvoice.findUnique({ where: { id } });
    if (!inv) throw new NotFoundException('Invoice not found');
    const r = await this.prisma.courierInvoice.updateMany({
      where: { id, status: InvoiceStatus.OPEN },
      data: { status: InvoiceStatus.RECONCILED, reconciledAt: new Date(), reconciledById: admin.id, note: note?.trim() || null },
    });
    if (r.count === 0) throw new ConflictException('This invoice is already reconciled');
    const checked = await this.invoice(id);
    await this.audit.record({ actorId: admin.id, action: 'invoice.reconciled', entityType: 'CourierInvoice', entityId: id, metadata: { payableKobo: checked.totals.payableKobo, disputedKobo: checked.totals.disputedKobo, note: note ?? null } });
    return checked;
  }
}
