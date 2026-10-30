import { BadRequestException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { normalisePhone } from '../auth/phone.js';
import type { AuthUser } from '../common/auth-user.js';
import { BANK_CHANGE_HOLD_HOURS } from '../common/fees.js';
import { DOCUMENT_LABELS } from '../compliance/dto.js';
import { daysLeft, dueReminder } from '../compliance/expiry.js';
import { AREAS } from '../delivery/areas.js';
import { DocumentStatus, IncidentStatus, OrderStatus, PaymentStatus, PayoutStatus, PharmacyStatus, PrescriptionStatus, Role, TransferStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ngn } from '../settlements/money.js';
import { StaffTextsService } from '../sms/staff-texts.service.js';
import { ACTION_TEXT } from './activity.js';
import type { BankDetailsDto, UpdateSettingsDto } from './dto.js';

const DAY = 24 * 60 * 60_000;
const mask = (n: string | null) => (n ? `••••••${n.slice(-4)}` : null);
const maskPhone = (p: string | null) => (p ? `${p.slice(0, 7)}•••${p.slice(-2)}` : null);
const name = (u: { firstName: string | null; lastName: string | null } | null) => (u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || 'Staff' : 'Pilbridge');

export type PortalNotification = { id: string; kind: string; title: string; body: string; href: string; at: Date };

/**
 * The pharmacy portal's own data: settings (contact, delivery hours and coverage, settlement
 * account), the team list, the activity log built from the audit trail, and notifications
 * derived from live state (so they're never out of date).
 */
@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly texts: StaffTextsService,
  ) {}

  // ——— Settings ———

  async settings(user: AuthUser) {
    const ph = await this.prisma.pharmacy.findUniqueOrThrow({ where: { id: user.pharmacyId! } });
    return {
      profile: { name: ph.name, area: ph.area, address: ph.address, premisesLicenceNo: ph.premisesLicenceNo, licenceExpiresAt: ph.licenceExpiresAt, superintendentName: ph.superintendentName, status: ph.status, coldChain: ph.coldChain },
      contact: { phone: ph.phone, email: ph.email },
      hours: { openDays: ph.openDays, opensAt: ph.opensAt, lastOrderAt: ph.lastOrderAt },
      coverageAreas: ph.coverageAreas,
      areas: AREAS.map(({ key, name: n }) => ({ key, name: n })),
      bank: {
        bankName: ph.bankName,
        accountName: ph.bankAccountName,
        accountNumber: mask(ph.bankAccountNumber),
        verified: !!ph.bankVerifiedAt,
        updatedAt: ph.bankUpdatedAt,
        holdUntil: ph.bankUpdatedAt ? new Date(ph.bankUpdatedAt.getTime() + BANK_CHANGE_HOLD_HOURS * 60 * 60_000) : null,
      },
    };
  }

  async updateSettings(user: AuthUser, dto: UpdateSettingsDto) {
    const me = user.pharmacyId!;
    const phone = dto.phone !== undefined ? normalisePhone(dto.phone) : undefined;
    if (dto.phone !== undefined && !phone) throw new BadRequestException('Enter a Nigerian phone number, e.g. 0803 123 4567');
    const current = await this.prisma.pharmacy.findUniqueOrThrow({ where: { id: me }, select: { opensAt: true, lastOrderAt: true } });
    const opensAt = dto.opensAt ?? current.opensAt;
    const lastOrderAt = dto.lastOrderAt ?? current.lastOrderAt;
    if (opensAt && lastOrderAt && lastOrderAt <= opensAt) throw new UnprocessableEntityException('The last delivery order time must be after opening time');

    await this.prisma.$transaction(async (tx) => {
      await tx.pharmacy.update({
        where: { id: me },
        data: {
          ...(phone ? { phone } : {}),
          email: dto.email?.toLowerCase(),
          openDays: dto.openDays ? [...dto.openDays].sort((a, b) => a - b) : undefined,
          opensAt: dto.opensAt,
          lastOrderAt: dto.lastOrderAt,
          coverageAreas: dto.coverageAreas,
        },
      });
      await this.audit.record({ actorId: user.id, action: 'pharmacy.settings_updated', entityType: 'Pharmacy', entityId: me, metadata: Object.fromEntries(Object.entries(dto)) }, tx);
    });
    return this.settings(user);
  }

  /**
   * A new settlement account needs Pilbridge to verify it, then waits 48 hours before any payout,
   * and every pharmacist and admin is texted — so a hijacked account can't quietly redirect money.
   */
  async setBank(user: AuthUser, dto: BankDetailsDto) {
    const me = user.pharmacyId!;
    const ph = await this.prisma.pharmacy.findUniqueOrThrow({ where: { id: me }, select: { name: true, bankName: true, bankAccountName: true, bankAccountNumber: true } });
    const same = ph.bankName === dto.bankName.trim() && ph.bankAccountName === dto.accountName.trim() && ph.bankAccountNumber === dto.accountNumber;
    if (same) return this.settings(user);
    await this.prisma.$transaction(async (tx) => {
      await tx.pharmacy.update({
        where: { id: me },
        data: { bankName: dto.bankName.trim(), bankAccountName: dto.accountName.trim(), bankAccountNumber: dto.accountNumber, bankUpdatedAt: new Date(), bankVerifiedAt: null, bankVerifiedById: null },
      });
      await this.audit.record({ actorId: user.id, action: 'pharmacy.bank_changed', entityType: 'Pharmacy', entityId: me, metadata: { bankName: dto.bankName.trim(), last4: dto.accountNumber.slice(-4), previousLast4: ph.bankAccountNumber?.slice(-4) ?? null } }, tx);
    });
    const text = `The settlement account for ${ph.name.slice(0, 30)} was changed to one ending ${dto.accountNumber.slice(-4)}. If this wasn't you, call Pilbridge now.`;
    this.texts.background(async () => {
      await this.texts.pharmacists(me, text);
      await this.texts.admins(`${ph.name.slice(0, 30)} changed its settlement account (ending ${dto.accountNumber.slice(-4)}). Verify it before the next payout.`);
    });
    return this.settings(user);
  }

  async team(user: AuthUser) {
    const staff = await this.prisma.user.findMany({
      where: { pharmacyId: user.pharmacyId! },
      select: { id: true, firstName: true, lastName: true, role: true, phone: true, pcnRegNo: true, createdAt: true },
      orderBy: [{ role: 'asc' }, { firstName: 'asc' }],
    });
    return staff.map((s) => ({ ...s, phone: maskPhone(s.phone) }));
  }

  // ——— Activity log ———

  /**
   * Recent actions by the pharmacy's team and by Pilbridge on the pharmacy. Each entry is kept
   * only if what it's about belongs to this pharmacy, so staff who moved pharmacies don't carry
   * their old pharmacy's history with them.
   */
  async activity(user: AuthUser, limit = 50, before?: string) {
    const me = user.pharmacyId!;
    const entries = await this.prisma.auditLog.findMany({
      where: {
        OR: [{ actor: { pharmacyId: me } }, { entityType: 'Pharmacy', entityId: me }],
        action: { in: Object.keys(ACTION_TEXT) },
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      include: { actor: { select: { firstName: true, lastName: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit * 2, 400),
    });

    const ids = (type: string) => [...new Set(entries.filter((e) => e.entityType === type).map((e) => e.entityId))];
    const [orders, rxs, batches, transfers, docs, deliveries, incidents] = await Promise.all([
      this.prisma.order.findMany({ where: { id: { in: ids('Order') }, pharmacyId: me }, select: { id: true, code: true } }),
      this.prisma.prescription.findMany({ where: { id: { in: ids('Prescription') }, order: { pharmacyId: me } }, select: { id: true, code: true } }),
      this.prisma.batch.findMany({ where: { id: { in: ids('Batch') }, pharmacyId: me }, select: { id: true, batchNumber: true } }),
      this.prisma.transfer.findMany({ where: { id: { in: ids('Transfer') }, OR: [{ fromPharmacyId: me }, { toPharmacyId: me }] }, select: { id: true, code: true } }),
      this.prisma.complianceDocument.findMany({ where: { id: { in: ids('ComplianceDocument') }, pharmacyId: me }, select: { id: true, kind: true } }),
      this.prisma.delivery.findMany({ where: { id: { in: ids('Delivery') }, order: { pharmacyId: me } }, select: { id: true, code: true } }),
      this.prisma.incident.findMany({ where: { id: { in: ids('Incident') }, order: { pharmacyId: me } }, select: { id: true, code: true } }),
    ]);
    const ref = new Map<string, string>([
      ...orders.map((o) => [`Order:${o.id}`, o.code] as const),
      ...rxs.map((r) => [`Prescription:${r.id}`, r.code] as const),
      ...batches.map((b) => [`Batch:${b.id}`, b.batchNumber] as const),
      ...transfers.map((t) => [`Transfer:${t.id}`, t.code] as const),
      ...docs.map((d) => [`ComplianceDocument:${d.id}`, DOCUMENT_LABELS[d.kind].name.toLowerCase()] as const),
      ...deliveries.map((d) => [`Delivery:${d.id}`, d.code] as const),
      ...incidents.map((i) => [`Incident:${i.id}`, i.code] as const),
      [`Pharmacy:${me}`, ''],
    ]);

    return entries
      .filter((e) => ref.has(`${e.entityType}:${e.entityId}`))
      .slice(0, limit)
      .map((e) => ({
        id: e.id,
        at: e.createdAt,
        who: e.actor?.role === Role.PLATFORM_ADMIN || !e.actor ? 'Pilbridge' : name(e.actor),
        action: e.action,
        text: ACTION_TEXT[e.action](ref.get(`${e.entityType}:${e.entityId}`)!),
      }));
  }

  // ——— Notifications ———

  /** What needs the team's attention, newest first, worked out from live data. */
  async notifications(user: AuthUser) {
    const me = user.pharmacyId!;
    const now = new Date();
    const recent = new Date(now.getTime() - 14 * DAY);
    const [viewer, ph, rxs, toPrepare, offers, outgoing, incidents, docs, payouts] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { notificationsSeenAt: true } }),
      this.prisma.pharmacy.findUniqueOrThrow({ where: { id: me }, select: { status: true, suspendedAt: true, suspendedReason: true, licenceExpiresAt: true } }),
      this.prisma.prescription.findMany({ where: { status: PrescriptionStatus.PENDING, order: { pharmacyId: me } }, select: { code: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 10 }),
      this.prisma.order.findMany({ where: { pharmacyId: me, status: OrderStatus.ACCEPTED, paymentStatus: PaymentStatus.PAID }, select: { code: true, paidAt: true }, orderBy: { paidAt: 'desc' }, take: 10 }),
      this.prisma.transfer.findMany({
        where: { status: { in: [TransferStatus.OFFERED, TransferStatus.IN_TRANSIT] }, fromPharmacyId: { not: me }, OR: [{ toPharmacyId: me }, { toPharmacyId: null, status: TransferStatus.OFFERED, fromPharmacy: { status: PharmacyStatus.VERIFIED } }] },
        select: { code: true, status: true, quantity: true, toPharmacyId: true, publishedAt: true, dispatchedAt: true, fromPharmacy: { select: { name: true } }, batch: { select: { product: { select: { name: true } } } } },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      }),
      this.prisma.transfer.findMany({
        where: { fromPharmacyId: me, status: { in: [TransferStatus.DRAFT, TransferStatus.ACCEPTED, TransferStatus.DECLINED] }, updatedAt: { gte: recent } },
        select: { code: true, status: true, createdAt: true, acceptedAt: true, closedAt: true, toPharmacy: { select: { name: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      }),
      this.prisma.incident.findMany({ where: { status: IncidentStatus.OPEN, order: { pharmacyId: me } }, select: { code: true, type: true, createdAt: true, order: { select: { code: true } } }, orderBy: { createdAt: 'desc' }, take: 10 }),
      this.prisma.complianceDocument.findMany({ where: { pharmacyId: me, status: { in: [DocumentStatus.VERIFIED, DocumentStatus.REJECTED] }, reviewedAt: { gte: recent } }, select: { id: true, kind: true, status: true, reviewedAt: true }, orderBy: { reviewedAt: 'desc' }, take: 10 }),
      user.role === Role.PHARMACIST
        ? this.prisma.payout.findMany({ where: { pharmacyId: me, status: PayoutStatus.PAID, paidAt: { gte: recent } }, select: { code: true, netKobo: true, paidAt: true }, take: 5 })
        : Promise.resolve([]),
    ]);

    const items: PortalNotification[] = [];
    const waited = (d: Date) => {
      const m = Math.max(1, Math.round((now.getTime() - d.getTime()) / 60_000));
      return m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`;
    };
    if (ph.status === PharmacyStatus.SUSPENDED && ph.suspendedAt) {
      items.push({ id: 'pharmacy-suspended', kind: 'pharmacy', title: 'Pharmacy paused on Pilbridge', body: ph.suspendedReason ?? 'Contact Pilbridge', href: '/portal/compliance', at: ph.suspendedAt });
    }
    const left = daysLeft(ph.licenceExpiresAt, now);
    const threshold = dueReminder(ph.licenceExpiresAt, null, now);
    if (threshold !== null) {
      items.push({ id: `licence-${threshold}`, kind: 'compliance', title: 'Premises licence expires soon', body: `${left} day${left === 1 ? '' : 's'} left — upload the renewal`, href: '/portal/compliance', at: new Date(ph.licenceExpiresAt.getTime() - threshold * DAY) });
    }
    for (const r of rxs) items.push({ id: `rx-${r.code}`, kind: 'prescription', title: 'New prescription to review', body: `${r.code} · waiting ${waited(r.createdAt)}`, href: '/portal/prescriptions', at: r.createdAt });
    for (const o of toPrepare) items.push({ id: `paid-${o.code}`, kind: 'order', title: 'Paid order to prepare', body: o.code, href: `/portal/orders?id=${o.code}`, at: o.paidAt ?? now });
    for (const t of offers) {
      const what = `${t.quantity} × ${t.batch.product.name} from ${t.fromPharmacy.name}`;
      if (t.status === TransferStatus.IN_TRANSIT) items.push({ id: `tr-${t.code}-sent`, kind: 'transfer', title: 'Transfer on its way', body: `${t.code} · ${what}`, href: '/portal/transfers', at: t.dispatchedAt ?? now });
      else items.push({ id: `tr-${t.code}-offer`, kind: 'transfer', title: t.toPharmacyId ? 'Transfer offer needs approval' : 'Stock offered to the network', body: `${t.code} · ${what}`, href: '/portal/transfers', at: t.publishedAt ?? now });
    }
    for (const t of outgoing) {
      if (t.status === TransferStatus.DRAFT) items.push({ id: `tr-${t.code}-draft`, kind: 'transfer', title: 'Draft transfer needs a pharmacist', body: `${t.code} · publish or withdraw it`, href: '/portal/transfers', at: t.createdAt });
      if (t.status === TransferStatus.ACCEPTED) items.push({ id: `tr-${t.code}-accepted`, kind: 'transfer', title: 'Transfer accepted — pack and send it', body: `${t.code} · to ${t.toPharmacy?.name ?? 'pharmacy'}`, href: '/portal/transfers', at: t.acceptedAt ?? now });
      if (t.status === TransferStatus.DECLINED) items.push({ id: `tr-${t.code}-declined`, kind: 'transfer', title: 'Transfer offer declined', body: `${t.code} · by ${t.toPharmacy?.name ?? 'pharmacy'}`, href: '/portal/transfers', at: t.closedAt ?? now });
    }
    for (const i of incidents) items.push({ id: `inc-${i.code}`, kind: 'incident', title: 'Open incident', body: `${i.code} on ${i.order.code} · ${i.type.toLowerCase().replace(/_/g, ' ')}`, href: `/portal/orders?id=${i.order.code}`, at: i.createdAt });
    for (const d of docs) {
      const label = DOCUMENT_LABELS[d.kind].name;
      items.push({ id: `doc-${d.id}`, kind: 'compliance', title: d.status === DocumentStatus.VERIFIED ? `${label} verified` : `${label} not verified`, body: d.status === DocumentStatus.VERIFIED ? 'Thanks — it’s on file' : 'See Compliance for why, and upload again', href: '/portal/compliance', at: d.reviewedAt! });
    }
    for (const p of payouts) items.push({ id: `po-${p.code}`, kind: 'payout', title: 'Payout sent', body: `${p.code} · ${ngn(p.netKobo)}`, href: '/portal/settlements', at: p.paidAt! });

    items.sort((a, b) => b.at.getTime() - a.at.getTime());
    const seen = viewer.notificationsSeenAt;
    const list = items.slice(0, 25).map((n) => ({ ...n, unread: !seen || n.at > seen }));
    return { unread: list.filter((n) => n.unread).length, items: list };
  }

  async markNotificationsRead(user: AuthUser) {
    await this.prisma.user.update({ where: { id: user.id }, data: { notificationsSeenAt: new Date() } });
    return { unread: 0 };
  }
}
