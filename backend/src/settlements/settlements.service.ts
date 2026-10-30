import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { payoutCode, withUniqueCode } from '../common/codes.js';
import { BANK_CHANGE_HOLD_HOURS } from '../common/fees.js';
import { DeliveryStatus, OrderStatus, PaymentStatus, PayoutStatus, type Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StaffTextsService } from '../sms/staff-texts.service.js';
import { commissionKobo, ngn, settle } from './money.js';

const HOUR = 60 * 60_000;
/** Lagos days (UTC+1, no daylight saving). */
const lagosDayStart = (day: string) => new Date(`${day}T00:00:00+01:00`);
const lagosToday = () => new Date(Date.now() + HOUR).toISOString().slice(0, 10);

/** Delivered, paid and not yet settled — optionally only deliveries before a cutoff. */
const payable = (before?: Date): Prisma.OrderWhereInput => ({
  status: OrderStatus.DELIVERED,
  paymentStatus: PaymentStatus.PAID,
  payoutId: null,
  deliveries: { some: { status: DeliveryStatus.DELIVERED, ...(before ? { deliveredAt: { lt: before } } : {}) } },
});

const orderLine = {
  id: true, code: true, subtotalKobo: true, pharmacyId: true,
  deliveries: { where: { status: DeliveryStatus.DELIVERED }, select: { deliveredAt: true }, take: 1 },
} satisfies Prisma.OrderSelect;
type Line = Prisma.OrderGetPayload<{ select: typeof orderLine }>;
const lineView = (o: Line) => ({ code: o.code, deliveredAt: o.deliveries[0]?.deliveredAt ?? null, subtotalKobo: o.subtotalKobo, feesKobo: commissionKobo(o.subtotalKobo), netKobo: o.subtotalKobo - commissionKobo(o.subtotalKobo) });

function byPharmacy<T extends { pharmacyId: string }>(rows: T[]) {
  const out = new Map<string, T[]>();
  for (const r of rows) out.set(r.pharmacyId, [...(out.get(r.pharmacyId) ?? []), r]);
  return out;
}

const mask = (n: string | null) => (n ? `••••••${n.slice(-4)}` : null);

/**
 * Paying pharmacies for what they sell. Each delivered, paid order is settled exactly once: an
 * admin groups the unsettled ones into a payout per pharmacy (goods subtotal less commission),
 * pays it by bank transfer, then records the reference. A payout can only be marked paid to a
 * verified account that hasn't changed in the last 48 hours.
 */
@Injectable()
export class SettlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly texts: StaffTextsService,
  ) {}

  /** When a pharmacy's account becomes payable, or why it isn't. */
  private bankState(ph: { bankAccountNumber: string | null; bankUpdatedAt: Date | null; bankVerifiedAt: Date | null }, now = new Date()) {
    if (!ph.bankAccountNumber || !ph.bankUpdatedAt) return { payable: false, reason: 'No settlement account added', holdUntil: null };
    if (!ph.bankVerifiedAt) return { payable: false, reason: 'Account waiting for Pilbridge to verify it', holdUntil: null };
    const holdUntil = new Date(ph.bankUpdatedAt.getTime() + BANK_CHANGE_HOLD_HOURS * HOUR);
    if (holdUntil > now) return { payable: false, reason: `New account: payouts resume after the ${BANK_CHANGE_HOLD_HOURS}-hour hold`, holdUntil };
    return { payable: true, reason: null, holdUntil: null };
  }

  // ——— Pharmacy ———

  async overview(user: AuthUser) {
    const me = user.pharmacyId!;
    const [ph, unsettled, payouts] = await Promise.all([
      this.prisma.pharmacy.findUniqueOrThrow({ where: { id: me }, select: { bankName: true, bankAccountName: true, bankAccountNumber: true, bankUpdatedAt: true, bankVerifiedAt: true } }),
      this.prisma.order.findMany({ where: { ...payable(), pharmacyId: me }, select: orderLine }),
      this.prisma.payout.findMany({ where: { pharmacyId: me, status: { not: PayoutStatus.VOID } }, orderBy: { createdAt: 'desc' }, take: 52 }),
    ]);
    return {
      unsettled: settle(unsettled),
      payouts: payouts.map((p) => ({ ...p, bankAccountNumber: mask(p.bankAccountNumber) })),
      bank: { bankName: ph.bankName, accountName: ph.bankAccountName, accountNumber: mask(ph.bankAccountNumber), verified: !!ph.bankVerifiedAt, ...this.bankState(ph) },
    };
  }

  /** One payout's orders, for the pharmacy's own records. Unsettled orders: code "unsettled". */
  async payoutForPharmacy(user: AuthUser, code: string) {
    const me = user.pharmacyId!;
    if (code === 'unsettled') {
      const orders = await this.prisma.order.findMany({ where: { ...payable(), pharmacyId: me }, select: orderLine, orderBy: { createdAt: 'asc' } });
      return { code, status: null, ...settle(orders), orders: orders.map(lineView) };
    }
    const p = await this.prisma.payout.findFirst({ where: { code, pharmacyId: me }, include: { orders: { select: orderLine, orderBy: { createdAt: 'asc' } } } });
    if (!p) throw new NotFoundException('Payout not found');
    const { orders, ...rest } = p;
    return { ...rest, bankAccountNumber: mask(rest.bankAccountNumber), orders: orders.map(lineView) };
  }

  // ——— Admin ———

  private cutoff(before?: string) {
    const day = before ?? lagosToday();
    const at = lagosDayStart(day);
    if (Number.isNaN(at.getTime())) throw new BadRequestException('Dates look like 2026-10-19');
    if (day > lagosToday()) throw new BadRequestException('Choose today or an earlier day — deliveries after it haven’t happened yet');
    return at;
  }

  /** What each pharmacy would be paid for deliveries before the cutoff, without creating anything. */
  async preview(before?: string) {
    const at = this.cutoff(before);
    const orders = await this.prisma.order.findMany({ where: payable(at), select: orderLine });
    const grouped = byPharmacy(orders);
    const pharmacies = await this.prisma.pharmacy.findMany({ where: { id: { in: [...grouped.keys()] } }, select: { id: true, name: true, bankAccountNumber: true, bankUpdatedAt: true, bankVerifiedAt: true } });
    return {
      before: at,
      pharmacies: pharmacies.map((ph) => ({ pharmacy: { id: ph.id, name: ph.name }, ...settle(grouped.get(ph.id)!), bank: this.bankState(ph) })),
    };
  }

  /** One payout per pharmacy with unsettled deliveries before the cutoff. */
  async create(admin: AuthUser, before?: string) {
    const at = this.cutoff(before);
    const orders = await this.prisma.order.findMany({ where: payable(at), select: orderLine });
    const created: string[] = [];
    for (const [pharmacyId, lines] of byPharmacy(orders)) {
      const totals = settle(lines);
      const delivered = lines.map((l) => l.deliveries[0]?.deliveredAt?.getTime() ?? at.getTime());
      const payout = await withUniqueCode(payoutCode, (code) =>
        this.prisma.$transaction(async (tx) => {
          const p = await tx.payout.create({ data: { code, pharmacyId, periodStart: new Date(Math.min(...delivered)), periodEnd: at, ...totals, createdById: admin.id } });
          // Each order is settled once: if another run took any of them first, this payout is rolled back.
          const linked = await tx.order.updateMany({ where: { id: { in: lines.map((l) => l.id) }, payoutId: null }, data: { payoutId: p.id } });
          if (linked.count !== lines.length) throw new ConflictException('Payouts are being created by someone else right now — refresh and check');
          await this.audit.record({ actorId: admin.id, action: 'payout.created', entityType: 'Payout', entityId: p.id, metadata: { code, pharmacyId, ...totals } }, tx);
          return p;
        }),
      );
      created.push(payout.id);
    }
    return this.list(undefined, created);
  }

  async list(status?: PayoutStatus, ids?: string[]) {
    const payouts = await this.prisma.payout.findMany({
      where: { ...(status ? { status } : {}), ...(ids ? { id: { in: ids } } : {}) },
      include: { pharmacy: { select: { id: true, name: true, bankName: true, bankAccountName: true, bankAccountNumber: true, bankUpdatedAt: true, bankVerifiedAt: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const now = new Date();
    return payouts.map(({ pharmacy: { bankUpdatedAt, bankVerifiedAt, ...pharmacy }, ...p }) => ({
      ...p,
      pharmacy,
      bank: this.bankState({ bankAccountNumber: pharmacy.bankAccountNumber, bankUpdatedAt, bankVerifiedAt }, now),
    }));
  }

  async payout(id: string) {
    const p = await this.prisma.payout.findUnique({ where: { id }, include: { pharmacy: { select: { id: true, name: true } }, orders: { select: orderLine, orderBy: { createdAt: 'asc' } } } });
    if (!p) throw new NotFoundException('Payout not found');
    return { ...p, orders: p.orders.map(lineView) };
  }

  /** After the bank transfer: records the reference and the account it went to. */
  async markPaid(admin: AuthUser, id: string, reference: string) {
    const p = await this.prisma.payout.findUnique({ where: { id }, include: { pharmacy: true } });
    if (!p) throw new NotFoundException('Payout not found');
    if (p.status !== PayoutStatus.SCHEDULED) throw new ConflictException('This payout is already closed');
    const ph = p.pharmacy;
    const bank = this.bankState(ph);
    if (!bank.payable) throw new UnprocessableEntityException(bank.reason!);

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.payout.updateMany({
        where: { id, status: PayoutStatus.SCHEDULED },
        data: { status: PayoutStatus.PAID, paidAt: new Date(), paidById: admin.id, reference: reference.trim(), bankName: ph.bankName, bankAccountName: ph.bankAccountName, bankAccountNumber: ph.bankAccountNumber },
      });
      if (claimed.count === 0) throw new ConflictException('Someone else just updated this payout');
      // The account must still be the one that was checked above.
      const same = await tx.pharmacy.count({ where: { id: ph.id, bankAccountNumber: ph.bankAccountNumber, bankUpdatedAt: ph.bankUpdatedAt, bankVerifiedAt: { not: null } } });
      if (!same) throw new ConflictException('The pharmacy’s bank details just changed — don’t pay until the new account is verified');
      await this.audit.record({ actorId: admin.id, action: 'payout.paid', entityType: 'Payout', entityId: id, metadata: { reference: reference.trim(), last4: ph.bankAccountNumber!.slice(-4), netKobo: p.netKobo } }, tx);
    });
    this.texts.background(() => this.texts.pharmacists(ph.id, `Pilbridge payout ${p.code} of ${ngn(p.netKobo)} was sent to your account ending ${ph.bankAccountNumber!.slice(-4)}. Ref ${reference.trim().slice(0, 30)}.`));
    return this.payout(id);
  }

  /** Cancel an unpaid payout; its orders become payable again in the next run. */
  async void(admin: AuthUser, id: string, reason: string) {
    const p = await this.prisma.payout.findUnique({ where: { id }, select: { status: true } });
    if (!p) throw new NotFoundException('Payout not found');
    if (p.status !== PayoutStatus.SCHEDULED) throw new ConflictException('Only a scheduled payout can be voided');
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.payout.updateMany({ where: { id, status: PayoutStatus.SCHEDULED }, data: { status: PayoutStatus.VOID } });
      if (claimed.count === 0) throw new ConflictException('Someone else just updated this payout');
      const released = await tx.order.updateMany({ where: { payoutId: id }, data: { payoutId: null } });
      await this.audit.record({ actorId: admin.id, action: 'payout.voided', entityType: 'Payout', entityId: id, metadata: { reason, orders: released.count } }, tx);
    });
    return this.payout(id);
  }
}
