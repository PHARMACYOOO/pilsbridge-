import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { appUrl } from '../common/app-url.js';
import { DeliveryStatus } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SmsService } from '../sms/sms.service.js';
import { areaByKey } from './areas.js';
import { distanceKm, MAX_ACTIVE_JOBS, RIDER_RADIUS_KM } from './eta.js';

/** Text at most this many riders per job, nearest first (SMS costs money). */
export const MAX_ALERTED_RIDERS = 10;
/** A rider gets at most one "new job" text in this window; the app shows everything else. */
export const NEW_JOB_COOLDOWN_MS = 3 * 60_000;
/** Riders who went online longer ago than this are treated as having forgotten to go offline. */
const ONLINE_FRESH_MS = 12 * 60 * 60_000;

/**
 * Text alerts for riders: a new job nearby, their parcel is ready, their job was cancelled. Sent
 * after the change is saved and never allowed to fail it — a lost text is a delay, not an error.
 * Texts carry no customer or medicine details.
 */
@Injectable()
export class RiderAlertsService {
  private readonly log = new Logger(RiderAlertsService.name);
  private readonly lastNewJobText = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
    private readonly config: ConfigService,
  ) {}

  private get riderAppUrl() {
    return `${appUrl(this.config)}/rider`;
  }

  /** A job is open (new, handed back or rebooked): tell nearby online riders who can take it. */
  newJob(deliveryId: string, exceptRiderId?: string) {
    this.background('new-job', () => this.sendNewJob(deliveryId, exceptRiderId));
  }

  /** The pharmacy marked the order ready: tell the rider who took the job. */
  ready(orderId: string) {
    this.background('ready', async () => {
      const job = await this.prisma.delivery.findFirst({
        where: { orderId, status: DeliveryStatus.ASSIGNED, riderId: { not: null } },
        include: { rider: { select: { phone: true } }, order: { select: { pharmacy: { select: { name: true, area: true } } } } },
      });
      if (!job?.rider?.phone) return;
      const ph = job.order.pharmacy;
      await this.text(job.rider.phone, `Pilbridge: parcel ${job.code} is ready for collection at ${ph.name}, ${ph.area}. Show the seal number at the counter.`);
    });
  }

  /** Jobs withdrawn because the order was cancelled: tell their riders not to go. */
  cancelled(jobs: { code: string; riderId: string | null }[]) {
    const withRider = jobs.filter((j) => j.riderId);
    if (!withRider.length) return;
    this.background('cancelled', async () => {
      const riders = await this.prisma.user.findMany({ where: { id: { in: withRider.map((j) => j.riderId!) } }, select: { id: true, phone: true } });
      for (const j of withRider) {
        const phone = riders.find((r) => r.id === j.riderId)?.phone;
        if (phone) await this.text(phone, `Pilbridge: job ${j.code} has been cancelled. Do not collect it. Check the app for other jobs: ${this.riderAppUrl}`);
      }
    });
  }

  private async sendNewJob(deliveryId: string, exceptRiderId?: string) {
    const job = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { order: { select: { deliveryArea: true, pharmacy: { select: { name: true, area: true, lat: true, lng: true } } } } },
    });
    if (!job || job.status !== DeliveryStatus.AWAITING_RIDER) return;
    const ph = job.order.pharmacy;
    if (ph.lat == null || ph.lng == null) return;
    const pickup = { lat: ph.lat, lng: ph.lng };

    const riders = await this.prisma.riderProfile.findMany({
      where: {
        active: true,
        onlineSince: { gte: new Date(Date.now() - ONLINE_FRESH_MS) },
        area: { not: null },
        ...(job.coldChain ? { coldChain: true } : {}),
        ...(exceptRiderId ? { userId: { not: exceptRiderId } } : {}),
        user: { phone: { not: null }, disabledAt: null },
      },
      include: { user: { select: { phone: true, _count: { select: { riderDeliveries: { where: { status: { in: [DeliveryStatus.ASSIGNED, DeliveryStatus.PICKED_UP] } } } } } } } },
    });

    const now = Date.now();
    const nearby = riders
      .flatMap((r) => {
        const here = areaByKey(r.area);
        if (!here || r.user._count.riderDeliveries >= MAX_ACTIVE_JOBS) return [];
        const km = distanceKm(here, pickup);
        return km <= RIDER_RADIUS_KM ? [{ id: r.userId, phone: r.user.phone!, km }] : [];
      })
      .sort((a, b) => a.km - b.km)
      .filter((r) => now - (this.lastNewJobText.get(r.id) ?? 0) >= NEW_JOB_COOLDOWN_MS)
      .slice(0, MAX_ALERTED_RIDERS);

    const to = areaByKey(job.order.deliveryArea)?.name.split(' (')[0];
    for (const r of nearby) {
      this.lastNewJobText.set(r.id, now);
      const km = r.km < 1 ? 'under 1 km' : `${r.km.toFixed(1)} km`;
      await this.text(
        r.phone,
        `Pilbridge: new delivery job ${km} from you. Pickup ${ph.name}, ${ph.area}${to ? ` to ${to}` : ''}.${job.coldChain ? ' Cold box needed.' : ''} Accept: ${this.riderAppUrl}`,
      );
    }
  }

  private async text(phone: string, message: string) {
    try {
      await this.sms.sendText(phone, message);
    } catch (e) {
      this.log.warn(`Rider alert to ${phone.slice(0, 7)}•••${phone.slice(-2)} not sent: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private background(kind: string, fn: () => Promise<void>) {
    void fn().catch((e: unknown) => this.log.error(`Rider ${kind} alert failed: ${e instanceof Error ? e.message : String(e)}`));
  }
}
