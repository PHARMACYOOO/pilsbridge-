import { Body, Controller, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Roles } from '../common/decorators.js';
import { Role } from '../generated/prisma/client.js';
import { CourierDispatchService } from '../delivery/courier-dispatch.service.js';
import { DeliveryWatchService } from '../delivery/delivery-watch.service.js';
import { AdminService } from './admin.service.js';
import { CourierDto, CreateRiderDto, PharmacyLocationDto, PharmacyPhoneDto, ProductEligibilityDto, UpdateCourierDto, UpdateRiderDto } from './dto.js';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.PLATFORM_ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly watch: DeliveryWatchService,
    private readonly dispatch: CourierDispatchService,
  ) {}

  /** Courier APIs Pilbridge can connect to, and whether their keys are set. */
  @Get('couriers/apis')
  courierApis() {
    return this.dispatch.available();
  }

  @Put('pharmacies/:id/phone')
  setPhone(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PharmacyPhoneDto) {
    return this.admin.setPharmacyPhone(user, id, dto.phone);
  }

  /** Late orders and jobs no rider has taken, right now. */
  @Get('deliveries/attention')
  attention() {
    return this.watch.snapshot();
  }

  @Get('riders')
  riders() {
    return this.admin.riders();
  }

  /** Add a rider from a logistics partner. They sign in at /rider with this number. */
  @Post('riders')
  createRider(@CurrentUser() user: AuthUser, @Body() dto: CreateRiderDto) {
    return this.admin.createRider(user, dto);
  }

  @Patch('riders/:id')
  updateRider(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateRiderDto) {
    return this.admin.updateRider(user, id, dto);
  }

  @Get('pharmacies')
  pharmacies() {
    return this.admin.pharmacies();
  }

  /** Where the pharmacy is, for nearest-pharmacy ranking, delivery times and rider matching. */
  @Put('pharmacies/:id/location')
  setLocation(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PharmacyLocationDto) {
    return this.admin.setPharmacyLocation(user, id, dto);
  }

  @Get('couriers')
  couriers() {
    return this.admin.couriers();
  }

  /** A courier company, with what it has accepted in writing. */
  @Post('couriers')
  createCourier(@CurrentUser() user: AuthUser, @Body() dto: CourierDto) {
    return this.admin.createCourier(user, dto);
  }

  @Patch('couriers/:id')
  updateCourier(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateCourierDto) {
    return this.admin.updateCourier(user, id, dto);
  }

  /** Every product (except controlled) with whether it may be delivered. */
  @Get('products')
  products() {
    return this.admin.products();
  }

  @Patch('products/:id')
  setDeliveryAllowed(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ProductEligibilityDto) {
    return this.admin.setDeliveryAllowed(user, id, dto.deliveryAllowed);
  }
}
