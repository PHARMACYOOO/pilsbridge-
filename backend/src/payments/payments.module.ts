import { Module } from '@nestjs/common';
import { FlutterwaveService } from './flutterwave.service.js';
import { FlutterwaveWebhookController, OrderPaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

@Module({ controllers: [OrderPaymentsController, FlutterwaveWebhookController], providers: [PaymentsService, FlutterwaveService] })
export class PaymentsModule {}
