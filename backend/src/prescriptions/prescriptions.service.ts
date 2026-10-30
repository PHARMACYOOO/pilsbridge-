import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { prescriptionCode, withUniqueCode } from '../common/codes.js';
import { OrderStatus, PrescriptionStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReviewDecision, type ReviewPrescriptionDto } from './dto.js';
import { sniff, StorageService } from './storage.service.js';

const REVIEWABLE: PrescriptionStatus[] = [PrescriptionStatus.PENDING, PrescriptionStatus.CLARIFICATION_REQUESTED];

@Injectable()
export class PrescriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async upload(user: AuthUser, file: Express.Multer.File | undefined, prescriberName?: string) {
    if (!file) throw new BadRequestException('Attach a photo or PDF of your prescription');
    const type = sniff(file.buffer);
    if (!type) throw new UnprocessableEntityException('Upload a JPG, PNG, WebP or PDF file');

    const imageKey = await this.storage.save(file.buffer, type);
    return withUniqueCode(prescriptionCode, (code) =>
      this.prisma.$transaction(async (tx) => {
        const rx = await tx.prescription.create({ data: { code, patientId: user.id, imageKey, prescriberName } });
        await this.audit.record({ actorId: user.id, action: 'prescription.uploaded', entityType: 'Prescription', entityId: rx.id }, tx);
        return { id: rx.id, code: rx.code, status: rx.status, createdAt: rx.createdAt };
      }),
    );
  }

  listMine(user: AuthUser) {
    return this.prisma.prescription.findMany({
      where: { patientId: user.id },
      select: { id: true, code: true, status: true, decisionNote: true, createdAt: true, order: { select: { code: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Prescriptions attached to orders at the caller's pharmacy. */
  listForPharmacy(user: AuthUser, status?: PrescriptionStatus) {
    return this.prisma.prescription.findMany({
      where: { order: { pharmacyId: user.pharmacyId! }, ...(status ? { status } : {}) },
      select: {
        id: true, code: true, status: true, prescriberName: true, decisionNote: true, createdAt: true, reviewedAt: true,
        patient: { select: { firstName: true, lastName: true } },
        order: { select: { code: true, items: { select: { quantity: true, product: { select: { name: true, strength: true } } } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async ownForPharmacy(user: AuthUser, code: string) {
    const rx = await this.prisma.prescription.findFirst({ where: { code, order: { pharmacyId: user.pharmacyId! } }, include: { order: true } });
    if (!rx || !rx.order) throw new NotFoundException('Prescription not found');
    return rx as typeof rx & { order: NonNullable<typeof rx.order> };
  }

  /** Pharmacist-only image access; every view is audited. */
  async image(user: AuthUser, code: string) {
    const rx = await this.ownForPharmacy(user, code);
    if (!rx.imageKey) throw new NotFoundException('No image on file');
    const buf = await this.storage.read(rx.imageKey);
    await this.audit.record({ actorId: user.id, action: 'prescription.image_viewed', entityType: 'Prescription', entityId: rx.id });
    return { buf, type: sniff(buf) ?? 'application/octet-stream' };
  }

  async review(user: AuthUser, code: string, dto: ReviewPrescriptionDto) {
    const rx = await this.ownForPharmacy(user, code);
    if (!REVIEWABLE.includes(rx.status)) throw new ConflictException('This prescription has already been decided');

    if (dto.decision === ReviewDecision.APPROVE) {
      const c = dto.checks;
      if (!c?.prescriberAndDateVerified || !c.doseAndQuantityAppropriate || !c.noInteractionOrAllergyConcerns) {
        throw new UnprocessableEntityException('Complete all professional checks before approving');
      }
    } else if (!dto.note?.trim()) {
      throw new UnprocessableEntityException('Add a note for the patient');
    }

    const next = {
      [ReviewDecision.APPROVE]: { rx: PrescriptionStatus.APPROVED, order: OrderStatus.ACCEPTED },
      [ReviewDecision.REJECT]: { rx: PrescriptionStatus.REJECTED, order: OrderStatus.REJECTED },
      [ReviewDecision.CLARIFY]: { rx: PrescriptionStatus.CLARIFICATION_REQUESTED, order: OrderStatus.PHARMACIST_REVIEW },
    }[dto.decision];

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.prescription.updateMany({
        where: { id: rx.id, status: rx.status },
        data: { status: next.rx, reviewedById: user.id, reviewedAt: new Date(), decisionNote: dto.note?.trim() ?? null },
      });
      if (claimed.count === 0) throw new ConflictException('Another pharmacist just reviewed this prescription');

      const moved = await tx.order.updateMany({
        where: { id: rx.order.id, status: OrderStatus.PHARMACIST_REVIEW },
        data: { status: next.order, statusNote: dto.decision === ReviewDecision.APPROVE ? null : dto.note!.trim() },
      });
      if (moved.count === 0) throw new ConflictException('The order is no longer awaiting review');

      await this.audit.record(
        { actorId: user.id, action: `prescription.${dto.decision.toLowerCase()}`, entityType: 'Prescription', entityId: rx.id, metadata: { orderCode: rx.order.code, note: dto.note ?? null, checks: dto.checks ? { prescriberAndDateVerified: dto.checks.prescriberAndDateVerified, doseAndQuantityAppropriate: dto.checks.doseAndQuantityAppropriate, noInteractionOrAllergyConcerns: dto.checks.noInteractionOrAllergyConcerns } : null } },
        tx,
      );
      return tx.prescription.findUniqueOrThrow({ where: { id: rx.id }, select: { code: true, status: true, decisionNote: true, reviewedAt: true, order: { select: { code: true, status: true } } } });
    });
  }
}
