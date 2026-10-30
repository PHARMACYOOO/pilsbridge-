import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Db = Pick<PrismaService, 'auditLog'> | Prisma.TransactionClient;

/** Append-only record of regulated and security-relevant actions. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /** Pass `tx` to write the entry in the same transaction as the change it describes. */
  record(
    entry: { actorId: string | null; action: string; entityType: string; entityId: string; metadata?: Prisma.InputJsonValue },
    tx: Db = this.prisma,
  ) {
    return tx.auditLog.create({ data: entry });
  }
}
