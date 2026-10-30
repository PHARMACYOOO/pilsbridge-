import { Body, Controller, Get, HttpCode, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, PharmacyStaff, Roles } from '../common/decorators.js';
import { Role } from '../generated/prisma/client.js';
import { ActivityQueryDto, BankDetailsDto, UpdateSettingsDto } from './dto.js';
import { PortalService } from './portal.service.js';

@ApiTags('pharmacy · portal')
@ApiBearerAuth()
@PharmacyStaff()
@Controller('pharmacy')
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  @Get('settings')
  settings(@CurrentUser() user: AuthUser) {
    return this.portal.settings(user);
  }

  /** Contact, delivery hours and delivery areas. Pharmacists only. */
  @Patch('settings')
  @Roles(Role.PHARMACIST)
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateSettingsDto) {
    return this.portal.updateSettings(user, dto);
  }

  /** The account payouts go to. Pharmacists only; needs Pilbridge verification and a 48-hour hold. */
  @Put('settings/bank')
  @Roles(Role.PHARMACIST)
  bank(@CurrentUser() user: AuthUser, @Body() dto: BankDetailsDto) {
    return this.portal.setBank(user, dto);
  }

  @Get('team')
  team(@CurrentUser() user: AuthUser) {
    return this.portal.team(user);
  }

  @Get('activity')
  activity(@CurrentUser() user: AuthUser, @Query() q: ActivityQueryDto) {
    return this.portal.activity(user, q.limit, q.before);
  }

  @Get('notifications')
  notifications(@CurrentUser() user: AuthUser) {
    return this.portal.notifications(user);
  }

  @Post('notifications/read')
  @HttpCode(200)
  read(@CurrentUser() user: AuthUser) {
    return this.portal.markNotificationsRead(user);
  }
}
