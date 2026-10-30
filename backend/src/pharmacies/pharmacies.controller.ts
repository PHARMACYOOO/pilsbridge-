import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators.js';
import { PharmacyStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

@ApiTags('pharmacies')
@Public()
@Controller('pharmacies')
export class PharmaciesController {
  constructor(private readonly prisma: PrismaService) {}

  /** Verified partner pharmacies only. */
  @Get()
  list() {
    return this.prisma.pharmacy.findMany({
      where: { status: PharmacyStatus.VERIFIED },
      select: { id: true, slug: true, name: true, area: true, coldChain: true, coverageAreas: true, openDays: true, opensAt: true, lastOrderAt: true },
      orderBy: { name: 'asc' },
    });
  }
}
