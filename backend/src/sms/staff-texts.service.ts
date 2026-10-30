import { Injectable, Logger } from '@nestjs/common';
import { Role } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SmsService } from './sms.service.js';

/**
 * Plain notifications to a pharmacy's pharmacists and to platform admins (licence reminders, bank
 * detail changes, transfers); never to disabled accounts. Best effort: a text that can't be sent is logged, never thrown.
 */
@Injectable()
export class StaffTextsService {
  private readonly log = new Logger(StaffTextsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
  ) {}

  async pharmacists(pharmacyId: string, text: string) {
    const users = await this.prisma.user.findMany({ where: { pharmacyId, role: Role.PHARMACIST, phone: { not: null }, disabledAt: null }, select: { phone: true } });
    await this.send(users, text);
  }

  async admins(text: string) {
    const users = await this.prisma.user.findMany({ where: { role: Role.PLATFORM_ADMIN, phone: { not: null }, disabledAt: null }, select: { phone: true } });
    await this.send(users, text);
  }

  /** For callers that shouldn't wait on the texts. */
  background(fn: () => Promise<void>) {
    void fn().catch((e: unknown) => this.log.error(`Staff text failed: ${e instanceof Error ? e.message : String(e)}`));
  }

  private async send(users: { phone: string | null }[], text: string) {
    for (const { phone } of users) {
      if (!phone) continue;
      try {
        await this.sms.sendText(phone, text);
      } catch (e) {
        this.log.warn(`Staff text to ${phone.slice(0, 7)}•••${phone.slice(-2)} not sent: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
}
