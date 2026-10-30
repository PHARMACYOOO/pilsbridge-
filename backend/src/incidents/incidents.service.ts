import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import { appUrl } from '../common/app-url.js';
import type { AuthUser } from '../common/auth-user.js';
import { IncidentStatus, IncidentType, Role } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SmsService } from '../sms/sms.service.js';
import type { ReportIncidentDto } from './dto.js';

/** Escalated straight away, to platform admins and the pharmacy's pharmacists. */
export const CRITICAL: IncidentType[] = [IncidentType.TAMPERED, IncidentType.LOST, IncidentType.TEMPERATURE_EXCURSION];

const label: Record<IncidentType, string> = {
  DAMAGED: 'damaged parcel',
  TAMPERED: 'seal broken or tampered',
  LOST: 'parcel lost',
  TEMPERATURE_EXCURSION: 'temperature excursion',
  WRONG_ITEM: 'wrong item',
  OTHER: 'other problem',
};

/**
 * Parcel incidents — damage, tampering, loss, temperature excursion, wrong item — from riders,
 * pharmacies, customers or operations. Every report is recorded; critical ones are texted at once.
 * The pharmacy decides what happens to the stock (returns are already quarantined).
 */
@Injectable()
export class IncidentsService {
  private readonly log = new Logger(IncidentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sms: SmsService,
    private readonly config: ConfigService,
  ) {}

  /** Report against an order the caller is part of: their own (patient), their pharmacy's, or one they're delivering (rider). */
  async report(user: AuthUser, orderCode: string, dto: ReportIncidentDto) {
    const order = await this.prisma.order.findUnique({
      where: { code: orderCode },
      include: { deliveries: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    const latest = order?.deliveries[0];
    const allowed =
      !!order &&
      (user.role === Role.PLATFORM_ADMIN ||
        (user.role === Role.PATIENT && order.patientId === user.id) ||
        ((user.role === Role.PHARMACIST || user.role === Role.PHARMACY_STAFF) && order.pharmacyId === user.pharmacyId) ||
        (user.role === Role.RIDER && latest?.riderId === user.id));
    if (!order || !allowed) throw new NotFoundException('Order not found');

    const incident = await this.prisma.$transaction(async (tx) => {
      const created = await tx.incident.create({
        data: {
          code: `INC-${randomBytes(3).toString('hex').toUpperCase()}`,
          orderId: order.id,
          deliveryId: latest?.id ?? null,
          type: dto.type,
          description: dto.description.trim(),
          reportedById: user.id,
          reporterRole: user.role,
        },
      });
      await this.audit.record({ actorId: user.id, action: 'incident.reported', entityType: 'Incident', entityId: created.id, metadata: { type: dto.type, order: order.code } }, tx);
      return created;
    });

    if (CRITICAL.includes(dto.type)) void this.escalate(incident.code, order.code, order.pharmacyId, dto.type);
    return { code: incident.code, type: incident.type, status: incident.status, critical: CRITICAL.includes(dto.type) };
  }

  list(status?: IncidentStatus) {
    return this.prisma.incident.findMany({
      where: status ? { status } : {},
      include: { order: { select: { code: true, status: true, pharmacy: { select: { name: true } } } }, delivery: { select: { code: true, provider: true, courier: { select: { name: true } } } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  async resolve(admin: AuthUser, id: string, resolution: string) {
    const found = await this.prisma.incident.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Incident not found');
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.incident.updateMany({
        where: { id, status: IncidentStatus.OPEN },
        data: { status: IncidentStatus.RESOLVED, resolution: resolution.trim(), resolvedById: admin.id, resolvedAt: new Date() },
      });
      if (r.count === 0) throw new ConflictException('This incident is already resolved');
      await this.audit.record({ actorId: admin.id, action: 'incident.resolved', entityType: 'Incident', entityId: id, metadata: { resolution: resolution.trim() } }, tx);
      return tx.incident.findUniqueOrThrow({ where: { id } });
    });
  }

  private async escalate(incidentCode: string, orderCode: string, pharmacyId: string, type: IncidentType) {
    try {
      const people = await this.prisma.user.findMany({
        where: { phone: { not: null }, OR: [{ role: Role.PLATFORM_ADMIN }, { role: Role.PHARMACIST, pharmacyId }] },
        select: { phone: true },
      });
      const text = `Pilbridge URGENT: ${incidentCode} on order ${orderCode} - ${label[type]}. Check it now: ${appUrl(this.config)}/admin`;
      for (const p of people) {
        await this.sms.sendText(p.phone!, text).catch((e: unknown) => this.log.warn(`Incident text not sent: ${String(e)}`));
      }
    } catch (e) {
      this.log.error(`Incident escalation failed for ${incidentCode}: ${String(e)}`);
    }
  }
}
