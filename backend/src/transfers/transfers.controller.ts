import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, PharmacyStaff, Roles } from '../common/decorators.js';
import { Role } from '../generated/prisma/client.js';
import { CreateTransferDto, ReceiveTransferDto, TransferReasonDto } from './dto.js';
import { TransfersService } from './transfers.service.js';

@ApiTags('pharmacy · transfers')
@ApiBearerAuth()
@PharmacyStaff()
@Controller('pharmacy/transfers')
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.transfers.list(user);
  }

  /** A draft transfer out of one of your batches. A pharmacist publishes it. */
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTransferDto) {
    return this.transfers.create(user, dto);
  }

  @Post(':code/publish')
  @HttpCode(200)
  @Roles(Role.PHARMACIST)
  publish(@CurrentUser() user: AuthUser, @Param('code') code: string) {
    return this.transfers.publish(user, code);
  }

  @Post(':code/accept')
  @HttpCode(200)
  @Roles(Role.PHARMACIST)
  accept(@CurrentUser() user: AuthUser, @Param('code') code: string) {
    return this.transfers.accept(user, code);
  }

  @Post(':code/decline')
  @HttpCode(200)
  @Roles(Role.PHARMACIST)
  decline(@CurrentUser() user: AuthUser, @Param('code') code: string, @Body() dto: TransferReasonDto) {
    return this.transfers.decline(user, code, dto.reason);
  }

  @Post(':code/dispatch')
  @HttpCode(200)
  dispatch(@CurrentUser() user: AuthUser, @Param('code') code: string) {
    return this.transfers.dispatch(user, code);
  }

  @Post(':code/receive')
  @HttpCode(200)
  @Roles(Role.PHARMACIST)
  receive(@CurrentUser() user: AuthUser, @Param('code') code: string, @Body() dto: ReceiveTransferDto) {
    return this.transfers.receive(user, code, dto);
  }

  @Post(':code/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param('code') code: string, @Body() dto: TransferReasonDto) {
    return this.transfers.cancel(user, code, dto.reason);
  }
}

@ApiTags('admin · transfers')
@ApiBearerAuth()
@Roles(Role.PLATFORM_ADMIN)
@Controller('admin/transfers')
export class AdminTransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Get()
  all() {
    return this.transfers.all();
  }
}
