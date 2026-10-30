import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../common/auth-user.js';
import { Client, CurrentUser, Public, type ClientInfo } from '../common/decorators.js';
import { AuthService } from './auth.service.js';
import { DemoSocialSignInDto, MfaSetupDto, MfaVerifyDto, RequestOtpDto, SocialSignInDto, VerifyOtpDto } from './dto.js';
import { MfaService } from './mfa.service.js';
import { SessionsService } from './sessions.service.js';

/**
 * Sign-in. Each step answers with `status`: "signed_in" (with an accessToken), or — for admins and
 * pharmacists — "mfa_required" / "mfa_setup_required" with an mfaToken for the /auth/mfa steps.
 */
@ApiTags('auth')
@Public()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly mfa: MfaService,
  ) {}

  /** Sends a 6-digit code to the phone. In development the code is also returned as `devCode`. */
  @Post('otp/request')
  @HttpCode(200)
  // Generous per IP (many users share a carrier IP), strict per phone number. OtpService also caps codes per hour.
  @Throttle({ default: { limit: 30, ttl: 60_000 }, phone: { limit: 3, ttl: 60_000 } })
  request(@Body() dto: RequestOtpDto) {
    return this.auth.requestCode(dto.phone, dto.intent);
  }

  /** Exchanges a valid code for a session (or an MFA challenge). Creates a patient account for new numbers. */
  @Post('otp/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 }, phone: { limit: 10, ttl: 60_000 } })
  verify(@Body() dto: VerifyOtpDto, @Client() client: ClientInfo) {
    return this.auth.verifyCode(dto, client);
  }

  /**
   * Sign in with a Google or Apple ID token. The first sign-in creates an account without a phone
   * number (`isNewUser: true`); a number can be added later with POST /me/phone.
   */
  @Post('social')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  social(@Body() dto: SocialSignInDto, @Client() client: ClientInfo) {
    return this.auth.socialSignIn(dto, client);
  }

  /** Development only (OTP_DEV_ECHO with NODE_ENV=development): sign in as a sample Google/Apple account. 404 everywhere else. */
  @Post('social/demo')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  demoSocial(@Body() dto: DemoSocialSignInDto, @Client() client: ClientInfo) {
    return this.auth.demoSocialSignIn(dto, client);
  }

  /** First sign-in for an admin or pharmacist: the secret (and link) to add to an authenticator app. */
  @Post('mfa/setup')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  mfaSetup(@Body() dto: MfaSetupDto) {
    return this.mfa.setup(dto.mfaToken);
  }

  /** The authenticator code (or a recovery code) that completes the sign-in. The first time, returns recovery codes to save. */
  @Post('mfa/verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  mfaVerify(@Body() dto: MfaVerifyDto, @Client() client: ClientInfo) {
    return this.mfa.verify(dto.mfaToken, dto.code, client);
  }
}

@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
export class SessionController {
  constructor(private readonly sessions: SessionsService) {}

  /** End this session. The token stops working at once. */
  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentUser() user: AuthUser) {
    await this.sessions.revoke(user.sessionId, 'signed out');
  }

  /** End every session of this account, on every device — this one included. */
  @Post('logout-all')
  @HttpCode(200)
  async logoutAll(@CurrentUser() user: AuthUser) {
    return { signedOut: await this.sessions.revokeAll(user.id, 'signed out everywhere') };
  }
}
