import { Body, Controller, Get, Param, ParseEnumPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, PharmacyStaff, Roles } from '../common/decorators.js';
import { IncidentStatus, Role } from '../generated/prisma/client.js';
import { ReportIncidentDto, ResolveIncidentDto } from './dto.js';
import { IncidentsService } from './incidents.service.js';

@ApiTags('incidents')
@ApiBearerAuth()
@Roles(Role.PATIENT)
@Controller('orders')
export class PatientIncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  /** Something wrong with what arrived (damaged, opened, wrong item…). */
  @Post(':code/incidents')
  report(@CurrentUser() user: AuthUser, @Param('code') code: string, @Body() dto: ReportIncidentDto) {
    return this.incidents.report(user, code, dto);
  }
}

@ApiTags('incidents')
@ApiBearerAuth()
@PharmacyStaff()
@Controller('pharmacy/orders')
export class PharmacyIncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Post(':code/incidents')
  report(@CurrentUser() user: AuthUser, @Param('code') code: string, @Body() dto: ReportIncidentDto) {
    return this.incidents.report(user, code, dto);
  }
}

@ApiTags('incidents')
@ApiBearerAuth()
@Roles(Role.RIDER)
@Controller('rider/orders')
export class RiderIncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  /** By order code; only for a job the rider holds. */
  @Post(':code/incidents')
  report(@CurrentUser() user: AuthUser, @Param('code') code: string, @Body() dto: ReportIncidentDto) {
    return this.incidents.report(user, code, dto);
  }
}

@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.PLATFORM_ADMIN)
@Controller('admin/incidents')
export class AdminIncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Get()
  @ApiQuery({ name: 'status', enum: IncidentStatus, required: false })
  list(@Query('status', new ParseEnumPipe(IncidentStatus, { optional: true })) status?: IncidentStatus) {
    return this.incidents.list(status);
  }

  @Post(':id/resolve')
  resolve(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ResolveIncidentDto) {
    return this.incidents.resolve(user, id, dto.resolution);
  }

  /** Operations can log an incident on any order (e.g. reported by phone). */
  @Post('orders/:code')
  report(@CurrentUser() user: AuthUser, @Param('code') code: string, @Body() dto: ReportIncidentDto) {
    return this.incidents.report(user, code, dto);
  }
}
