import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators.js';
import { BatchStatus, PharmacyStatus, ProductClass, type Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Stock a patient can actually be sold: saleable, in date, in stock, at a verified pharmacy. */
export const sellableBatch = (): Prisma.BatchWhereInput => ({
  status: BatchStatus.SALEABLE,
  quantity: { gt: 0 },
  expiresAt: { gt: new Date() },
  pharmacy: { status: PharmacyStatus.VERIFIED },
});

@ApiTags('catalog')
@Public()
@Controller('products')
export class CatalogController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'category', required: false })
  async list(@Query('q') q?: string, @Query('category') category?: string) {
    const term = q?.trim();
    const products = await this.prisma.product.findMany({
      where: {
        classification: { not: ProductClass.CONTROLLED },
        ...(category ? { category } : {}),
        ...(term
          ? {
              OR: [
                { name: { contains: term, mode: 'insensitive' } },
                { genericName: { contains: term, mode: 'insensitive' } },
                { uses: { contains: term, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: { batches: { where: sellableBatch(), select: { pharmacyId: true, priceKobo: true } } },
      orderBy: { name: 'asc' },
    });
    return products.map(({ batches, ...p }) => ({
      ...p,
      pharmaciesInStock: new Set(batches.map((b) => b.pharmacyId)).size,
      fromPriceKobo: batches.length ? Math.min(...batches.map((b) => b.priceKobo)) : null,
    }));
  }

  @Get(':slug')
  async get(@Param('slug') slug: string) {
    const product = await this.prisma.product.findUnique({ where: { slug } });
    if (!product || product.classification === ProductClass.CONTROLLED) throw new NotFoundException('Product not found');
    return product;
  }
}
