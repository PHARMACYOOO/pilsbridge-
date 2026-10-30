import { Module } from '@nestjs/common';
import { AdminIncidentsController, PatientIncidentsController, PharmacyIncidentsController, RiderIncidentsController } from './incidents.controller.js';
import { IncidentsService } from './incidents.service.js';

@Module({
  controllers: [PatientIncidentsController, PharmacyIncidentsController, RiderIncidentsController, AdminIncidentsController],
  providers: [IncidentsService],
})
export class IncidentsModule {}
