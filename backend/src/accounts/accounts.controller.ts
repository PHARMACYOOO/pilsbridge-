import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Roles } from '../common/decorators.js';
import { Role } from '../generated/prisma/client.js';
import { AccountsService } from './accounts.service.js';
import { ChangePhoneDto, FindUsersDto, ReasonDto } from './dto.js';

@ApiTags('admin · accounts')
@ApiBearerAuth()
@Roles(Role.PLATFORM_ADMIN)
@Controller('admin/users')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  /** Up to 50 accounts by phone, name or email, optionally by role. */
  @Get()
  find(@Query() dto: FindUsersDto) {
    return this.accounts.find(dto);
  }

  /** The account can't sign in, and every session ends at once. */
  @Post(':id/disable')
  @HttpCode(200)
  disable(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.accounts.disable(user, id, dto.reason);
  }

  @Post(':id/enable')
  @HttpCode(200)
  enable(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.accounts.enable(user, id);
  }

  @Post(':id/sessions/revoke')
  @HttpCode(200)
  signOut(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.accounts.signOutEverywhere(user, id, dto.reason);
  }

  /** Lost phone: clears their authenticator app; they set it up again at next sign-in. */
  @Post(':id/mfa/reset')
  @HttpCode(200)
  resetMfa(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.accounts.resetMfa(user, id, dto.reason);
  }

  /** A staff, rider or admin's new sign-in number. */
  @Put(':id/phone')
  changePhone(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ChangePhoneDto) {
    return this.accounts.changePhone(user, id, dto.phone, dto.reason);
  }
}
