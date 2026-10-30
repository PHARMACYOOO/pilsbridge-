import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { CourierDispatchService } from '../src/delivery/courier-dispatch.service.js';
import { ChowdeckRelayAdapter } from '../src/delivery/couriers/chowdeck-relay.adapter.js';
import type { CourierBookingInput, CourierStatus } from '../src/delivery/couriers/courier-api.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { configureApp } from '../src/setup.js';
import { sessionFor } from './sessions.js';
import { SmsService } from '../src/sms/sms.service.js';

const freshPhone = () => `0705${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ENV = { DELIVERY_PRICING: 'courier', AUTO_BOOK_COURIERS: 'true', CHOWDECK_WEBHOOK_SECRET: 'whsec_test', DELIVERY_MARGIN_KOBO: '30000' };

/** Stands in for Chowdeck Relay: records what Pilbridge sends, lets the test set statuses. */
class FakeRelay {
  readonly key = 'CHOWDECK_RELAY';
  readonly label = 'Chowdeck Relay';
  failQuotes = false;
  booked: CourierBookingInput[] = [];
  cancelled: string[] = [];
  statuses = new Map<string, string>();
  configured() {
    return true;
  }
  async quote() {
    if (this.failQuotes) throw new Error('down');
    return { feeId: '18987', amountKobo: 182_000 };
  }
  async book(input: CourierBookingInput) {
    this.booked.push(input);
    const reference = `RLY-${this.booked.length}-${Date.now()}`;
    this.statuses.set(reference, 'preparing');
    return { reference, priceKobo: 182_000, trackingUrl: `https://relay.test/${reference}`, status: 'pending' as CourierStatus, rawStatus: 'preparing' };
  }
  async status(reference: string) {
    const raw = this.statuses.get(reference) ?? 'preparing';
    const map: Record<string, CourierStatus> = { preparing: 'pending', awaiting_pickup: 'rider_assigned', in_transit: 'in_transit', success: 'delivered', rejected: 'cancelled' };
    return { status: map[raw] ?? 'unknown', rawStatus: raw, trackingUrl: null };
  }
  async cancel(reference: string) {
    this.cancelled.push(reference);
  }
}

describe('Courier API: quotes, automatic booking and status updates', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const relay = new FakeRelay();
  const texts: { phone: string; text: string }[] = [];
  const http = () => request(app.getHttpServer());
  const tokens: Record<string, string> = {};
  const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
  const ids: Record<string, string> = {};
  const pin = { lat: 6.6012, lng: 3.3507 }; // Allen Avenue, Ikeja

  async function readyOrder(opts: { quoteId?: string } = {}) {
    const order = await http()
      .post('/v1/orders')
      .set(as('patient'))
      .send({
        pharmacyId: ids.oakfield,
        deliveryAddress: '5 Allen Avenue',
        deliveryArea: 'ikeja',
        dropoffLat: pin.lat,
        dropoffLng: pin.lng,
        ...(opts.quoteId ? { deliveryQuoteId: opts.quoteId } : {}),
        items: [{ productId: ids.paracetamol, quantity: 1 }],
      })
      .expect(201);
    await http().post(`/v1/orders/${order.body.code}/payment/demo`).set(as('patient')).expect(200);
    const prep = await http().post(`/v1/pharmacy/orders/${order.body.code}/status`).set(as('staff')).send({ status: 'PREPARING' }).expect(200);
    await http().post(`/v1/pharmacy/orders/${order.body.code}/status`).set(as('staff')).send({ status: 'READY' }).expect(200);
    return { order: order.body, job: prep.body.delivery.code as string };
  }

  async function jobFor(code: string, until: (d: { status: string; provider: string }) => boolean) {
    for (let i = 0; i < 60; i++) {
      const d = await prisma.delivery.findUniqueOrThrow({ where: { code } });
      if (until(d)) return d;
      await sleep(50);
    }
    return prisma.delivery.findUniqueOrThrow({ where: { code } });
  }

  beforeAll(async () => {
    Object.assign(process.env, ENV);
    const fakeSms = { devEcho: true, sendOtp: async () => {}, sendText: async (phone: string, text: string) => void texts.push({ phone, text }) };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SmsService).useValue(fakeSms)
      .overrideProvider(ChowdeckRelayAdapter).useValue(relay)
      .compile();
    app = configureApp(moduleRef.createNestApplication({ rawBody: true }));
    await app.init();
    prisma = app.get(PrismaService);
    for (const [who, phone] of [['admin', '+2348030000009'], ['staff', '+2348030000002']]) {
      tokens[who] = await sessionFor(app, (await prisma.user.findUniqueOrThrow({ where: { phone } })).id);
    }
    const phone = freshPhone();
    const { body } = await http().post('/v1/auth/otp/request').send({ phone, intent: 'signup' }).expect(200);
    tokens.patient = (await http().post('/v1/auth/otp/verify').send({ phone, code: body.devCode, intent: 'signup', firstName: 'Ifeoma', lastName: 'Nwosu', consent: true }).expect(200)).body.accessToken;

    const oak = await prisma.pharmacy.findUniqueOrThrow({ where: { slug: 'oakfield-ikeja' } });
    ids.oakfield = oak.id;
    await http().put(`/v1/admin/pharmacies/${oak.id}/phone`).set(as('admin')).send({ phone: '0803 000 0100' }).expect(200);
    ids.paracetamol = (await prisma.product.findUniqueOrThrow({ where: { slug: 'paracetamol-500' } })).id;
    // Earlier test files' open jobs shouldn't be polled with this fake.
    await prisma.courier.updateMany({ where: { api: 'CHOWDECK_RELAY' }, data: { active: false } });
    const courier = await http()
      .post('/v1/admin/couriers')
      .set(as('admin'))
      .send({ name: `Relay API ${Date.now()}`, api: 'CHOWDECK_RELAY', priority: 1, approvalNote: 'Test: OTC only' })
      .expect(201);
    ids.courier = courier.body.id;
  });

  afterAll(async () => {
    for (const k of Object.keys(ENV)) delete process.env[k];
    await prisma?.courier.updateMany({ where: { id: ids.courier }, data: { active: false } });
    await app?.close();
  });

  it('lists the API connections and whether they’re set up', async () => {
    const res = await http().get('/v1/admin/couriers/apis').set(as('admin')).expect(200);
    expect(res.body).toEqual([{ key: 'CHOWDECK_RELAY', label: 'Chowdeck Relay', configured: true }]);
  });

  it('prices delivery from the courier’s live quote plus margin, and holds that price', async () => {
    const q = await http().post('/v1/delivery/quote').send({ pharmacyId: ids.oakfield, ...pin }).expect(200);
    // ₦1,820 + ₦300 margin, rounded up to ₦50.
    expect(q.body).toMatchObject({ source: 'courier', deliveryKobo: 215_000 });
    const { order } = await readyOrder({ quoteId: q.body.quoteId });
    expect(order.deliveryKobo).toBe(215_000);

    // Someone else's pin, or an expired quote, isn't accepted.
    const bad = await http()
      .post('/v1/orders')
      .set(as('patient'))
      .send({ pharmacyId: ids.oakfield, deliveryAddress: 'x street', deliveryArea: 'ikeja', dropoffLat: 6.45, dropoffLng: 3.47, deliveryQuoteId: q.body.quoteId, items: [{ productId: ids.paracetamol, quantity: 1 }] })
      .expect(422);
    expect(bad.body.message).toMatch(/expired/);

    relay.failQuotes = true;
    const fallback = await http().post('/v1/delivery/quote').send({ pharmacyId: ids.oakfield, ...pin }).expect(200);
    expect(fallback.body).toMatchObject({ source: 'standard', deliveryKobo: 150_000, quoteId: null });
    relay.failQuotes = false;
  });

  it('books the courier automatically when a ready order has no rider — with neutral parcel details', async () => {
    const before = relay.booked.length;
    const { job } = await readyOrder();
    const d = await jobFor(job, (x) => x.provider === 'COURIER');
    expect(d).toMatchObject({ status: 'ASSIGNED', provider: 'COURIER', courierId: ids.courier, feeKobo: 182_000, providerStatus: 'preparing' });
    const sent = relay.booked[before];
    expect(sent).toMatchObject({ reference: job, pickup: { name: 'Oakfield Pharmacy', phone: '08030000100' }, dropoff: { name: 'Ifeoma' } });
    expect(sent.dropoff.phone).toMatch(/^0705\d{7}$/);
    expect(sent.note).toMatch(/^Sealed pharmacy parcel/);
    expect(JSON.stringify(sent)).not.toMatch(/paracetamol/i);
    ids.job = job;
    ids.ref = d.providerRef!;
  });

  it('follows the courier’s status, but completes only after the pharmacy’s handover', async () => {
    const dispatch = app.get(CourierDispatchService);
    relay.statuses.set(ids.ref, 'success');
    texts.length = 0;
    await dispatch.sync();
    expect((await prisma.delivery.findUniqueOrThrow({ where: { code: ids.job } })).status).toBe('ASSIGNED');
    expect(texts.some((t) => /never recorded the handover/.test(t.text))).toBe(true);

    const order = await prisma.delivery.findUniqueOrThrow({ where: { code: ids.job }, include: { order: true } });
    await http().post(`/v1/pharmacy/orders/${order.order.code}/handover`).set(as('staff')).send({ sealCode: ids.job }).expect(200);
    await dispatch.sync();
    const done = await prisma.delivery.findUniqueOrThrow({ where: { code: ids.job } });
    expect(done.status).toBe('DELIVERED');
    expect(done.proof).toMatch(/courier confirmed delivery/);
  });

  it('accepts signed Chowdeck webhooks only', async () => {
    const { job } = await readyOrder();
    const d = await jobFor(job, (x) => x.provider === 'COURIER');
    const body = JSON.stringify({ category: 'ORDER_CANCELLED', description: 'x', payload: { reference: d.providerRef, status: 'rejected' } });
    await http().post('/v1/webhooks/chowdeck').set('Content-Type', 'application/json').set('x-chowdeck-signature', 'forged').send(body).expect(404);
    const sig = createHmac('sha256', 'whsec_test').update(body).digest('hex');
    await http().post('/v1/webhooks/chowdeck').set('Content-Type', 'application/json').set('x-chowdeck-signature', sig).send(body).expect(200);
    // Cancelled before pickup: the job is open again for riders, and ops are told.
    expect(await prisma.delivery.findUniqueOrThrow({ where: { code: job } })).toMatchObject({ status: 'AWAITING_RIDER', provider: 'PILBRIDGE_RIDERS' });
    expect(texts.some((t) => /cancelled .* before pickup/.test(t.text))).toBe(true);
  });

  it('cancels with the courier when operations or the pharmacy call it off', async () => {
    const { order, job } = await readyOrder();
    const d = await jobFor(job, (x) => x.provider === 'COURIER');
    await http().post(`/v1/pharmacy/orders/${order.code}/status`).set(as('staff')).send({ status: 'CANCELLED', note: 'Customer cancelled by phone' }).expect(200);
    for (let i = 0; i < 40 && !relay.cancelled.includes(d.providerRef!); i++) await sleep(50);
    expect(relay.cancelled).toContain(d.providerRef);
  });

  it('tells ops when it can’t book, and leaves the job open', async () => {
    await prisma.courier.update({ where: { id: ids.courier }, data: { active: false } });
    texts.length = 0;
    try {
      const { job } = await readyOrder();
      const d = await jobFor(job, (x) => x.status === 'AWAITING_RIDER');
      for (let i = 0; i < 40 && !texts.some((t) => /couldn't book a courier/.test(t.text)); i++) await sleep(50);
      expect(texts.some((t) => /couldn't book a courier/.test(t.text))).toBe(true);
      const live = await http().get('/v1/admin/deliveries/attention').set(as('admin')).expect(200);
      expect(live.body.queue.find((q: { delivery: string }) => q.delivery === d.code).bookingError).toMatch(/no connected courier/);
    } finally {
      await prisma.courier.update({ where: { id: ids.courier }, data: { active: true } });
    }
  });
});
