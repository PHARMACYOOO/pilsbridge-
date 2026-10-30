import { ConflictException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, randomInt } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import type { JwtPayload } from '../common/auth-user.js';
import type { ClientInfo } from '../common/decorators.js';
import { parseMfaRoles } from '../common/env.js';
import type { Role, User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StaffTextsService } from '../sms/staff-texts.service.js';
import { SmsService } from '../sms/sms.service.js';
import { profileOf } from '../users/profile.js';
import { SessionsService } from './sessions.service.js';
import { matchTotp, newTotpSecret, otpauthUrl } from './totp.js';

const CHALLENGE_SECONDS = 10 * 60;
const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;
const RECOVERY_CODES = 10;
const RECOVERY_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'; // no 0/o, 1/l/i
const mask = (p: string) => `${p.slice(0, 7)}•••${p.slice(-2)}`;

export type MfaChallenge = { status: 'mfa_required' | 'mfa_setup_required'; mfaToken: string };

/**
 * The authenticator-app second factor for admins and pharmacists (MFA_REQUIRED_ROLES). After the
 * phone code (or Google/Apple), these roles get a short-lived challenge token instead of a session,
 * and must enter a code from their authenticator app — setting one up the first time — or a
 * one-time recovery code. Secrets are encrypted at rest (MFA_ENCRYPTION_KEY); five wrong codes lock
 * the second step for 15 minutes; each code works once.
 */
@Injectable()
export class MfaService {
  private readonly roles: Role[];
  private readonly key: Buffer;
  private readonly recoveryKey: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly sessions: SessionsService,
    private readonly audit: AuditService,
    private readonly sms: SmsService,
    private readonly texts: StaffTextsService,
    config: ConfigService,
  ) {
    this.roles = parseMfaRoles(config.get('MFA_REQUIRED_ROLES'));
    // Production requires its own key (validateEnv); local development derives one from JWT_SECRET.
    const own = config.get<string>('MFA_ENCRYPTION_KEY');
    const base = own ? createHash('sha256').update(own).digest() : Buffer.from(hkdfSync('sha256', config.getOrThrow<string>('JWT_SECRET'), 'pilbridge', 'mfa-v1', 32));
    this.key = base;
    this.recoveryKey = Buffer.from(hkdfSync('sha256', base, 'pilbridge', 'mfa-recovery-v1', 32));
  }

  required(role: Role) {
    return this.roles.includes(role);
  }

  // ——— Secrets at rest ———

  private encrypt(plain: string) {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.key, iv);
    const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    return `v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${ct.toString('base64')}`;
  }

  private decrypt(stored: string) {
    const [v, iv, tag, ct] = stored.split(':');
    if (v !== 'v1' || !iv || !tag || !ct) throw new Error('Unreadable MFA secret');
    const d = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'));
    d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
  }

  private hashRecovery(code: string) {
    return createHmac('sha256', this.recoveryKey).update(code.toLowerCase().replace(/[^a-z0-9]/g, '')).digest('hex');
  }

  // ——— Sign-in ———

  /** Instead of a session: a 10-minute token that only the MFA endpoints accept. */
  async challenge(user: Pick<User, 'id' | 'totpEnabledAt'>): Promise<MfaChallenge> {
    const mfaToken = await this.jwt.signAsync({ sub: user.id, purpose: 'mfa' } satisfies JwtPayload, { expiresIn: CHALLENGE_SECONDS });
    return { status: user.totpEnabledAt ? 'mfa_required' : 'mfa_setup_required', mfaToken };
  }

  private async fromChallenge(mfaToken: string) {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(mfaToken);
    } catch {
      throw new UnauthorizedException('This sign-in has timed out — start again');
    }
    if (payload.purpose !== 'mfa' || typeof payload.sub !== 'string') throw new UnauthorizedException('This sign-in has timed out — start again');
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.disabledAt) throw new UnauthorizedException('This account can’t sign in — contact Pilbridge support');
    if (!this.required(user.role)) throw new UnauthorizedException('Start the sign-in again');
    return user;
  }

  /** First sign-in: a new secret to add to the authenticator app. Confirmed by the first code. */
  async setup(mfaToken: string) {
    const user = await this.fromChallenge(mfaToken);
    if (user.totpEnabledAt) throw new ConflictException('Your authenticator app is already set up — enter its code');
    const secret = newTotpSecret();
    await this.prisma.user.update({ where: { id: user.id }, data: { totpSecret: this.encrypt(secret), totpLastStep: null } });
    return { secret, otpauthUrl: otpauthUrl(secret, user.phone ?? user.email ?? 'Pilbridge account') };
  }

  /** Check a code from the app (or a recovery code) and start a session. Returns recovery codes the first time. */
  async verify(mfaToken: string, code: string, client: ClientInfo) {
    const user = await this.fromChallenge(mfaToken);
    const now = new Date();
    if (user.mfaLockedUntil && user.mfaLockedUntil > now) {
      throw new HttpException('Too many incorrect codes — try again in 15 minutes', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (!user.totpSecret) throw new ConflictException('Set up your authenticator app first');

    const cleaned = code.replace(/\s/g, '');
    const settingUp = !user.totpEnabledAt;
    let step: number | null = null;
    let recoveryId: string | null = null;
    if (/^\d{6}$/.test(cleaned)) {
      step = matchTotp(this.decrypt(user.totpSecret), cleaned, now.getTime(), user.totpLastStep);
    } else if (!settingUp) {
      const r = await this.prisma.mfaRecoveryCode.findFirst({ where: { userId: user.id, codeHash: this.hashRecovery(cleaned), usedAt: null }, select: { id: true } });
      recoveryId = r?.id ?? null;
    }

    if (step === null && !recoveryId) {
      const failures = user.mfaFailures + 1;
      const lock = failures >= MAX_FAILURES;
      await this.prisma.user.update({ where: { id: user.id }, data: lock ? { mfaFailures: 0, mfaLockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000) } : { mfaFailures: failures } });
      if (lock) await this.audit.record({ actorId: user.id, action: 'auth.mfa_locked', entityType: 'User', entityId: user.id });
      throw new UnauthorizedException(lock ? 'Too many incorrect codes — try again in 15 minutes' : 'That code isn’t right — check your authenticator app');
    }

    // Claim the code: conditional, so the same code can't start two sessions.
    if (step !== null) {
      const claimed = await this.prisma.user.updateMany({
        where: { id: user.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
        data: { totpLastStep: step, mfaFailures: 0, mfaLockedUntil: null, ...(settingUp ? { totpEnabledAt: now } : {}) },
      });
      if (claimed.count === 0) throw new UnauthorizedException('That code was just used — wait for the next one');
    } else {
      const used = await this.prisma.mfaRecoveryCode.updateMany({ where: { id: recoveryId!, usedAt: null }, data: { usedAt: now } });
      if (used.count === 0) throw new UnauthorizedException('That recovery code was just used');
      await this.prisma.user.update({ where: { id: user.id }, data: { mfaFailures: 0, mfaLockedUntil: null } });
      if (user.phone) {
        const phone = user.phone;
        this.texts.background(() => this.sms.sendText(phone, 'A Pilbridge recovery code was just used to sign in to your account. If this wasn\'t you, call Pilbridge support now.'));
      }
    }

    const recoveryCodes = settingUp ? await this.newRecoveryCodes(user.id) : undefined;
    const { accessToken } = await this.sessions.create(user, { mfa: true, client });
    await this.audit.record({ actorId: user.id, action: settingUp ? 'auth.mfa_enabled' : 'auth.signed_in', entityType: 'User', entityId: user.id, metadata: { mfa: recoveryId ? 'recovery_code' : 'totp' } });
    const full = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { pharmacy: true, socialIdentities: true } });
    return { status: 'signed_in' as const, accessToken, user: profileOf(full), isNewUser: false, ...(recoveryCodes ? { recoveryCodes } : {}) };
  }

  /** Replace all recovery codes. Shown once; only HMACs are kept. */
  async newRecoveryCodes(userId: string) {
    const codes = Array.from({ length: RECOVERY_CODES }, () => {
      const c = Array.from({ length: 8 }, () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)]).join('');
      return `${c.slice(0, 4)}-${c.slice(4)}`;
    });
    await this.prisma.$transaction([
      this.prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
      this.prisma.mfaRecoveryCode.createMany({ data: codes.map((c) => ({ userId, codeHash: this.hashRecovery(c) })) }),
    ]);
    return codes;
  }

  /**
   * Clear someone's authenticator (lost phone): they set it up again at next sign-in. Done by an
   * admin from the admin page, or — when no admin can sign in — from the server console
   * (src/cli/admin-recovery.ts), recorded with `actorId: null` and how it was done.
   */
  async reset(actorId: string | null, userId: string, reason: string, via: Record<string, string> = { via: 'admin page' }) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { phone: true } });
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null, mfaFailures: 0, mfaLockedUntil: null } });
      await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
      await this.audit.record({ actorId, action: 'auth.mfa_reset', entityType: 'User', entityId: userId, metadata: { reason, ...via } }, tx);
    });
    await this.sessions.revokeAll(userId, 'mfa reset');
    if (user.phone) {
      const phone = user.phone;
      this.texts.background(() => this.sms.sendText(phone, 'Pilbridge reset your authenticator app. Set it up again when you next sign in. If you did not ask for this, call Pilbridge support.'));
    }
    return { reset: true, phone: user.phone ? mask(user.phone) : null };
  }
}
