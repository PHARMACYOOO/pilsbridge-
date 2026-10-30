import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { MfaService } from '../auth/mfa.service.js';
import { normalisePhone } from '../auth/phone.js';
import { SessionsService } from '../auth/sessions.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { isUniqueViolation } from '../common/codes.js';
import { DeliveryStatus, Role, type Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SmsService } from '../sms/sms.service.js';
import { StaffTextsService } from '../sms/staff-texts.service.js';
import type { FindUsersDto } from './dto.js';

const accountSelect = {
  id: true, phone: true, email: true, firstName: true, lastName: true, role: true, createdAt: true,
  disabledAt: true, disabledReason: true, totpEnabledAt: true, mfaLockedUntil: true,
  pharmacy: { select: { id: true, name: true } },
} satisfies Prisma.UserSelect;
const mask = (p: string) => `${p.slice(0, 7)}•••${p.slice(-2)}`;

/**
 * Platform admin: account security. Find an account, disable or re-enable it, sign it out
 * everywhere, reset its authenticator app, or change a staff, rider or admin's sign-in number.
 * Admins can't do these to themselves, and the last active admin can't be disabled.
 */
@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    private readonly mfa: MfaService,
    private readonly audit: AuditService,
    private readonly sms: SmsService,
    private readonly texts: StaffTextsService,
  ) {}

  private async view(id: string) {
    const [u, live] = await Promise.all([
      this.prisma.user.findUnique({ where: { id }, select: accountSelect }),
      this.prisma.session.count({ where: { userId: id, revokedAt: null, expiresAt: { gt: new Date() } } }),
    ]);
    if (!u) throw new NotFoundException('Account not found');
    return { ...u, mfaEnabled: !!u.totpEnabledAt, mfaRequired: this.mfa.required(u.role), activeSessions: live };
  }

  async find(dto: FindUsersDto) {
    const q = dto.q?.trim();
    const phone = q ? normalisePhone(q) : null;
    const users = await this.prisma.user.findMany({
      where: {
        ...(dto.role ? { role: dto.role } : {}),
        ...(q
          ? {
              OR: [
                ...(phone ? [{ phone }] : []),
                { firstName: { contains: q, mode: 'insensitive' as const } },
                { lastName: { contains: q, mode: 'insensitive' as const } },
                { email: { contains: q, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      select: { id: true },
      orderBy: [{ role: 'asc' }, { firstName: 'asc' }],
      take: 50,
    });
    return Promise.all(users.map((u) => this.view(u.id)));
  }

  private notSelf(admin: AuthUser, id: string) {
    if (admin.id === id) throw new ForbiddenException('Ask another admin to do this to your own account');
  }

  async disable(admin: AuthUser, id: string, reason: string) {
    this.notSelf(admin, id);
    const u = await this.prisma.user.findUnique({ where: { id }, select: { role: true, disabledAt: true } });
    if (!u) throw new NotFoundException('Account not found');
    if (u.disabledAt) throw new ConflictException('This account is already disabled');
    if (u.role === Role.RIDER) {
      const jobs = await this.prisma.delivery.count({ where: { riderId: id, status: { in: [DeliveryStatus.ASSIGNED, DeliveryStatus.PICKED_UP] } } });
      if (jobs) throw new ConflictException('This rider has jobs on the go — pause them under Riders first, so their jobs go back to other riders');
    }
    await this.prisma.$transaction(async (tx) => {
      if (u.role === Role.PLATFORM_ADMIN) {
        // Serialise admin disables so two admins can't disable each other at the same moment.
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(4242001)`;
        const others = await tx.user.count({ where: { role: Role.PLATFORM_ADMIN, disabledAt: null, id: { not: id } } });
        if (!others) throw new ConflictException('This is the only active admin');
      }
      await tx.user.update({ where: { id }, data: { disabledAt: new Date(), disabledReason: reason.trim() } });
      // A disabled rider goes offline, so no new jobs are offered to them.
      await tx.riderProfile.updateMany({ where: { userId: id }, data: { onlineSince: null, area: null } });
      await this.audit.record({ actorId: admin.id, action: 'account.disabled', entityType: 'User', entityId: id, metadata: { reason } }, tx);
    });
    await this.sessions.revokeAll(id, 'account disabled');
    return this.view(id);
  }

  async enable(admin: AuthUser, id: string) {
    this.notSelf(admin, id);
    const u = await this.prisma.user.findUnique({ where: { id }, select: { disabledAt: true } });
    if (!u) throw new NotFoundException('Account not found');
    if (!u.disabledAt) throw new ConflictException('This account isn’t disabled');
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { disabledAt: null, disabledReason: null } });
      await this.audit.record({ actorId: admin.id, action: 'account.enabled', entityType: 'User', entityId: id }, tx);
    });
    return this.view(id);
  }

  async signOutEverywhere(admin: AuthUser, id: string, reason: string) {
    await this.view(id);
    const ended = await this.sessions.revokeAll(id, `signed out by an admin: ${reason}`.slice(0, 300));
    await this.audit.record({ actorId: admin.id, action: 'account.signed_out', entityType: 'User', entityId: id, metadata: { reason, sessions: ended } });
    return { ...(await this.view(id)), signedOut: ended };
  }

  async resetMfa(admin: AuthUser, id: string, reason: string) {
    this.notSelf(admin, id);
    await this.view(id);
    await this.mfa.reset(admin.id, id, reason);
    return this.view(id);
  }

  /** A staff, rider or admin's new sign-in number (patients change their own). Both numbers are texted. */
  async changePhone(admin: AuthUser, id: string, raw: string, reason: string) {
    this.notSelf(admin, id);
    const phone = normalisePhone(raw);
    if (!phone) throw new BadRequestException('Enter a Nigerian mobile number, e.g. 0803 123 4567');
    const u = await this.prisma.user.findUnique({ where: { id }, select: { phone: true, role: true } });
    if (!u) throw new NotFoundException('Account not found');
    if (u.role === Role.PATIENT) throw new ForbiddenException('Patients change their own number from their account, with a code sent to it');
    if (u.phone === phone) throw new ConflictException('That’s already their number');
    if (await this.prisma.user.findUnique({ where: { phone }, select: { id: true } })) throw new ConflictException('This number already has a Pilbridge account');
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id }, data: { phone } });
        await this.audit.record({ actorId: admin.id, action: 'auth.phone_changed', entityType: 'User', entityId: id, metadata: { by: 'admin', reason, last4: phone.slice(-4), previousLast4: u.phone?.slice(-4) ?? null } }, tx);
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('This number was just added to another account');
      throw e;
    }
    await this.sessions.revokeAll(id, 'phone changed by an admin');
    this.texts.background(async () => {
      if (u.phone) await this.sms.sendText(u.phone, `Pilbridge changed your sign-in number to ${mask(phone)}. If you did not ask for this, call Pilbridge support now.`);
      await this.sms.sendText(phone, 'This is now your Pilbridge sign-in number. If you did not expect this, call Pilbridge support.');
    });
    return this.view(id);
  }
}
