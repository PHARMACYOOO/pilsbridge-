import { Body, Controller, Get, Headers, HttpCode, Param, Post, Put, Req, type RawBodyRequest } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, PharmacyStaff, Public, Roles } from '../common/decorators.js';
import { Role } from '../generated/prisma/client.js';
import { AREAS } from './areas.js';
import { CourierDispatchService } from './courier-dispatch.service.js';
import { DeliveryService } from './delivery.service.js';
import { BookCourierDto, CheckoutQuoteDto, CourierDeliveredDto, DropoffDto, FailDto, HandoverDto, RiderStatusDto } from './dto.js';

@ApiTags('delivery')
@Public()
@Controller('delivery')
export class DeliveryAreasController {
  constructor(private readonly couriers: CourierDispatchService) {}

  /** Lagos delivery areas (with approximate centre points) for the checkout, rider and admin pickers. */
  @Get('areas')
  areas() {
    return AREAS;
  }

  /**
   * Delivery price to the customer's pinned location from this pharmacy: a live courier quote
   * plus margin (DELIVERY_PRICING=courier), or the standard fee. Pass `quoteId` when ordering.
   */
  @Post('quote')
  @HttpCode(200)
  quote(@Body() dto: CheckoutQuoteDto) {
    return this.couriers.checkoutQuote({ pharmacyId: dto.pharmacyId, lat: dto.lat, lng: dto.lng, address: dto.address, prescription: !!dto.prescription, coldChain: !!dto.coldChain });
  }
}

@ApiTags('delivery')
@Public()
@Controller('webhooks')
export class CourierWebhookController {
  constructor(private readonly couriers: CourierDispatchService) {}

  /** Register https://<api>/v1/webhooks/chowdeck on the Chowdeck dashboard (Settings → Developers). */
  @Post('chowdeck')
  @HttpCode(200)
  @SkipThrottle({ default: true, phone: true })
  @ApiExcludeEndpoint()
  chowdeck(@Req() req: RawBodyRequest<Request>, @Headers('x-chowdeck-signature') signature: string | undefined, @Body() body: unknown) {
    return this.couriers.chowdeckWebhook(req.rawBody, signature, body);
  }
}

@ApiTags('rider')
@ApiBearerAuth()
@Roles(Role.RIDER)
@Controller('rider')
export class RiderController {
  constructor(private readonly delivery: DeliveryService) {}

  /** Go online in an area (to see nearby jobs) or offline. */
  @Put('status')
  status(@CurrentUser() user: AuthUser, @Body() dto: RiderStatusDto) {
    return this.delivery.setStatus(user, dto.online, dto.area);
  }

  @Get('jobs')
  jobs(@CurrentUser() user: AuthUser) {
    return this.delivery.jobs(user);
  }

  @Post('jobs/:code/accept')
  @HttpCode(200)
  accept(@CurrentUser() user: AuthUser, @Param('code') code: string) {
    return this.delivery.accept(user, code);
  }

  @Post('jobs/:code/release')
  @HttpCode(200)
  release(@CurrentUser() user: AuthUser, @Param('code') code: string) {
    return this.delivery.release(user, code);
  }

  @Post('jobs/:code/delivered')
  @HttpCode(200)
  delivered(@CurrentUser() user: AuthUser, @Param('code') code: string, @Body() dto: DropoffDto) {
    return this.delivery.delivered(user, code, dto.code);
  }

  @Post('jobs/:code/failed')
  @HttpCode(200)
  failed(@CurrentUser() user: AuthUser, @Param('code') code: string, @Body() dto: FailDto) {
    return this.delivery.failed(user, code, dto.reason, dto.cause);
  }
}

@ApiTags('pharmacy · orders')
@ApiBearerAuth()
@PharmacyStaff()
@Controller('pharmacy/orders')
export class PharmacyDeliveryController {
  constructor(private readonly delivery: DeliveryService) {}

  /** Check the seal code the rider or courier shows, and hand the parcel over. */
  @Post(':code/handover')
  @HttpCode(200)
  handover(@CurrentUser() user: AuthUser, @Param('code') code: string, @Body() dto: HandoverDto) {
    return this.delivery.handover(user, code, dto.sealCode);
  }

  /** Book a rider again after a failed delivery brought the parcel back. */
  @Post(':code/delivery')
  @HttpCode(200)
  rebook(@CurrentUser() user: AuthUser, @Param('code') code: string) {
    return this.delivery.rebook(user, code);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.PLATFORM_ADMIN)
@Controller('admin/deliveries')
export class CourierBookingController {
  constructor(
    private readonly delivery: DeliveryService,
    private readonly couriers: CourierDispatchService,
  ) {}

  /** Book through a connected courier API now (tries couriers in priority order). */
  @Post(':code/courier/api')
  @HttpCode(200)
  bookViaApi(@CurrentUser() user: AuthUser, @Param('code') code: string) {
    return this.couriers.bookNow(user, code);
  }

  /** Record a booking made with a courier company (dashboard or API). */
  @Post(':code/courier')
  @HttpCode(200)
  book(@CurrentUser() user: AuthUser, @Param('code') code: string, @Body() dto: BookCourierDto) {
    return this.delivery.bookCourier(user, code, dto);
  }

  /** The courier didn't come: put the job back for riders. */
  @Post(':code/courier/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: AuthUser, @Param('code') code: string) {
    return this.couriers.cancelBooking(user, code);
  }

  @Post(':code/courier/delivered')
  @HttpCode(200)
  delivered(@CurrentUser() user: AuthUser, @Param('code') code: string, @Body() dto: CourierDeliveredDto) {
    return this.delivery.courierDelivered(user, code, dto);
  }

  @Post(':code/courier/failed')
  @HttpCode(200)
  failed(@CurrentUser() user: AuthUser, @Param('code') code: string, @Body() dto: FailDto) {
    return this.delivery.courierFailed(user, code, dto.reason, dto.cause);
  }
}
