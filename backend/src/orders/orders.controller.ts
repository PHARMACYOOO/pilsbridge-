import { Body, Controller, Get, HttpCode, Param, ParseEnumPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, PharmacyStaff, Roles } from '../common/decorators.js';
import { OrderStatus, Role } from '../generated/prisma/client.js';
import { CreateOrderDto, UpdateOrderStatusDto } from './dto.js';
import { OrdersService } from './orders.service.js';

@ApiTags('orders')
@ApiBearerAuth()
@Roles(Role.PATIENT)
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto) {
    return this.orders.create(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.orders.listMine(user);
  }

  @Get(':code')
  get(@CurrentUser() user: AuthUser, @Param('code') code: string) {
    return this.orders.getMine(user, code);
  }

  @Post(':code/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param('code') code: string) {
    return this.orders.cancelMine(user, code);
  }
}

@ApiTags('pharmacy · orders')
@ApiBearerAuth()
@PharmacyStaff()
@Controller('pharmacy/orders')
export class PharmacyOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @ApiQuery({ name: 'status', enum: OrderStatus, required: false })
  list(@CurrentUser() user: AuthUser, @Query('status', new ParseEnumPipe(OrderStatus, { optional: true })) status?: OrderStatus) {
    return this.orders.listForPharmacy(user, status);
  }

  @Post(':code/status')
  @HttpCode(200)
  move(@CurrentUser() user: AuthUser, @Param('code') code: string, @Body() dto: UpdateOrderStatusDto) {
    return this.orders.move(user, code, dto.status, dto.note);
  }
}
