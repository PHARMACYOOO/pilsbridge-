import { Module } from '@nestjs/common';
import { AdminPayoutsController, PharmacySettlementsController } from './settlements.controller.js';
import { SettlementsService } from './settlements.service.js';

@Module({ controllers: [PharmacySettlementsController, AdminPayoutsController], providers: [SettlementsService] })
export class SettlementsModule {}
