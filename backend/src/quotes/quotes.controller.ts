import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiProperty, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsIn, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
import { sellableBatch } from '../catalog/catalog.controller.js';
import { Public } from '../common/decorators.js';
import { AREA_KEYS, areaByKey } from '../delivery/areas.js';
import { distanceKm, etaMinutes } from '../delivery/eta.js';
import { FEES } from '../common/fees.js';
import { PharmacyStatus, ProductClass } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

class QuoteItemDto {
  @ApiProperty() @IsString() productId: string;
  @ApiProperty({ example: 1 }) @IsInt() @Min(1) @Max(20) quantity: number;
}

class QuoteDto {
  @ApiProperty({ type: [QuoteItemDto] })
  @ValidateNested({ each: true })
  @Type(() => QuoteItemDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  items: QuoteItemDto[];

  @ApiProperty({ enum: AREA_KEYS, required: false, description: 'Delivery area: adds estimated delivery times and ranks the fastest first' })
  @IsOptional()
  @IsIn(AREA_KEYS)
  area?: string;
}

/**
 * Prices a basket at every verified pharmacy, using the batch FEFO would dispense first. With a
 * delivery area, each quote carries an estimated delivery time, and pharmacies that have
 * everything come first, fastest first.
 */
@ApiTags('catalog')
@Public()
@Controller('quotes')
export class QuotesController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @HttpCode(200)
  async quote(@Body() dto: QuoteDto) {
    const ids = [...new Set(dto.items.map((i) => i.productId))];
    const [pharmacies, products] = await Promise.all([
      this.prisma.pharmacy.findMany({ where: { status: PharmacyStatus.VERIFIED }, orderBy: { name: 'asc' } }),
      this.prisma.product.findMany({
        where: { id: { in: ids }, classification: { not: ProductClass.CONTROLLED } },
        include: { batches: { where: sellableBatch(), orderBy: { expiresAt: 'asc' }, select: { pharmacyId: true, quantity: true, priceKobo: true } } },
      }),
    ]);

    const area = areaByKey(dto.area);
    // With an area, leave out pharmacies that don't deliver there (no areas listed = every area).
    const serving = area ? pharmacies.filter((ph) => !ph.coverageAreas.length || ph.coverageAreas.includes(area.key)) : pharmacies;
    const quotes = serving.map((ph) => {
      const lines = dto.items.map((item) => {
        const p = products.find((x) => x.id === item.productId);
        const batches = p?.batches.filter((b) => b.pharmacyId === ph.id) ?? [];
        const stock = batches.reduce((s, b) => s + b.quantity, 0);
        const available = !!p && stock >= item.quantity && (!p.coldChain || ph.coldChain);
        return { productId: item.productId, quantity: item.quantity, available, unitPriceKobo: available ? batches[0].priceKobo : null, coldChain: !!p?.coldChain };
      });
      const priced = lines.filter((l) => l.available);
      const subtotalKobo = priced.reduce((s, l) => s + l.unitPriceKobo! * l.quantity, 0);
      const deliveryKobo = !priced.length ? 0 : priced.some((l) => l.coldChain) ? FEES.coldChainDeliveryKobo : FEES.deliveryKobo;
      const serviceKobo = priced.length ? FEES.serviceKobo : 0;
      const eta = area ? etaMinutes(ph, area) : null;
      return {
        pharmacy: { id: ph.id, name: ph.name, area: ph.area, coldChain: ph.coldChain },
        etaMinutes: eta,
        distanceKm: area && ph.lat != null && ph.lng != null ? Math.round(distanceKm({ lat: ph.lat, lng: ph.lng }, area) * 10) / 10 : null,
        lines,
        unavailable: lines.length - priced.length,
        subtotalKobo,
        deliveryKobo,
        serviceKobo,
        totalKobo: subtotalKobo + deliveryKobo + serviceKobo,
      };
    });
    if (!area) return quotes;
    const rank = (q: (typeof quotes)[number]) => [q.unavailable > 0 ? 1 : 0, q.etaMinutes ?? Infinity];
    return quotes.sort((a, b) => {
      const [ua, ea] = rank(a);
      const [ub, eb] = rank(b);
      return ua - ub || ea - eb;
    });
  }
}
