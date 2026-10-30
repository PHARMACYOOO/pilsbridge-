import { Body, Controller, Get, HttpCode, Param, ParseEnumPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Roles } from '../common/decorators.js';
import { PayoutStatus, Role } from '../generated/prisma/client.js';
import { CreatePayoutsDto, MarkPaidDto, VoidPayoutDto } from './dto.js';
import { SettlementsService } from './settlements.service.js';

/** Money owed and paid to the pharmacy. Pharmacists only — counter staff don't see finances. */
@ApiTags('pharmacy · settlements')
@ApiBearerAuth()
@Roles(Role.PHARMACIST)
@Controller('pharmacy/settlements')
export class PharmacySettlementsController {
  constructor(private readonly settlements: SettlementsService) {}

  @Get()
  overview(@CurrentUser() user: AuthUser) {
    return this.settlements.overview(user);
  }

  /** A payout's orders; "unsettled" for orders not in a payout yet. */
  @Get(':code')
  payout(@CurrentUser() user: AuthUser, @Param('code') code: string) {
    return this.settlements.payoutForPharmacy(user, code);
  }
}

@ApiTags('admin · settlements')
@ApiBearerAuth()
@Roles(Role.PLATFORM_ADMIN)
@Controller('admin/payouts')
export class AdminPayoutsController {
  constructor(private readonly settlements: SettlementsService) {}

  @Get()
  @ApiQuery({ name: 'status', enum: PayoutStatus, required: false })
  list(@Query('status', new ParseEnumPipe(PayoutStatus, { optional: true })) status?: PayoutStatus) {
    return this.settlements.list(status);
  }

  /** What would be paid, per pharmacy, for deliveries before a day. Creates nothing. */
  @Get('preview')
  @ApiQuery({ name: 'before', required: false, example: '2026-10-19' })
  preview(@Query() dto: CreatePayoutsDto) {
    return this.settlements.preview(dto.before);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePayoutsDto) {
    return this.settlements.create(user, dto.before);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.settlements.payout(id);
  }

  @Post(':id/paid')
  @HttpCode(200)
  paid(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: MarkPaidDto) {
    return this.settlements.markPaid(user, id, dto.reference);
  }

  @Post(':id/void')
  @HttpCode(200)
  void(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: VoidPayoutDto) {
    return this.settlements.void(user, id, dto.reason);
  }
}
