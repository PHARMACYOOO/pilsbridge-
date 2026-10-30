import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { SessionsService } from '../auth/sessions.service.js';
import { normalisePhone } from '../auth/phone.js';
import type { AuthUser } from '../common/auth-user.js';
import { applicationCode, isUniqueViolation, withUniqueCode } from '../common/codes.js';
import { ApplicationStatus, OrderStatus, PharmacyStatus, Role, type Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StaffTextsService } from '../sms/staff-texts.service.js';
import { DETAIL_KEY, type AddStaffDto, type CreatePharmacyDto, type PartnerApplicationDto, type ReviewApplicationDto, type UpdatePharmacyDto } from './dto.js';
import { pharmacyAdminSelect } from './pharmacy-view.js';

const OPEN_ORDERS: OrderStatus[] = [OrderStatus.PHARMACIST_REVIEW, OrderStatus.ACCEPTED, OrderStatus.PREPARING, OrderStatus.READY];
const staffSelect = { id: true, firstName: true, lastName: true, phone: true, role: true, pcnRegNo: true, createdAt: true } satisfies Prisma.UserSelect;
const BAD_PHONE = 'Enter a Nigerian mobile number, e.g. 0803 123 4567';

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'pharmacy';

/**
 * Bringing partners onto the platform: partner applications from the website, pharmacy records
 * (created pending, verified by an admin, suspended when needed), their pharmacists and counter
 * staff, and verification of the bank account payouts go to. Every change is audited.
 */
@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly texts: StaffTextsService,
    private readonly sessions: SessionsService,
  ) {}

  // ——— Pharmacies ———

  async pharmacy(id: string) {
    const ph = await this.prisma.pharmacy.findUnique({ where: { id }, select: { ...pharmacyAdminSelect, staff: { select: staffSelect, orderBy: [{ role: 'asc' }, { firstName: 'asc' }] } } });
    if (!ph) throw new NotFoundException('Pharmacy not found');
    return ph;
  }

  async createPharmacy(admin: AuthUser, dto: CreatePharmacyDto) {
    const licenceExpiresAt = new Date(dto.licenceExpiresAt);
    if (licenceExpiresAt.getTime() <= Date.now()) throw new UnprocessableEntityException('The premises licence has expired — a pharmacy needs a current licence');
    const phone = dto.phone ? normalisePhone(dto.phone) : null;
    if (dto.phone && !phone) throw new BadRequestException(BAD_PHONE);

    const base = slugify(`${dto.name}-${dto.area}`);
    let id: string | null = null;
    for (let i = 0; i < 5 && !id; i++) {
      const slug = i === 0 ? base : `${base}-${i + 1}`;
      try {
        id = await this.prisma.$transaction(async (tx) => {
          const ph = await tx.pharmacy.create({
            data: {
              slug,
              name: dto.name.trim(),
              area: dto.area.trim(),
              address: dto.address.trim(),
              premisesLicenceNo: dto.premisesLicenceNo.trim(),
              licenceExpiresAt,
              superintendentName: dto.superintendentName?.trim() || null,
              email: dto.email?.toLowerCase() ?? null,
              phone,
              coldChain: dto.coldChain ?? false,
              lat: dto.lat ?? null,
              lng: dto.lng ?? null,
              status: PharmacyStatus.PENDING_VERIFICATION,
            },
          });
          if (dto.applicationId) {
            const linked = await tx.partnerApplication.updateMany({
              where: { id: dto.applicationId, kind: 'PHARMACY', pharmacyId: null },
              data: { pharmacyId: ph.id, status: ApplicationStatus.APPROVED, reviewedById: admin.id, reviewedAt: new Date() },
            });
            if (linked.count === 0) throw new ConflictException('That application isn’t a pharmacy application, or already has a pharmacy');
          }
          await this.audit.record({ actorId: admin.id, action: 'pharmacy.created', entityType: 'Pharmacy', entityId: ph.id, metadata: { name: ph.name, applicationId: dto.applicationId ?? null } }, tx);
          return ph.id;
        });
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
      }
    }
    if (!id) throw new ConflictException('A pharmacy with this name and area already exists');
    return this.pharmacy(id);
  }

  async updatePharmacy(admin: AuthUser, id: string, dto: UpdatePharmacyDto) {
    const current = await this.prisma.pharmacy.findUnique({ where: { id }, select: { licenceExpiresAt: true, status: true } });
    if (!current) throw new NotFoundException('Pharmacy not found');
    const licenceExpiresAt = dto.licenceExpiresAt ? new Date(dto.licenceExpiresAt) : undefined;
    const expiryChanged = licenceExpiresAt && licenceExpiresAt.getTime() !== current.licenceExpiresAt.getTime();
    // A live pharmacy whose licence is now recorded as expired stops trading straight away.
    const lapsed = expiryChanged && current.status === PharmacyStatus.VERIFIED && licenceExpiresAt.getTime() <= Date.now();

    await this.prisma.$transaction(async (tx) => {
      await tx.pharmacy.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          area: dto.area?.trim(),
          address: dto.address?.trim(),
          premisesLicenceNo: dto.premisesLicenceNo?.trim(),
          superintendentName: dto.superintendentName?.trim(),
          email: dto.email?.toLowerCase(),
          coldChain: dto.coldChain,
          ...(expiryChanged ? { licenceExpiresAt, licenceReminderDays: null } : {}),
          ...(lapsed ? { status: PharmacyStatus.SUSPENDED, suspendedAt: new Date(), suspendedReason: 'Premises licence expired' } : {}),
        },
      });
      await this.audit.record({ actorId: admin.id, action: 'pharmacy.updated', entityType: 'Pharmacy', entityId: id, metadata: { ...Object.fromEntries(Object.entries(dto)), ...(lapsed ? { suspended: 'licence expired' } : {}) } }, tx);
    });
    return this.pharmacy(id);
  }

  /** Go live. Needs a current licence, at least one pharmacist on the account, and a note of what was checked. */
  async verifyPharmacy(admin: AuthUser, id: string, note: string) {
    const ph = await this.prisma.pharmacy.findUnique({ where: { id }, select: { status: true, licenceExpiresAt: true, name: true } });
    if (!ph) throw new NotFoundException('Pharmacy not found');
    if (ph.status === PharmacyStatus.VERIFIED) throw new ConflictException('This pharmacy is already verified');
    if (ph.licenceExpiresAt.getTime() <= Date.now()) throw new UnprocessableEntityException('The premises licence has expired — record the renewed licence first');
    const pharmacists = await this.prisma.user.count({ where: { pharmacyId: id, role: Role.PHARMACIST } });
    if (!pharmacists) throw new UnprocessableEntityException('Add the superintendent pharmacist’s account before verifying — prescriptions need a pharmacist');

    await this.prisma.$transaction(async (tx) => {
      const moved = await tx.pharmacy.updateMany({
        where: { id, status: ph.status },
        data: { status: PharmacyStatus.VERIFIED, verifiedAt: new Date(), suspendedAt: null, suspendedReason: null },
      });
      if (moved.count === 0) throw new ConflictException('This pharmacy was just updated by someone else — refresh and try again');
      await this.audit.record({ actorId: admin.id, action: 'pharmacy.verified', entityType: 'Pharmacy', entityId: id, metadata: { from: ph.status, note } }, tx);
    });
    this.texts.background(() => this.texts.pharmacists(id, `${ph.name.slice(0, 40)} is now live on Pilbridge. Sign in to the pharmacy portal to see orders.`));
    return this.pharmacy(id);
  }

  /**
   * Stop trading: the pharmacy leaves the catalogue, quotes and checkout at once, and can't prepare
   * new orders. Parcels already with a rider are still delivered. Returns how many open orders need
   * handling (cancel and refund, or wait for reinstatement).
   */
  async suspendPharmacy(admin: AuthUser, id: string, reason: string) {
    const ph = await this.prisma.pharmacy.findUnique({ where: { id }, select: { status: true, name: true } });
    if (!ph) throw new NotFoundException('Pharmacy not found');
    if (ph.status === PharmacyStatus.SUSPENDED) throw new ConflictException('This pharmacy is already suspended');
    await this.prisma.$transaction(async (tx) => {
      const moved = await tx.pharmacy.updateMany({ where: { id, status: ph.status }, data: { status: PharmacyStatus.SUSPENDED, suspendedAt: new Date(), suspendedReason: reason.trim() } });
      if (moved.count === 0) throw new ConflictException('This pharmacy was just updated by someone else — refresh and try again');
      await this.audit.record({ actorId: admin.id, action: 'pharmacy.suspended', entityType: 'Pharmacy', entityId: id, metadata: { from: ph.status, reason } }, tx);
    });
    const openOrders = await this.prisma.order.count({ where: { pharmacyId: id, status: { in: OPEN_ORDERS } } });
    this.texts.background(() => this.texts.pharmacists(id, `${ph.name.slice(0, 40)} has been paused on Pilbridge and won't receive new orders. Pilbridge will contact you.`));
    return { ...(await this.pharmacy(id)), openOrders };
  }

  async verifyBank(admin: AuthUser, id: string, note: string) {
    const ph = await this.prisma.pharmacy.findUnique({ where: { id }, select: { bankAccountNumber: true, bankUpdatedAt: true, bankVerifiedAt: true } });
    if (!ph) throw new NotFoundException('Pharmacy not found');
    if (!ph.bankAccountNumber || !ph.bankUpdatedAt) throw new UnprocessableEntityException('This pharmacy hasn’t added a settlement account');
    if (ph.bankVerifiedAt) throw new ConflictException('This account is already verified');
    await this.prisma.$transaction(async (tx) => {
      // Only the details that were checked: a change made since then needs its own verification.
      const ok = await tx.pharmacy.updateMany({ where: { id, bankUpdatedAt: ph.bankUpdatedAt, bankVerifiedAt: null }, data: { bankVerifiedAt: new Date(), bankVerifiedById: admin.id } });
      if (ok.count === 0) throw new ConflictException('The bank details changed while you were checking them — check the new details');
      await this.audit.record({ actorId: admin.id, action: 'pharmacy.bank_verified', entityType: 'Pharmacy', entityId: id, metadata: { last4: ph.bankAccountNumber!.slice(-4), note } }, tx);
    });
    return this.pharmacy(id);
  }

  // ——— Staff ———

  async staff(pharmacyId: string) {
    return (await this.pharmacy(pharmacyId)).staff;
  }

  /**
   * A pharmacist or counter-staff account at a pharmacy; they sign in at /portal with this number.
   * A number that already has an account is refused, unless it's a patient account that has never
   * ordered (e.g. they signed up on the website first).
   */
  async addStaff(admin: AuthUser, pharmacyId: string, dto: AddStaffDto) {
    if (!(await this.prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { id: true } }))) throw new NotFoundException('Pharmacy not found');
    const phone = normalisePhone(dto.phone);
    if (!phone) throw new BadRequestException(BAD_PHONE);
    const data = { firstName: dto.firstName.trim(), lastName: dto.lastName.trim(), role: dto.role, pharmacyId, pcnRegNo: dto.role === Role.PHARMACIST ? dto.pcnRegNo!.trim() : null };

    const existing = await this.prisma.user.findUnique({ where: { phone }, select: { id: true, role: true, _count: { select: { orders: true, prescriptions: true } } } });
    if (existing && (existing.role !== Role.PATIENT || existing._count.orders || existing._count.prescriptions)) {
      throw new ConflictException('This number already has a Pilbridge account — staff need a number not used for anything else');
    }
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const u = existing
          ? await tx.user.update({ where: { id: existing.id, role: Role.PATIENT }, data, select: staffSelect })
          : await tx.user.create({ data: { phone, ...data }, select: staffSelect });
        await this.audit.record({ actorId: admin.id, action: 'staff.added', entityType: 'User', entityId: u.id, metadata: { pharmacyId, role: dto.role, pcnRegNo: data.pcnRegNo, existingAccount: !!existing } }, tx);
        return u;
      });
      // A promoted patient account signs in again, so a pharmacist sets up the second factor.
      if (existing) await this.sessions.revokeAll(user.id, 'became pharmacy staff');
      return user;
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('This number already has a Pilbridge account');
      throw e;
    }
  }

  /** The account becomes an ordinary patient account. A live pharmacy keeps at least one pharmacist. */
  async removeStaff(admin: AuthUser, pharmacyId: string, userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, pharmacyId }, select: { role: true } });
    if (!user) throw new NotFoundException('Staff member not found');
    await this.prisma.$transaction(async (tx) => {
      // Lock the pharmacy so two removals at once can't both leave it without a pharmacist.
      await tx.$queryRaw`SELECT 1 FROM "Pharmacy" WHERE id = ${pharmacyId} FOR UPDATE`;
      await tx.user.update({ where: { id: userId }, data: { role: Role.PATIENT, pharmacyId: null, pcnRegNo: null } });
      const ph = await tx.pharmacy.findUniqueOrThrow({ where: { id: pharmacyId }, select: { status: true } });
      const pharmacists = await tx.user.count({ where: { pharmacyId, role: Role.PHARMACIST } });
      if (ph.status === PharmacyStatus.VERIFIED && pharmacists === 0) {
        throw new ConflictException('This is the pharmacy’s only pharmacist — add another pharmacist or suspend the pharmacy first');
      }
      await this.audit.record({ actorId: admin.id, action: 'staff.removed', entityType: 'User', entityId: userId, metadata: { pharmacyId, role: user.role } }, tx);
    });
    await this.sessions.revokeAll(userId, 'removed from pharmacy');
    return this.staff(pharmacyId);
  }

  // ——— Partner applications ———

  /** From the website's public form. Nothing is activated: operations follow up and verify credentials. */
  async apply(dto: PartnerApplicationDto) {
    const phone = normalisePhone(dto.phone);
    if (!phone) throw new BadRequestException(BAD_PHONE);
    const details = cleanDetails(dto.details);
    const email = dto.email.toLowerCase();

    // A resubmitted form (double click, retry) returns the open application instead of a duplicate.
    const recent = await this.prisma.partnerApplication.findFirst({
      where: { kind: dto.kind, email, status: ApplicationStatus.NEW, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) } },
      select: { code: true, status: true },
    });
    if (recent) return recent;

    const app = await withUniqueCode(applicationCode, (code) =>
      this.prisma.partnerApplication.create({
        data: { code, kind: dto.kind, organisation: dto.organisation.trim(), contactName: dto.contactName?.trim() || '', email, phone, details },
        select: { code: true, status: true },
      }),
    );
    this.texts.background(() => this.texts.admins(`New ${dto.kind.toLowerCase()} partner application ${app.code}: ${dto.organisation.trim().slice(0, 40)}. Review it on the admin page.`));
    return app;
  }

  applications(status?: ApplicationStatus) {
    return this.prisma.partnerApplication.findMany({ where: status ? { status } : {}, orderBy: { createdAt: 'desc' }, take: 500 });
  }

  async reviewApplication(admin: AuthUser, id: string, dto: ReviewApplicationDto) {
    const app = await this.prisma.partnerApplication.findUnique({ where: { id }, select: { status: true } });
    if (!app) throw new NotFoundException('Application not found');
    if (app.status === ApplicationStatus.APPROVED || app.status === ApplicationStatus.DECLINED) throw new ConflictException('This application has already been decided');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.partnerApplication.update({ where: { id }, data: { status: dto.status, note: dto.note?.trim() ?? null, reviewedById: admin.id, reviewedAt: new Date() } });
      await this.audit.record({ actorId: admin.id, action: `application.${dto.status.toLowerCase()}`, entityType: 'PartnerApplication', entityId: id, metadata: { note: dto.note ?? null } }, tx);
      return updated;
    });
  }
}

/** Up to 20 short text answers with simple keys; anything else is refused rather than stored. */
export function cleanDetails(raw: Record<string, unknown>): Record<string, string> {
  const entries = Object.entries(raw ?? {});
  if (entries.length > 20) throw new BadRequestException('Too many form fields');
  const out: Record<string, string> = {};
  for (const [k, v] of entries) {
    if (!DETAIL_KEY.test(k)) throw new BadRequestException(`Unexpected form field “${k.slice(0, 30)}”`);
    if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') throw new BadRequestException(`“${k}” should be text`);
    const text = String(v).trim();
    if (text.length > 500) throw new BadRequestException(`“${k}” is too long (500 characters at most)`);
    if (text) out[k] = text;
  }
  return out;
}
