import { Body, Controller, Headers, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeEndpoint, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Public, Roles } from '../common/decorators.js';
import { Role } from '../generated/prisma/client.js';
import { ConfirmPaymentDto, StartPaymentDto } from './dto.js';
import { PaymentsService } from './payments.service.js';

@ApiTags('orders · payment')
@ApiBearerAuth()
@Roles(Role.PATIENT)
@Controller('orders/:code/payment')
export class OrderPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** Checkout details for Flutterwave's inline checkout (`provider: "demo"` in development without keys). */
  @Post()
  @HttpCode(200)
  start(@CurrentUser() user: AuthUser, @Param('code') code: string, @Body() dto: StartPaymentDto) {
    return this.payments.start(user, code, dto);
  }

  /** Send the `transaction_id` from Flutterwave's callback; the API verifies it with Flutterwave before marking the order paid. */
  @Post('confirm')
  @HttpCode(200)
  confirm(@CurrentUser() user: AuthUser, @Param('code') code: string, @Body() dto: ConfirmPaymentDto) {
    return this.payments.confirm(user, code, dto.transactionId);
  }

  /** Development only, when Flutterwave isn't configured. 404 everywhere else. */
  @Post('demo')
  @HttpCode(200)
  demo(@CurrentUser() user: AuthUser, @Param('code') code: string) {
    return this.payments.confirmDemo(user, code);
  }
}

@ApiTags('payments')
@Public()
@Controller('payments/flutterwave')
export class FlutterwaveWebhookController {
  constructor(private readonly payments: PaymentsService) {}

  /** Set this URL, and FLW_SECRET_HASH, as the webhook on the Flutterwave dashboard. */
  @Post('webhook')
  @HttpCode(200)
  @SkipThrottle({ default: true, phone: true })
  @ApiExcludeEndpoint()
  webhook(@Headers('verif-hash') hash: string | undefined, @Body() body: unknown) {
    return this.payments.webhook(hash, body);
  }
}
