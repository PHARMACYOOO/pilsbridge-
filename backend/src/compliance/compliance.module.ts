import { Module } from '@nestjs/common';
import { StorageService } from '../prescriptions/storage.service.js';
import { ComplianceWatchService } from './compliance-watch.service.js';
import { AdminComplianceController, PharmacyComplianceController } from './compliance.controller.js';
import { ComplianceService } from './compliance.service.js';

@Module({
  controllers: [PharmacyComplianceController, AdminComplianceController],
  providers: [ComplianceService, ComplianceWatchService, StorageService],
  exports: [ComplianceService],
})
export class ComplianceModule {}
