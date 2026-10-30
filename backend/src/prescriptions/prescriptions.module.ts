import { Module } from '@nestjs/common';
import { PharmacyPrescriptionsController, PrescriptionsController } from './prescriptions.controller.js';
import { PrescriptionsService } from './prescriptions.service.js';
import { StorageService } from './storage.service.js';

@Module({
  controllers: [PrescriptionsController, PharmacyPrescriptionsController],
  providers: [PrescriptionsService, StorageService],
})
export class PrescriptionsModule {}
