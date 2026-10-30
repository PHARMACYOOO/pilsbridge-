import { Body, Controller, Get, HttpCode, Param, ParseEnumPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../common/auth-user.js';
import { CurrentUser, PharmacyStaff, Roles } from '../common/decorators.js';
import { BatchStatus, Role } from '../generated/prisma/client.js';
import { AdjustBatchDto, QuarantineDto, ReceiveBatchDto, ReleaseDto } from './dto.js';
import { InventoryService } from './inventory.service.js';

@ApiTags('pharmacy · inventory')
@ApiBearerAuth()
@PharmacyStaff()
@Controller('pharmacy/inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  @ApiQuery({ name: 'status', enum: BatchStatus, required: false })
  list(@CurrentUser() user: AuthUser, @Query('status', new ParseEnumPipe(BatchStatus, { optional: true })) status?: BatchStatus) {
    return this.inventory.list(user, status);
  }

  @Post('batches')
  receive(@CurrentUser() user: AuthUser, @Body() dto: ReceiveBatchDto) {
    return this.inventory.receive(user, dto);
  }

  @Post('batches/:id/adjust')
  @HttpCode(200)
  adjust(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AdjustBatchDto) {
    return this.inventory.adjust(user, id, dto);
  }

  @Post('batches/:id/quarantine')
  @HttpCode(200)
  quarantine(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: QuarantineDto) {
    return this.inventory.quarantine(user, id, dto.reason);
  }

  @Post('batches/:id/release')
  @HttpCode(200)
  @Roles(Role.PHARMACIST)
  release(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReleaseDto) {
    return this.inventory.release(user, id, dto);
  }
}
