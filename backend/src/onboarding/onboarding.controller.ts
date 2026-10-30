import { Body, Controller, Delete, Get, HttpCode, Param, ParseEnumPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Public, Roles } from '../common/decorators.js';
import { ApplicationStatus, Role } from '../generated/prisma/client.js';
import { AddStaffDto, CreatePharmacyDto, PartnerApplicationDto, ReviewApplicationDto, SuspendPharmacyDto, UpdatePharmacyDto, VerifyBankDto, VerifyPharmacyDto } from './dto.js';
import { OnboardingService } from './onboarding.service.js';

@ApiTags('admin · onboarding')
@ApiBearerAuth()
@Roles(Role.PLATFORM_ADMIN)
@Controller('admin')
export class AdminOnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  /** A new pharmacy, pending verification. It isn't listed or sold from until verified. */
  @Post('pharmacies')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePharmacyDto) {
    return this.onboarding.createPharmacy(user, dto);
  }

  /** Everything about one pharmacy, with its staff. */
  @Get('pharmacies/:id')
  get(@Param('id') id: string) {
    return this.onboarding.pharmacy(id);
  }

  @Patch('pharmacies/:id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdatePharmacyDto) {
    return this.onboarding.updatePharmacy(user, id, dto);
  }

  @Post('pharmacies/:id/verify')
  @HttpCode(200)
  verify(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: VerifyPharmacyDto) {
    return this.onboarding.verifyPharmacy(user, id, dto.note.trim());
  }

  @Post('pharmacies/:id/suspend')
  @HttpCode(200)
  suspend(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SuspendPharmacyDto) {
    return this.onboarding.suspendPharmacy(user, id, dto.reason);
  }

  /** Confirm the settlement account belongs to the pharmacy. Payouts need this. */
  @Post('pharmacies/:id/bank/verify')
  @HttpCode(200)
  verifyBank(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: VerifyBankDto) {
    return this.onboarding.verifyBank(user, id, dto.note.trim());
  }

  @Get('pharmacies/:id/staff')
  staff(@Param('id') id: string) {
    return this.onboarding.staff(id);
  }

  @Post('pharmacies/:id/staff')
  addStaff(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AddStaffDto) {
    return this.onboarding.addStaff(user, id, dto);
  }

  @Delete('pharmacies/:id/staff/:userId')
  removeStaff(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('userId') userId: string) {
    return this.onboarding.removeStaff(user, id, userId);
  }

  @Get('applications')
  @ApiQuery({ name: 'status', enum: ApplicationStatus, required: false })
  applications(@Query('status', new ParseEnumPipe(ApplicationStatus, { optional: true })) status?: ApplicationStatus) {
    return this.onboarding.applications(status);
  }

  @Post('applications/:id/review')
  @HttpCode(200)
  review(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReviewApplicationDto) {
    return this.onboarding.reviewApplication(user, id, dto);
  }
}

@ApiTags('partners')
@Public()
@Controller('partners')
export class PartnersController {
  constructor(private readonly onboarding: OnboardingService) {}

  /** The website's partner forms (pharmacies, hospitals, logistics). Creates no account. */
  @Post('applications')
  @Throttle({ default: { limit: 5, ttl: 60_000 }, phone: { limit: 3, ttl: 60_000 } })
  apply(@Body() dto: PartnerApplicationDto) {
    return this.onboarding.apply(dto);
  }
}
