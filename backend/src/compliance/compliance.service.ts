import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { DocumentKind, DocumentStatus, Role, type ComplianceDocument } from '../generated/prisma/client.js';
import { sniff, StorageService } from '../prescriptions/storage.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StaffTextsService } from '../sms/staff-texts.service.js';
import { DOCUMENT_LABELS, type ReviewDocumentDto, type UploadDocumentDto } from './dto.js';
import { expiryState } from './expiry.js';

/** Unreviewed uploads a pharmacy may have at once, so storage can't be filled with junk. */
const MAX_PENDING = 20;

/** Never expose the storage key. */
const view = ({ fileKey: _key, ...d }: ComplianceDocument, now = new Date()) => ({ ...d, label: DOCUMENT_LABELS[d.kind].name, expiry: d.status === DocumentStatus.VERIFIED ? expiryState(d.expiresAt, now) : null });

/**
 * Licences and certificates: pharmacies upload them, platform admins verify them against the
 * issuing body. A verified premises licence updates the pharmacy's licence number and expiry,
 * which ComplianceWatchService enforces.
 */
@Injectable()
export class ComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly texts: StaffTextsService,
  ) {}

  /** Each document type with its current verified copy and any upload waiting for review, plus the full history. */
  async overview(user: AuthUser) {
    const now = new Date();
    const [pharmacy, docs] = await Promise.all([
      this.prisma.pharmacy.findUniqueOrThrow({ where: { id: user.pharmacyId! }, select: { name: true, status: true, premisesLicenceNo: true, licenceExpiresAt: true, suspendedReason: true } }),
      this.prisma.complianceDocument.findMany({ where: { pharmacyId: user.pharmacyId! }, orderBy: { createdAt: 'desc' } }),
    ]);
    const kinds = Object.values(DocumentKind).map((kind) => {
      const current = docs.find((d) => d.kind === kind && d.status === DocumentStatus.VERIFIED) ?? null;
      const pending = docs.find((d) => d.kind === kind && d.status === DocumentStatus.PENDING && (!current || d.createdAt > current.createdAt)) ?? null;
      const rejected = docs.find((d) => d.kind === kind && d.status === DocumentStatus.REJECTED && (!current || d.createdAt > current.createdAt) && (!pending || d.createdAt > pending.createdAt)) ?? null;
      // The premises licence on the pharmacy record counts even before a copy is uploaded here.
      const expiresAt = kind === DocumentKind.PREMISES_LICENCE ? pharmacy.licenceExpiresAt : (current?.expiresAt ?? null);
      const state = current || kind === DocumentKind.PREMISES_LICENCE ? expiryState(expiresAt, now) : 'missing';
      return {
        kind,
        ...DOCUMENT_LABELS[kind],
        reference: kind === DocumentKind.PREMISES_LICENCE ? pharmacy.premisesLicenceNo : (current?.reference ?? null),
        expiresAt,
        state,
        current: current && view(current, now),
        pending: pending && view(pending, now),
        rejected: rejected && view(rejected, now),
      };
    });
    return { pharmacy, kinds, documents: docs.map((d) => view(d, now)) };
  }

  async upload(user: AuthUser, file: Express.Multer.File | undefined, dto: UploadDocumentDto) {
    if (!file) throw new BadRequestException('Attach the document (PDF or photo)');
    const type = sniff(file.buffer);
    if (!type) throw new UnprocessableEntityException('Upload a PDF, JPG, PNG or WebP file');
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (DOCUMENT_LABELS[dto.kind].expires && !expiresAt) throw new UnprocessableEntityException('Enter the expiry date shown on the document');
    if (expiresAt && expiresAt.getTime() <= Date.now()) throw new UnprocessableEntityException('This document has already expired — upload the renewed one');
    const pending = await this.prisma.complianceDocument.count({ where: { pharmacyId: user.pharmacyId!, status: DocumentStatus.PENDING } });
    if (pending >= MAX_PENDING) throw new ConflictException('You have many documents waiting for review — we’ll get to them shortly');

    const fileKey = await this.storage.save(file.buffer, type, 'compliance');
    const doc = await this.prisma.$transaction(async (tx) => {
      const d = await tx.complianceDocument.create({
        data: {
          pharmacyId: user.pharmacyId!,
          kind: dto.kind,
          reference: dto.reference.trim(),
          issuer: dto.issuer?.trim() || DOCUMENT_LABELS[dto.kind].issuer || 'Not stated',
          expiresAt,
          fileKey,
          fileName: file.originalname?.slice(0, 120) || null,
          uploadedById: user.id,
        },
      });
      await this.audit.record({ actorId: user.id, action: 'document.uploaded', entityType: 'ComplianceDocument', entityId: d.id, metadata: { kind: d.kind, reference: d.reference } }, tx);
      return d;
    });
    this.texts.background(() => this.texts.admins(`A pharmacy uploaded a ${DOCUMENT_LABELS[dto.kind].name.toLowerCase()} to verify. See Compliance on the admin page.`));
    return view(doc);
  }

  /** The file, to the pharmacy's own staff or a platform admin. Every view is audited. */
  async file(user: AuthUser, id: string) {
    const doc = await this.prisma.complianceDocument.findFirst({ where: { id, ...(user.role === Role.PLATFORM_ADMIN ? {} : { pharmacyId: user.pharmacyId! }) } });
    if (!doc) throw new NotFoundException('Document not found');
    const buf = await this.storage.read(doc.fileKey, 'compliance');
    await this.audit.record({ actorId: user.id, action: 'document.viewed', entityType: 'ComplianceDocument', entityId: doc.id });
    return { buf, type: sniff(buf) ?? 'application/octet-stream' };
  }

  // ——— Admin ———

  async forReview(status: DocumentStatus = DocumentStatus.PENDING) {
    const docs = await this.prisma.complianceDocument.findMany({ where: { status }, include: { pharmacy: { select: { id: true, name: true, area: true } } }, orderBy: { createdAt: 'asc' }, take: 500 });
    return docs.map(({ pharmacy, ...d }) => ({ ...view(d), pharmacy }));
  }

  async review(admin: AuthUser, id: string, dto: ReviewDocumentDto) {
    const doc = await this.prisma.complianceDocument.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.status !== DocumentStatus.PENDING) throw new ConflictException('This document has already been reviewed');
    if (dto.decision === 'REJECT' && !dto.note?.trim()) throw new UnprocessableEntityException('Say why, so the pharmacy can fix it');
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : doc.expiresAt;
    const verifying = dto.decision === 'VERIFY';
    if (verifying && DOCUMENT_LABELS[doc.kind].expires && !expiresAt) throw new UnprocessableEntityException('Enter the expiry date you checked');
    if (verifying && expiresAt && expiresAt.getTime() <= Date.now()) throw new UnprocessableEntityException('This document has expired — reject it and ask for the renewal');

    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.complianceDocument.updateMany({
        where: { id, status: DocumentStatus.PENDING },
        data: { status: verifying ? DocumentStatus.VERIFIED : DocumentStatus.REJECTED, reviewNote: dto.note?.trim() ?? null, reviewedById: admin.id, reviewedAt: new Date(), expiresAt, reminderDays: null },
      });
      if (claimed.count === 0) throw new ConflictException('Someone else just reviewed this document');
      if (verifying && doc.kind === DocumentKind.PREMISES_LICENCE) {
        // The renewed licence becomes the pharmacy's licence of record. A suspended pharmacy stays suspended until an admin reinstates it.
        await tx.pharmacy.update({ where: { id: doc.pharmacyId }, data: { premisesLicenceNo: doc.reference, licenceExpiresAt: expiresAt!, licenceReminderDays: null } });
      }
      await this.audit.record({ actorId: admin.id, action: verifying ? 'document.verified' : 'document.rejected', entityType: 'ComplianceDocument', entityId: id, metadata: { kind: doc.kind, note: dto.note ?? null, expiresAt: expiresAt?.toISOString() ?? null } }, tx);
      return tx.complianceDocument.findUniqueOrThrow({ where: { id } });
    });
    const label = DOCUMENT_LABELS[doc.kind].name;
    this.texts.background(() => this.texts.pharmacists(doc.pharmacyId, verifying ? `Pilbridge verified your ${label.toLowerCase()}.` : `Pilbridge couldn't verify your ${label.toLowerCase()}. See Compliance in the portal for why.`));
    return view(updated);
  }
}
