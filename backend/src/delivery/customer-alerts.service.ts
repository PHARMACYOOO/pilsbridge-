import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { appUrl } from '../common/app-url.js';
import { OrderStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SmsService } from '../sms/sms.service.js';
import { arriveBy } from './eta.js';

const lagosTime = (d: Date) => d.toLocaleTimeString('en-NG', { timeZone: 'Africa/Lagos', hour: 'numeric', minute: '2-digit' }).replace(/\s/g, ' ');
/** Orders on their way to the customer, which can run late. */
const IN_FLIGHT: OrderStatus[] = [OrderStatus.PREPARING, OrderStatus.READY, OrderStatus.PICKED_UP];

/**
 * Text messages to customers about their delivery: on its way (with the drop-off code), running
 * late, and a failed attempt. Customers without a phone number (e.g. Google sign-ups) only see
 * these on their tracking page. Texts never name the medicines. Late orders are found by
 * DeliveryWatchService; the customer is texted once per order.
 */
@Injectable()
export class CustomerAlertsService {
  private readonly log = new Logger(CustomerAlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
    private readonly config: ConfigService,
  ) {}

  private track(code: string) {
    return `${appUrl(this.config)}/track?code=${code}`;
  }

  /** The rider has collected the parcel. */
  onTheWay(orderId: string) {
    this.background('on-the-way', async () => {
      const o = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: {
          code: true, paidAt: true, etaMinutes: true, patient: { select: { phone: true } },
          deliveries: { orderBy: { createdAt: 'desc' }, take: 1, select: { dropoffCode: true, rider: { select: { firstName: true } } } },
        },
      });
      const d = o?.deliveries[0];
      if (!o?.patient.phone || !d) return;
      const due = arriveBy(o);
      const rider = d.rider?.firstName && d.rider.firstName.length <= 14 ? d.rider.firstName : 'Your rider';
      // Sender ID already reads "Pilbridge"; kept to one SMS (160 characters).
      await this.text(
        o.patient.phone,
        `${rider} is bringing your order ${o.code}${due ? `, due ${lagosTime(due)}` : ''}. Code ${d.dropoffCode}: give it only once you have the parcel. ${this.track(o.code)}`,
      );
    });
  }

  /** The rider couldn't hand it over; the parcel is going back to the pharmacy. */
  failed(orderId: string, reason: string) {
    this.background('failed', async () => {
      const o = await this.prisma.order.findUnique({ where: { id: orderId }, select: { code: true, patient: { select: { phone: true } } } });
      if (!o?.patient.phone) return;
      await this.text(o.patient.phone, `Order ${o.code} wasn't delivered (${reason.slice(0, 24)}). It's back at the pharmacy, sealed, and will be resent. ${this.track(o.code)}`);
    });
  }

  /** Text customers whose order has just passed its promised time. Returns those orders' codes. */
  async checkLate(now = new Date()) {
    const candidates = await this.prisma.order.findMany({
      where: { status: { in: IN_FLIGHT }, lateTextAt: null, paidAt: { not: null }, etaMinutes: { not: null } },
      select: { id: true, code: true, paidAt: true, etaMinutes: true, patient: { select: { phone: true } } },
      orderBy: { paidAt: 'asc' },
      take: 200,
    });
    const late: string[] = [];
    for (const o of candidates) {
      const due = arriveBy(o);
      if (!due || due > now) continue;
      // Claim it first, so it's texted once even with several API instances.
      const claimed = await this.prisma.order.updateMany({ where: { id: o.id, lateTextAt: null }, data: { lateTextAt: now } });
      if (claimed.count === 0) continue;
      late.push(o.code);
      if (o.patient.phone) {
        await this.text(o.patient.phone, `Sorry, Pilbridge order ${o.code} is running late. It was due by ${lagosTime(due)} and is still on its way. Follow it: ${this.track(o.code)}`);
      }
    }
    return late;
  }

  private async text(phone: string, message: string) {
    try {
      await this.sms.sendText(phone, message);
    } catch (e) {
      this.log.warn(`Customer text to ${phone.slice(0, 7)}•••${phone.slice(-2)} not sent: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private background(kind: string, fn: () => Promise<void>) {
    void fn().catch((e: unknown) => this.log.error(`Customer ${kind} text failed: ${e instanceof Error ? e.message : String(e)}`));
  }
}
