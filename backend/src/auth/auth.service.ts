import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { isUniqueViolation } from '../common/codes.js';
import type { ClientInfo } from '../common/decorators.js';
import { Role } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { profileOf } from '../users/profile.js';
import type { AddPhoneDto, AuthIntent, DemoSocialSignInDto, SocialSignInDto, VerifyOtpDto } from './dto.js';
import { MfaService } from './mfa.service.js';
import { OTP_TTL_SECONDS, OtpService } from './otp.service.js';
import { normalisePhone } from './phone.js';
import { SessionsService } from './sessions.service.js';
import { SmsService } from '../sms/sms.service.js';
import { StaffTextsService } from '../sms/staff-texts.service.js';
import { SocialVerifier, type VerifiedIdentity } from './social-verifier.service.js';

/** Changing a patient's number needs a sign-in this recent, so a long-lived stolen session can't do it. */
export const RECENT_SIGN_IN_MINUTES = 10;
const DISABLED = 'This account has been disabled — contact Pilbridge support';
const mask = (p: string) => `${p.slice(0, 7)}•••${p.slice(-2)}`;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly sms: SmsService,
    private readonly audit: AuditService,
    private readonly social: SocialVerifier,
    private readonly sessions: SessionsService,
    private readonly mfa: MfaService,
    private readonly texts: StaffTextsService,
  ) {}

  private phoneOrThrow(raw: string) {
    const phone = normalisePhone(raw);
    if (!phone) throw new BadRequestException('Enter a Nigerian mobile number, e.g. 0803 123 4567');
    return phone;
  }

  /**
   * The end of every sign-in: a session — or, for roles that need a second factor, an MFA
   * challenge to complete at /auth/mfa/verify. Disabled accounts are refused.
   */
  private async completeSignIn(userId: string, client: ClientInfo, opts: { mfa?: boolean } = {}) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { pharmacy: true, socialIdentities: true } });
    if (user.disabledAt) throw new ForbiddenException(DISABLED);
    if (this.mfa.required(user.role) && !opts.mfa) return this.mfa.challenge(user);
    const { accessToken } = await this.sessions.create(user, { mfa: !!opts.mfa, client });
    return { status: 'signed_in' as const, accessToken, user: profileOf(user) };
  }

  /** Check the number fits the intent before any code is sent. */
  private async assertIntent(phone: string, intent: AuthIntent) {
    const existing = await this.prisma.user.findUnique({ where: { phone }, select: { id: true, disabledAt: true } });
    if (existing?.disabledAt) throw new ForbiddenException(DISABLED);
    if (intent === 'auto') return;
    if (intent === 'signin' && !existing) throw new NotFoundException('There’s no account with this number yet — create one instead');
    if (intent === 'signup' && existing) throw new ConflictException('This number already has an account — sign in instead');
  }

  async requestCode(rawPhone: string, intent: AuthIntent = 'auto') {
    const phone = this.phoneOrThrow(rawPhone);
    await this.assertIntent(phone, intent);
    const code = await this.otp.issue(phone);
    await this.sms.sendOtp(phone, code);
    return { phone, expiresInSeconds: OTP_TTL_SECONDS, ...(this.sms.devEcho ? { devCode: code } : {}) };
  }

  /** Verify a phone code, signing in to the number's account or creating one. */
  async verifyCode(dto: VerifyOtpDto, client: ClientInfo = {}) {
    const phone = this.phoneOrThrow(dto.phone);
    const intent = dto.intent ?? 'auto';
    // Re-check here too: the account could have been created or removed since the code was sent.
    await this.assertIntent(phone, intent);
    if (!(await this.otp.check(phone, dto.code))) throw new UnauthorizedException('That code isn’t right — check the SMS and try again');

    const existing = await this.prisma.user.findUnique({ where: { phone } });
    const user = existing ?? (await this.createUser(phone, intent === 'signup' ? dto : null));
    const result = await this.completeSignIn(user.id, client);
    if (result.status === 'signed_in') {
      await this.audit.record({ actorId: user.id, action: existing ? 'auth.signed_in' : 'auth.signed_up', entityType: 'User', entityId: user.id });
    }
    return { ...result, isNewUser: !existing };
  }

  /** Create an account — complete, with profile and consent, when signing up. */
  private async createUser(phone: string, profile: VerifyOtpDto | null) {
    const email = profile?.email?.toLowerCase();
    if (email && (await this.prisma.user.findUnique({ where: { email }, select: { id: true } }))) {
      throw new ConflictException('That email is already linked to another account');
    }
    try {
      return await this.prisma.user.create({
        data: profile
          ? { phone, firstName: profile.firstName!.trim(), lastName: profile.lastName!.trim(), email, consentAt: new Date() }
          : { phone },
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('This number already has an account — sign in instead');
      throw e;
    }
  }

  /**
   * Exchange a Google/Apple ID token for a session, creating the account (without a phone number) the
   * first time. Names sent beside the token only fill gaps in it (Apple puts no name in its token).
   */
  async socialSignIn(dto: SocialSignInDto, client: ClientInfo = {}) {
    const identity = await this.social.verify(dto.provider, dto.idToken);
    return this.signInWithIdentity(
      {
        ...identity,
        firstName: identity.firstName ?? dto.firstName?.trim() ?? null,
        lastName: identity.lastName ?? dto.lastName?.trim() ?? null,
      },
      client,
    );
  }

  /**
   * Development only (OTP_DEV_ECHO with NODE_ENV=development): sign in as a sample Google/Apple
   * account when the real providers aren't configured. Never available in production.
   */
  async demoSocialSignIn(dto: DemoSocialSignInDto, client: ClientInfo = {}) {
    if (!this.sms.devEcho) throw new NotFoundException();
    const email = dto.email.toLowerCase();
    return this.signInWithIdentity({ provider: dto.provider, subject: `demo:${email}`, email, firstName: dto.firstName ?? null, lastName: dto.lastName ?? null }, client);
  }

  private async signInWithIdentity(identity: VerifiedIdentity, client: ClientInfo) {
    const { provider } = identity;
    const findLinked = () => this.prisma.socialIdentity.findUnique({ where: { provider_subject: { provider, subject: identity.subject } } });

    const linked = await findLinked();
    if (linked) {
      const result = await this.completeSignIn(linked.userId, client);
      if (result.status === 'signed_in') await this.audit.record({ actorId: linked.userId, action: 'auth.social_signed_in', entityType: 'User', entityId: linked.userId, metadata: { provider } });
      return { ...result, isNewUser: false };
    }

    let userId: string;
    try {
      userId = (await this.createSocialUser(identity)).id;
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      // The same account signing in twice at once: the other request created it.
      const raced = await findLinked();
      if (!raced) throw new ConflictException('Sign-in clashed with another request — please try again');
      return { ...(await this.completeSignIn(raced.userId, client)), isNewUser: false };
    }
    await this.audit.record({ actorId: userId, action: 'auth.signed_up', entityType: 'User', entityId: userId, metadata: { provider } });
    return { ...(await this.completeSignIn(userId, client)), isNewUser: true };
  }

  /**
   * A new account for a Google/Apple sign-in. Never joined to an existing account by email: the
   * email on a phone account was typed in, not verified, so it can't prove who owns that account.
   */
  private async createSocialUser(identity: VerifiedIdentity) {
    const emailTaken = identity.email && (await this.prisma.user.findUnique({ where: { email: identity.email }, select: { id: true } }));
    return this.prisma.user.create({
      data: {
        email: emailTaken ? null : identity.email,
        firstName: identity.firstName,
        lastName: identity.lastName,
        socialIdentities: { create: { provider: identity.provider, subject: identity.subject, email: identity.email } },
      },
    });
  }

  /**
   * Add or change the signed-in patient's phone number (verified with a code to the new number).
   *
   * - Staff, rider and admin numbers are their sign-in to regulated work: only an admin changes them.
   * - Changing an existing number needs a recent sign-in, the old number is texted, and every other
   *   session is signed out — so a stolen session can't quietly take the account over.
   * - If the number already has a patient account and this is a new Google/Apple account with
   *   nothing in it, the Google/Apple sign-in moves to the number's account instead, so one person
   *   doesn't end up with two. Never into a staff, rider or admin account.
   *
   * Returns a new session for whichever account the person now uses.
   */
  async addPhone(caller: AuthUser, dto: AddPhoneDto, client: ClientInfo = {}) {
    const phone = this.phoneOrThrow(dto.phone);
    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: caller.id }, include: { _count: { select: { orders: true, prescriptions: true } } } });
    if (me.phone && me.role !== Role.PATIENT) throw new ForbiddenException('Staff, rider and admin numbers are changed by Pilbridge — contact support');
    if (me.phone && caller.sessionCreatedAt.getTime() < Date.now() - RECENT_SIGN_IN_MINUTES * 60_000) {
      throw new ForbiddenException('For your security, sign in again before changing your number');
    }
    if (!(await this.otp.check(phone, dto.code))) throw new UnauthorizedException('That code isn’t right — check the SMS and try again');
    if (me.phone === phone) return this.completeSignIn(me.id, client, { mfa: caller.mfa });

    const owner = await this.prisma.user.findUnique({ where: { phone } });
    if (!owner) {
      try {
        await this.prisma.user.update({ where: { id: me.id }, data: { phone } });
      } catch (e) {
        if (isUniqueViolation(e)) throw new ConflictException('This number was just added to another account');
        throw e;
      }
      await this.audit.record({ actorId: me.id, action: me.phone ? 'auth.phone_changed' : 'auth.phone_added', entityType: 'User', entityId: me.id, metadata: { last4: phone.slice(-4), previousLast4: me.phone?.slice(-4) ?? null } });
      if (me.phone) {
        const old = me.phone;
        this.texts.background(() => this.sms.sendText(old, `Your Pilbridge number was changed to ${mask(phone)}. If this wasn't you, call Pilbridge support now.`));
      }
      // Every session, this one included, ends; the caller continues on the new one returned here.
      await this.sessions.revokeAll(me.id, me.phone ? 'phone changed' : 'phone added');
      return this.completeSignIn(me.id, client, { mfa: caller.mfa });
    }

    const empty = !me.phone && me.role === Role.PATIENT && me._count.orders === 0 && me._count.prescriptions === 0;
    if (!empty || owner.role !== Role.PATIENT) throw new ConflictException('This number already belongs to another Pilbridge account');
    if (owner.disabledAt) throw new ForbiddenException(DISABLED);

    await this.prisma.$transaction(async (tx) => {
      const moved = await tx.socialIdentity.findMany({ where: { userId: me.id }, select: { provider: true } });
      await tx.socialIdentity.updateMany({ where: { userId: me.id }, data: { userId: owner.id } });
      // The emptied account stays (its audit history refers to it) but can no longer be signed in to.
      await tx.user.update({ where: { id: me.id }, data: { email: null } });
      // Fill in a verified email and the name when the number's account doesn't have them yet.
      const data: { email?: string; firstName?: string; lastName?: string } = {};
      if (!owner.email && me.email && !(await tx.user.findUnique({ where: { email: me.email }, select: { id: true } }))) data.email = me.email;
      if (!owner.firstName && me.firstName) data.firstName = me.firstName;
      if (!owner.lastName && me.lastName) data.lastName = me.lastName;
      if (Object.keys(data).length) await tx.user.update({ where: { id: owner.id }, data });
      const metadata = { from: me.id, providers: moved.map((m) => m.provider) };
      await this.audit.record({ actorId: owner.id, action: 'auth.social_merged', entityType: 'User', entityId: owner.id, metadata }, tx);
    });
    await this.sessions.revokeAll(me.id, 'merged into the phone account');
    return this.completeSignIn(owner.id, client);
  }
}
