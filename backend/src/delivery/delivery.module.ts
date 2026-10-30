import { Module } from '@nestjs/common';
import { ChowdeckRelayAdapter } from './couriers/chowdeck-relay.adapter.js';
import { CourierDispatchService } from './courier-dispatch.service.js';
import { CourierBookingController, CourierWebhookController, DeliveryAreasController, PharmacyDeliveryController, RiderController } from './delivery.controller.js';
import { DeliveryService } from './delivery.service.js';
import { CustomerAlertsService } from './customer-alerts.service.js';
import { DeliveryWatchService } from './delivery-watch.service.js';
import { RiderAlertsService } from './rider-alerts.service.js';

@Module({
  controllers: [DeliveryAreasController, CourierWebhookController, RiderController, PharmacyDeliveryController, CourierBookingController],
  providers: [DeliveryService, RiderAlertsService, CustomerAlertsService, DeliveryWatchService, ChowdeckRelayAdapter, CourierDispatchService],
  exports: [DeliveryService, RiderAlertsService, CustomerAlertsService, DeliveryWatchService, CourierDispatchService],
})
export class DeliveryModule {}
