import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service.js';
import { DocumentKind, DocumentStatus, PharmacyStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StaffTextsService } from '../sms/staff-texts.service.js';
import { DOCUMENT_LABELS } from './dto.js';
import { dueReminder } from './expiry.js';

const lagosDate = (d: Date) => d.toLocaleDateString('en-GB', { timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Keeps pharmacies compliant, every COMPLIANCE_CHECK_MS (default hourly): a pharmacy whose premises
 * licence has expired is suspended at once (it leaves the catalogue and checkout), and pharmacists
 * are texted 60, 30 and 7 days before their licence or a verified certificate expires.
 */
@Injectable()
export class ComplianceWatchService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(ComplianceWatchService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly texts: StaffTextsService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap() {
    const every = Number(this.config.get('COMPLIANCE_CHECK_MS') ?? 3_600_000);
    if (every > 0) {
      this.timer = setInterval(() => void this.check().catch((e: unknown) => this.log.error(`Compliance check failed: ${String(e)}`)), every);
      this.timer.unref();
    }
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  /** Returns what it did, for tests and logs. */
  async check(now = new Date()) {
    const suspended = await this.suspendExpired(now);
    const reminded = [...(await this.licenceReminders(now)), ...(await this.documentReminders(now))];
    if (suspended.length) this.log.warn(`Suspended for an expired licence: ${suspended.join(', ')}`);
    return { suspended, reminded };
  }

  private async suspendExpired(now: Date) {
    const expired = await this.prisma.pharmacy.findMany({ where: { status: PharmacyStatus.VERIFIED, licenceExpiresAt: { lte: now } }, select: { id: true, name: true, licenceExpiresAt: true } });
    const done: string[] = [];
    for (const ph of expired) {
      const reason = `Premises licence expired ${lagosDate(ph.licenceExpiresAt)}`;
      const claimed = await this.prisma.$transaction(async (tx) => {
        const r = await tx.pharmacy.updateMany({ where: { id: ph.id, status: PharmacyStatus.VERIFIED, licenceExpiresAt: { lte: now } }, data: { status: PharmacyStatus.SUSPENDED, suspendedAt: now, suspendedReason: reason } });
        if (r.count) await this.audit.record({ actorId: null, action: 'pharmacy.suspended', entityType: 'Pharmacy', entityId: ph.id, metadata: { reason, automatic: true } }, tx);
        return r.count > 0;
      });
      if (!claimed) continue;
      done.push(ph.name);
      await this.texts.pharmacists(ph.id, `${ph.name.slice(0, 40)} is paused on Pilbridge: the premises licence expired. Upload the renewal under Compliance in the portal.`);
      await this.texts.admins(`${ph.name.slice(0, 40)} was suspended automatically: premises licence expired.`);
    }
    return done;
  }

  private async licenceReminders(now: Date) {
    const soon = new Date(now.getTime() + 61 * 24 * 60 * 60_000);
    const pharmacies = await this.prisma.pharmacy.findMany({ where: { status: PharmacyStatus.VERIFIED, licenceExpiresAt: { gt: now, lte: soon } }, select: { id: true, name: true, licenceExpiresAt: true, licenceReminderDays: true } });
    const sent: string[] = [];
    for (const ph of pharmacies) {
      const due = dueReminder(ph.licenceExpiresAt, ph.licenceReminderDays, now);
      if (due === null) continue;
      // Claim it first, so it's sent once even with several API instances.
      const claimed = await this.prisma.pharmacy.updateMany({ where: { id: ph.id, licenceExpiresAt: ph.licenceExpiresAt, licenceReminderDays: ph.licenceReminderDays }, data: { licenceReminderDays: due } });
      if (!claimed.count) continue;
      sent.push(`${ph.name}: licence ${due}d`);
      await this.texts.pharmacists(ph.id, `Your premises licence expires ${lagosDate(ph.licenceExpiresAt)}. Upload the renewal under Compliance in the Pilbridge portal to stay listed.`);
    }
    return sent;
  }

  /** Verified certificates other than the premises licence (that one is on the pharmacy record). Only each type's latest copy counts. */
  private async documentReminders(now: Date) {
    const soon = new Date(now.getTime() + 61 * 24 * 60 * 60_000);
    const docs = await this.prisma.complianceDocument.findMany({
      where: { status: DocumentStatus.VERIFIED, kind: { not: DocumentKind.PREMISES_LICENCE }, expiresAt: { gt: now, lte: soon }, pharmacy: { status: PharmacyStatus.VERIFIED } },
      select: { id: true, pharmacyId: true, kind: true, expiresAt: true, reminderDays: true, createdAt: true },
    });
    const sent: string[] = [];
    for (const d of docs) {
      const newer = await this.prisma.complianceDocument.count({ where: { pharmacyId: d.pharmacyId, kind: d.kind, status: DocumentStatus.VERIFIED, createdAt: { gt: d.createdAt } } });
      if (newer) continue;
      const due = dueReminder(d.expiresAt!, d.reminderDays, now);
      if (due === null) continue;
      const claimed = await this.prisma.complianceDocument.updateMany({ where: { id: d.id, reminderDays: d.reminderDays }, data: { reminderDays: due } });
      if (!claimed.count) continue;
      sent.push(`${d.id}: ${d.kind} ${due}d`);
      await this.texts.pharmacists(d.pharmacyId, `Your ${DOCUMENT_LABELS[d.kind].name.toLowerCase()} expires ${lagosDate(d.expiresAt!)}. Upload the renewal under Compliance in the Pilbridge portal.`);
    }
    return sent;
  }
}
