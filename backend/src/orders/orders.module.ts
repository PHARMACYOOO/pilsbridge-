import { Module } from '@nestjs/common';
import { DeliveryModule } from '../delivery/delivery.module.js';
import { OrdersController, PharmacyOrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({ imports: [DeliveryModule], controllers: [OrdersController, PharmacyOrdersController], providers: [OrdersService] })
export class OrdersModule {}
