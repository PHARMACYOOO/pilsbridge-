import { Body, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from '../auth/auth.service.js';
import { MfaService } from '../auth/mfa.service.js';
import { SessionsService } from '../auth/sessions.service.js';
import { AddPhoneDto } from '../auth/dto.js';
import type { AuthUser } from '../common/auth-user.js';
import { isUniqueViolation } from '../common/codes.js';
import { Client, CurrentUser, type ClientInfo } from '../common/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateProfileDto } from './dto.js';
import { profileOf } from './profile.js';

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
    private readonly mfa: MfaService,
  ) {}

  @Get()
  async me(@CurrentUser() user: AuthUser) {
    return profileOf(await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { pharmacy: true, socialIdentities: true } }));
  }

  @Patch()
  async update(@CurrentUser() user: AuthUser, @Body() dto: UpdateProfileDto) {
    // Keep the date consent was first given; later profile edits don't reset it.
    const { consentAt } = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { consentAt: true } });
    try {
      const updated = await this.prisma.user.update({
        where: { id: user.id },
        data: { firstName: dto.firstName.trim(), lastName: dto.lastName.trim(), email: dto.email?.toLowerCase(), consentAt: consentAt ?? new Date() },
        include: { pharmacy: true, socialIdentities: true },
      });
      return profileOf(updated);
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('That email is already linked to another account');
      throw e;
    }
  }

  /**
   * Add or change a patient's phone number (verified with a code from POST /auth/otp/request).
   * Changing one needs a sign-in in the last 10 minutes, texts the old number and signs out every
   * other session. Returns a new access token: if the number already has an account, a new
   * Google/Apple account joins it.
   */
  @Post('phone')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 }, phone: { limit: 10, ttl: 60_000 } })
  addPhone(@CurrentUser() user: AuthUser, @Body() dto: AddPhoneDto, @Client() client: ClientInfo) {
    return this.auth.addPhone(user, dto, client);
  }

  /** Devices signed in to this account. */
  @Get('sessions')
  sessionsList(@CurrentUser() user: AuthUser) {
    return this.sessions.list(user.id, user.sessionId);
  }

  /** Sign one device out. */
  @Delete('sessions/:id')
  async endSession(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const mine = await this.prisma.session.findFirst({ where: { id, userId: user.id }, select: { id: true } });
    if (!mine) throw new NotFoundException('Session not found');
    await this.sessions.revoke(id, 'signed out from another device');
    return this.sessions.list(user.id, user.sessionId);
  }

  /** New recovery codes for the authenticator second factor (the old ones stop working). Shown once. */
  @Post('mfa/recovery-codes')
  @HttpCode(200)
  async recoveryCodes(@CurrentUser() user: AuthUser) {
    if (!user.mfa) throw new NotFoundException('Your account doesn’t use an authenticator app');
    return { recoveryCodes: await this.mfa.newRecoveryCodes(user.id) };
  }
}
