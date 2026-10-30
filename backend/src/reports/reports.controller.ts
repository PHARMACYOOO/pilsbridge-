import { Body, Controller, Get, Header, Param, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, Roles } from '../common/decorators.js';
import { Role } from '../generated/prisma/client.js';
import { CreateInvoiceDto, ReconcileInvoiceDto } from './dto.js';
import { ReportsService } from './reports.service.js';

@ApiTags('admin · reports')
@ApiBearerAuth()
@Roles(Role.PLATFORM_ADMIN)
@Controller('admin')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /** Delivery performance against the pilot targets, overall, by provider and by pharmacy. */
  @Get('reports/delivery')
  @ApiQuery({ name: 'from', required: false, example: '2026-10-05' })
  @ApiQuery({ name: 'to', required: false, example: '2026-10-11' })
  delivery(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.delivery(from, to);
  }

  /** Every delivery attempt in the period as CSV, for finance. */
  @Get('reports/deliveries.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async csv(@Res({ passthrough: true }) res: Response, @Query('from') from?: string, @Query('to') to?: string) {
    const { filename, body } = await this.reports.csv(from, to);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return body;
  }

  @Get('invoices')
  invoices() {
    return this.reports.invoices();
  }

  /** Enter a courier's invoice (lines: their delivery reference and amount). */
  @Post('couriers/:id/invoices')
  createInvoice(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateInvoiceDto) {
    return this.reports.createInvoice(user, id, dto);
  }

  /** The invoice checked line by line against our deliveries. */
  @Get('invoices/:id')
  invoice(@Param('id') id: string) {
    return this.reports.invoice(id);
  }

  @Post('invoices/:id/reconcile')
  reconcile(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReconcileInvoiceDto) {
    return this.reports.markReconciled(user, id, dto.note);
  }
}
