import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import type { AuthUser } from '../common/auth-user.js';
import { transferCode, withUniqueCode } from '../common/codes.js';
import { TRANSFER_MIN_DAYS_LEFT } from '../common/fees.js';
import { BatchStatus, PharmacyStatus, Role, TransferStatus, type Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StaffTextsService } from '../sms/staff-texts.service.js';
import type { CreateTransferDto, ReceiveTransferDto } from './dto.js';
import { receiptHold, transferBlock } from './rules.js';

const DAY = 24 * 60 * 60_000;
const OPEN: TransferStatus[] = [TransferStatus.DRAFT, TransferStatus.OFFERED, TransferStatus.ACCEPTED, TransferStatus.IN_TRANSIT];

const transferInclude = {
  batch: { select: { id: true, batchNumber: true, expiresAt: true, status: true, quantity: true, product: { select: { id: true, name: true, strength: true, classification: true, coldChain: true } } } },
  fromPharmacy: { select: { id: true, name: true, area: true } },
  toPharmacy: { select: { id: true, name: true, area: true } },
} satisfies Prisma.TransferInclude;
type Row = Prisma.TransferGetPayload<{ include: typeof transferInclude }>;

/**
 * Moving surplus stock between verified pharmacies, with a pharmacist's approval at both ends:
 * DRAFT (sending staff) → OFFERED (sending pharmacist) → ACCEPTED (receiving pharmacist; the
 * stock is reserved out of the sending batch) → IN_TRANSIT → RECEIVED (receiving pharmacist checks
 * it in). Stock that went on hold or expired on the way is checked in to quarantine, never on sale.
 */
@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly texts: StaffTextsService,
  ) {}

  private present(t: Row, pharmacyId: string, now = new Date()) {
    const { batch, ...rest } = t;
    return {
      ...rest,
      direction: t.fromPharmacyId === pharmacyId ? ('OUTGOING' as const) : ('INCOMING' as const),
      product: batch.product,
      batch: { batchNumber: batch.batchNumber, expiresAt: batch.expiresAt, status: batch.status },
      // Shown on open transfers: why it can't go ahead as things stand.
      blocked: OPEN.includes(t.status) ? (t.status === TransferStatus.IN_TRANSIT ? receiptHold(batch, now) : transferBlock(batch, now)) : null,
    };
  }

  /** Outgoing and incoming transfers, plus open offers to the whole network from other pharmacies. */
  async list(user: AuthUser) {
    const me = user.pharmacyId!;
    const rows = await this.prisma.transfer.findMany({
      where: {
        OR: [
          { fromPharmacyId: me },
          { toPharmacyId: me, status: { not: TransferStatus.DRAFT } },
          { toPharmacyId: null, status: TransferStatus.OFFERED, fromPharmacyId: { not: me }, fromPharmacy: { status: PharmacyStatus.VERIFIED } },
        ],
      },
      include: transferInclude,
      orderBy: { updatedAt: 'desc' },
      take: 300,
    });
    const now = new Date();
    return rows.map((t) => this.present(t, me, now));
  }

  private async find(code: string) {
    const t = await this.prisma.transfer.findUnique({ where: { code }, include: transferInclude });
    if (!t) throw new NotFoundException('Transfer not found');
    return t;
  }

  /** The sending side's transfer; others get "not found". */
  private async outgoing(user: AuthUser, code: string) {
    const t = await this.find(code);
    if (t.fromPharmacyId !== user.pharmacyId) throw new NotFoundException('Transfer not found');
    return t;
  }

  /** A transfer this pharmacy may receive: offered to it, or to the whole network. */
  private async incoming(user: AuthUser, code: string) {
    const t = await this.find(code);
    const visible = t.fromPharmacyId !== user.pharmacyId && t.status !== TransferStatus.DRAFT && (t.toPharmacyId === user.pharmacyId || (t.toPharmacyId === null && t.status === TransferStatus.OFFERED));
    if (!visible) throw new NotFoundException('Transfer not found');
    return t;
  }

  private async requireVerified(pharmacyId: string, who: 'yours' | 'theirs') {
    const ph = await this.prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { status: true } });
    if (ph?.status !== PharmacyStatus.VERIFIED) {
      throw new UnprocessableEntityException(who === 'yours' ? 'Your pharmacy must be verified and active to transfer stock' : 'That pharmacy isn’t active on Pilbridge right now');
    }
  }

  private async view(id: string, pharmacyId: string) {
    return this.present(await this.prisma.transfer.findUniqueOrThrow({ where: { id }, include: transferInclude }), pharmacyId);
  }

  async create(user: AuthUser, dto: CreateTransferDto) {
    const me = user.pharmacyId!;
    await this.requireVerified(me, 'yours');
    const batch = await this.prisma.batch.findFirst({ where: { id: dto.batchId, pharmacyId: me }, include: { product: true } });
    if (!batch) throw new NotFoundException('Batch not found');
    const block = transferBlock(batch, new Date());
    if (block) throw new UnprocessableEntityException(block);
    if (dto.quantity > batch.quantity) throw new UnprocessableEntityException(`Only ${batch.quantity} pack(s) of this batch in stock`);
    if (dto.toPharmacyId) {
      if (dto.toPharmacyId === me) throw new BadRequestException('Choose another pharmacy');
      await this.requireVerified(dto.toPharmacyId, 'theirs');
    }

    const t = await withUniqueCode(transferCode, (code) =>
      this.prisma.$transaction(async (tx) => {
        const created = await tx.transfer.create({ data: { code, fromPharmacyId: me, toPharmacyId: dto.toPharmacyId ?? null, batchId: batch.id, quantity: dto.quantity, note: dto.note?.trim() ?? null, createdById: user.id } });
        await this.audit.record({ actorId: user.id, action: 'transfer.created', entityType: 'Transfer', entityId: created.id, metadata: { code, batchId: batch.id, quantity: dto.quantity, toPharmacyId: dto.toPharmacyId ?? null } }, tx);
        return created;
      }),
    );
    return this.view(t.id, me);
  }

  /** Sending pharmacist approves: the offer goes to the named pharmacy, or to the network. Stock isn't reserved until someone accepts. */
  async publish(user: AuthUser, code: string) {
    const t = await this.outgoing(user, code);
    if (t.status !== TransferStatus.DRAFT) throw new ConflictException('Only a draft can be published');
    await this.requireVerified(t.fromPharmacyId, 'yours');
    const block = transferBlock(t.batch, new Date());
    if (block) throw new UnprocessableEntityException(block);
    if (t.quantity > t.batch.quantity) throw new UnprocessableEntityException(`Only ${t.batch.quantity} pack(s) of this batch left — withdraw this draft and create a smaller one`);
    if (t.toPharmacyId) await this.requireVerified(t.toPharmacyId, 'theirs');

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.transfer.updateMany({ where: { id: t.id, status: TransferStatus.DRAFT }, data: { status: TransferStatus.OFFERED, publishedById: user.id, publishedAt: new Date() } });
      if (claimed.count === 0) throw new ConflictException('This transfer was just updated — refresh and try again');
      await this.audit.record({ actorId: user.id, action: 'transfer.offered', entityType: 'Transfer', entityId: t.id, metadata: { toPharmacyId: t.toPharmacyId } }, tx);
    });
    if (t.toPharmacyId) {
      const to = t.toPharmacyId;
      this.texts.background(() => this.texts.pharmacists(to, `${t.fromPharmacy.name.slice(0, 30)} offered you ${t.quantity} x ${t.batch.product.name.slice(0, 30)} (${t.code}). Review it under Transfers in the portal.`));
    }
    return this.view(t.id, user.pharmacyId!);
  }

  /** Receiving pharmacist approves. The stock is reserved out of the sending batch now. */
  async accept(user: AuthUser, code: string) {
    const me = user.pharmacyId!;
    const t = await this.incoming(user, code);
    if (t.status !== TransferStatus.OFFERED) throw new ConflictException('This transfer is no longer open');
    await this.requireVerified(me, 'yours');
    await this.requireVerified(t.fromPharmacyId, 'theirs');
    const now = new Date();
    const block = transferBlock(t.batch, now);
    if (block) throw new UnprocessableEntityException(block);

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.transfer.updateMany({
        where: { id: t.id, status: TransferStatus.OFFERED, OR: [{ toPharmacyId: null }, { toPharmacyId: me }] },
        data: { status: TransferStatus.ACCEPTED, toPharmacyId: me, acceptedById: user.id, acceptedAt: now },
      });
      if (claimed.count === 0) throw new ConflictException('Another pharmacy just accepted this offer');
      // Conditional, so a sale or adjustment at the same moment can't take the batch below zero.
      const reserved = await tx.batch.updateMany({
        where: { id: t.batchId, status: BatchStatus.SALEABLE, quantity: { gte: t.quantity }, expiresAt: { gt: new Date(now.getTime() + TRANSFER_MIN_DAYS_LEFT * DAY) } },
        data: { quantity: { decrement: t.quantity } },
      });
      if (reserved.count === 0) throw new ConflictException('The sending pharmacy no longer has that much of this batch — ask them to make a new offer');
      await this.audit.record({ actorId: user.id, action: 'transfer.accepted', entityType: 'Transfer', entityId: t.id, metadata: { toPharmacyId: me } }, tx);
      await this.audit.record({ actorId: user.id, action: 'batch.reserved_for_transfer', entityType: 'Batch', entityId: t.batchId, metadata: { transfer: t.code, quantity: t.quantity } }, tx);
    });
    this.texts.background(() => this.texts.pharmacists(t.fromPharmacyId, `Transfer ${t.code} (${t.quantity} x ${t.batch.product.name.slice(0, 30)}) was accepted. Pack it and mark it sent in the portal.`));
    return this.view(t.id, me);
  }

  /** The pharmacy an offer was made to turns it down. Offers to the whole network are simply left. */
  async decline(user: AuthUser, code: string, reason: string) {
    const t = await this.incoming(user, code);
    if (t.status !== TransferStatus.OFFERED || t.toPharmacyId !== user.pharmacyId) throw new ConflictException('Only an offer made to your pharmacy can be declined');
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.transfer.updateMany({ where: { id: t.id, status: TransferStatus.OFFERED, toPharmacyId: user.pharmacyId }, data: { status: TransferStatus.DECLINED, closedById: user.id, closedAt: new Date(), closeReason: reason.trim() } });
      if (claimed.count === 0) throw new ConflictException('This transfer was just updated — refresh and try again');
      await this.audit.record({ actorId: user.id, action: 'transfer.declined', entityType: 'Transfer', entityId: t.id, metadata: { reason } }, tx);
    });
    return this.view(t.id, user.pharmacyId!);
  }

  /** The sending pharmacy hands the parcel over. Stock that went on hold since it was accepted can't leave. */
  async dispatch(user: AuthUser, code: string) {
    const t = await this.outgoing(user, code);
    if (t.status !== TransferStatus.ACCEPTED) throw new ConflictException('Only an accepted transfer can be sent');
    const hold = receiptHold(t.batch, new Date());
    if (hold) throw new UnprocessableEntityException(`${t.batch.status === BatchStatus.SALEABLE ? 'This batch has expired' : `This batch is ${t.batch.status.toLowerCase().replace('_', ' ')}`} — cancel the transfer instead`);
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.transfer.updateMany({ where: { id: t.id, status: TransferStatus.ACCEPTED }, data: { status: TransferStatus.IN_TRANSIT, dispatchedById: user.id, dispatchedAt: new Date() } });
      if (claimed.count === 0) throw new ConflictException('This transfer was just updated — refresh and try again');
      await this.audit.record({ actorId: user.id, action: 'transfer.dispatched', entityType: 'Transfer', entityId: t.id }, tx);
    });
    const to = t.toPharmacyId!;
    this.texts.background(() => this.texts.pharmacists(to, `Transfer ${t.code} is on its way from ${t.fromPharmacy.name.slice(0, 30)}. Check it in under Transfers when it arrives.`));
    return this.view(t.id, user.pharmacyId!);
  }

  /**
   * Receiving pharmacist checks it in. It joins the same batch if that batch is already on their
   * shelves (keeping its price), otherwise becomes a new batch. Anything that went on hold or
   * expired on the way is checked in to quarantine.
   */
  async receive(user: AuthUser, code: string, dto: ReceiveTransferDto) {
    const me = user.pharmacyId!;
    const t = await this.find(code);
    if (t.toPharmacyId !== me || t.status === TransferStatus.DRAFT) throw new NotFoundException('Transfer not found');
    if (t.status !== TransferStatus.IN_TRANSIT) throw new ConflictException('Only a transfer on its way can be received');
    const now = new Date();
    const hold = receiptHold(t.batch, now);

    const receivedBatchId = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.transfer.updateMany({ where: { id: t.id, status: TransferStatus.IN_TRANSIT, toPharmacyId: me }, data: { status: TransferStatus.RECEIVED, receivedById: user.id, receivedAt: now } });
      if (claimed.count === 0) throw new ConflictException('This transfer was just updated — refresh and try again');

      const key = { pharmacyId: me, productId: t.batch.product.id, batchNumber: t.batch.batchNumber };
      const existing = await tx.batch.findUnique({ where: { pharmacyId_productId_batchNumber: key } });
      let batchId: string;
      if (existing && !hold && existing.status === BatchStatus.SALEABLE) {
        batchId = (await tx.batch.update({ where: { id: existing.id }, data: { quantity: { increment: t.quantity } } })).id;
      } else {
        const b = await tx.batch.create({
          data: {
            ...key,
            // Kept apart from a same-numbered batch that's on hold here, or when this one goes to quarantine.
            batchNumber: existing ? `${t.batch.batchNumber}-${t.code}` : t.batch.batchNumber,
            expiresAt: t.batch.expiresAt,
            quantity: t.quantity,
            priceKobo: dto.priceKobo,
            location: dto.location ?? null,
            status: hold ? BatchStatus.QUARANTINED : BatchStatus.SALEABLE,
            quarantineReason: hold,
          },
        });
        batchId = b.id;
      }
      await tx.transfer.update({ where: { id: t.id }, data: { receivedBatchId: batchId } });
      await this.audit.record({ actorId: user.id, action: 'transfer.received', entityType: 'Transfer', entityId: t.id, metadata: { batchId, quarantined: hold } }, tx);
      await this.audit.record({ actorId: user.id, action: 'batch.received', entityType: 'Batch', entityId: batchId, metadata: { quantity: t.quantity, transfer: t.code } }, tx);
      return batchId;
    });
    this.texts.background(() => this.texts.pharmacists(t.fromPharmacyId, `Transfer ${t.code} was received by ${t.toPharmacy?.name.slice(0, 30) ?? 'the pharmacy'}.`));
    return { ...(await this.view(t.id, me)), receivedBatchId, quarantined: !!hold };
  }

  /**
   * Withdraw before it leaves. Drafts and open offers: any of the sending pharmacy's staff.
   * Accepted: a pharmacist at either end, and the reserved stock goes back to its batch.
   */
  async cancel(user: AuthUser, code: string, reason: string) {
    const t = await this.find(code);
    const sending = t.fromPharmacyId === user.pharmacyId;
    const receiving = t.toPharmacyId === user.pharmacyId && t.status === TransferStatus.ACCEPTED;
    if (!sending && !receiving) throw new NotFoundException('Transfer not found');
    if (t.status === TransferStatus.IN_TRANSIT) throw new ConflictException('This transfer is on its way — the receiving pharmacy checks it in, and can quarantine it');
    if (!([TransferStatus.DRAFT, TransferStatus.OFFERED, TransferStatus.ACCEPTED] as TransferStatus[]).includes(t.status)) throw new ConflictException('This transfer is already closed');
    if (t.status === TransferStatus.ACCEPTED && user.role !== Role.PHARMACIST) throw new ForbiddenException('A pharmacist must cancel an accepted transfer');

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.transfer.updateMany({ where: { id: t.id, status: t.status }, data: { status: TransferStatus.CANCELLED, closedById: user.id, closedAt: new Date(), closeReason: reason.trim() } });
      if (claimed.count === 0) throw new ConflictException('This transfer was just updated — refresh and try again');
      if (t.status === TransferStatus.ACCEPTED) {
        await tx.batch.update({ where: { id: t.batchId }, data: { quantity: { increment: t.quantity } } });
        await this.audit.record({ actorId: user.id, action: 'batch.transfer_reservation_returned', entityType: 'Batch', entityId: t.batchId, metadata: { transfer: t.code, quantity: t.quantity } }, tx);
      }
      await this.audit.record({ actorId: user.id, action: 'transfer.cancelled', entityType: 'Transfer', entityId: t.id, metadata: { from: t.status, reason } }, tx);
    });
    const other = sending ? t.toPharmacyId : t.fromPharmacyId;
    if (other && t.status !== TransferStatus.DRAFT) {
      this.texts.background(() => this.texts.pharmacists(other, `Transfer ${t.code} (${t.batch.product.name.slice(0, 30)}) was cancelled.`));
    }
    return this.view(t.id, user.pharmacyId!);
  }

  /** Platform oversight: every transfer past draft. */
  async all() {
    const rows = await this.prisma.transfer.findMany({ where: { status: { not: TransferStatus.DRAFT } }, include: transferInclude, orderBy: { updatedAt: 'desc' }, take: 500 });
    return rows.map(({ batch, ...t }) => ({ ...t, product: batch.product, batch: { batchNumber: batch.batchNumber, expiresAt: batch.expiresAt, status: batch.status } }));
  }
}
