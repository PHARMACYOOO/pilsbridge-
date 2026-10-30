import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { isUniqueViolation } from '../common/codes.js';
import { SHORT_DATED_DAYS } from '../common/fees.js';
import { BatchStatus, ProductClass } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AdjustBatchDto, ReceiveBatchDto, ReleaseDto } from './dto.js';

const DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** All batches at the caller's pharmacy, first-expiry-first-out. */
  async list(user: AuthUser, status?: BatchStatus) {
    const batches = await this.prisma.batch.findMany({
      where: { pharmacyId: user.pharmacyId!, ...(status ? { status } : {}) },
      include: { product: { select: { name: true, strength: true, classification: true, coldChain: true } } },
      orderBy: [{ expiresAt: 'asc' }, { batchNumber: 'asc' }],
    });
    const now = Date.now();
    return batches.map((b) => ({
      ...b,
      expired: b.expiresAt.getTime() <= now,
      shortDated: b.expiresAt.getTime() - now <= SHORT_DATED_DAYS * DAY,
    }));
  }

  /** Scoped lookup: a batch from another pharmacy is reported as not found. */
  private async own(user: AuthUser, id: string) {
    const batch = await this.prisma.batch.findFirst({ where: { id, pharmacyId: user.pharmacyId! } });
    if (!batch) throw new NotFoundException('Batch not found');
    return batch;
  }

  async receive(user: AuthUser, dto: ReceiveBatchDto) {
    const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) throw new NotFoundException('Product not found');
    if (product.classification === ProductClass.CONTROLLED) throw new BadRequestException('Controlled medicines can’t be stocked on Pilbridge');
    const expiresAt = new Date(dto.expiresAt);
    if (expiresAt.getTime() <= Date.now()) throw new BadRequestException('This batch has already expired');

    try {
      return await this.prisma.$transaction(async (tx) => {
        const batch = await tx.batch.create({
          data: { pharmacyId: user.pharmacyId!, productId: dto.productId, batchNumber: dto.batchNumber.trim(), expiresAt, quantity: dto.quantity, priceKobo: dto.priceKobo, location: dto.location },
        });
        await this.audit.record({ actorId: user.id, action: 'batch.received', entityType: 'Batch', entityId: batch.id, metadata: { quantity: dto.quantity } }, tx);
        return batch;
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('This batch number is already recorded for this product');
      throw e;
    }
  }

  async adjust(user: AuthUser, id: string, dto: AdjustBatchDto) {
    const batch = await this.own(user, id);
    return this.prisma.$transaction(async (tx) => {
      // Conditional update guards against concurrent allocations taking stock below zero.
      const res = await tx.batch.updateMany({
        where: { id: batch.id, quantity: { gte: -Math.min(dto.delta, 0) } },
        data: { quantity: { increment: dto.delta } },
      });
      if (res.count === 0) throw new BadRequestException('Not enough stock to remove that many');
      await this.audit.record({ actorId: user.id, action: 'batch.adjusted', entityType: 'Batch', entityId: batch.id, metadata: { delta: dto.delta, reason: dto.reason } }, tx);
      return tx.batch.findUniqueOrThrow({ where: { id: batch.id } });
    });
  }

  async quarantine(user: AuthUser, id: string, reason: string) {
    const batch = await this.own(user, id);
    if (batch.status !== BatchStatus.SALEABLE) throw new BadRequestException('Only saleable stock can be quarantined');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.batch.update({ where: { id: batch.id }, data: { status: BatchStatus.QUARANTINED, quarantineReason: reason } });
      await this.audit.record({ actorId: user.id, action: 'batch.quarantined', entityType: 'Batch', entityId: batch.id, metadata: { reason } }, tx);
      return updated;
    });
  }

  /** Pharmacist-only: return quarantined stock to sale after a quality assessment. Recalled stock can't be released here. */
  async release(user: AuthUser, id: string, dto: ReleaseDto) {
    const batch = await this.own(user, id);
    if (batch.status !== BatchStatus.QUARANTINED) throw new BadRequestException('Only quarantined stock can be released');
    if (batch.expiresAt.getTime() <= Date.now()) throw new BadRequestException('Expired stock can’t be released');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.batch.update({ where: { id: batch.id }, data: { status: BatchStatus.SALEABLE, quarantineReason: null } });
      await this.audit.record({ actorId: user.id, action: 'batch.released', entityType: 'Batch', entityId: batch.id, metadata: { note: dto.note ?? null, previousReason: batch.quarantineReason } }, tx);
      return updated;
    });
  }
}
