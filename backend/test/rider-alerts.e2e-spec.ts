import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { Role } from '../src/generated/prisma/client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { DeliveryWatchService } from '../src/delivery/delivery-watch.service.js';
import { configureApp } from '../src/setup.js';
import { sessionFor } from './sessions.js';
import { SmsService } from '../src/sms/sms.service.js';

const freshPhone = () => `0705${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
const e164 = (p: string) => `+234${p.slice(1)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Delivery text alerts', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const tokens: Record<string, string> = {};
  const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
  const texts: { phone: string; text: string }[] = [];
  const riderPhone = freshPhone();
  const ids: Record<string, string> = {};

  /** Alerts go out after the change is saved, in the background. */
  async function textTo(phone: string, match: RegExp) {
    for (let i = 0; i < 40; i++) {
      const hit = texts.find((t) => t.phone === phone && match.test(t.text));
      if (hit) return hit.text;
      await sleep(50);
    }
    throw new Error(`No text matching ${match} to ${phone}. Got: ${JSON.stringify(texts.filter((t) => t.phone === phone))}`);
  }

  async function paidOrder() {
    const order = await http()
      .post('/v1/orders')
      .set(as('patient'))
      .send({ pharmacyId: ids.oakfield, deliveryAddress: '14 Herbert Macaulay Way', deliveryArea: 'yaba', items: [{ productId: ids.paracetamol, quantity: 1 }] })
      .expect(201);
    await http().post(`/v1/orders/${order.body.code}/payment/demo`).set(as('patient')).expect(200);
    return order.body.code as string;
  }

  beforeAll(async () => {
    const fakeSms = {
      devEcho: true,
      sendOtp: async () => {},
      sendText: async (phone: string, text: string) => {
        texts.push({ phone, text });
      },
    };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(SmsService).useValue(fakeSms).compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);

    const staff = await prisma.user.findUniqueOrThrow({ where: { phone: '+2348030000002' } });
    tokens.staff = await sessionFor(app, staff.id);
    tokens.admin = await sessionFor(app, (await prisma.user.findUniqueOrThrow({ where: { phone: '+2348030000009' } })).id);
    // Flag anything left over from earlier runs, so the checks below only see this run's orders.
    await app.get(DeliveryWatchService).check();
    // Earlier runs' test riders go offline, so only this run's rider competes for the nearest-10 texts.
    await prisma.riderProfile.updateMany({ where: { partner: 'Test Couriers' }, data: { onlineSince: null, area: null } });
    // A rider online in Ikeja, near Oakfield Pharmacy.
    const rider = await prisma.user.create({
      data: { phone: e164(riderPhone), firstName: 'Kemi', lastName: 'Ade', role: Role.RIDER, riderProfile: { create: { partner: 'Test Couriers', area: 'ikeja', onlineSince: new Date() } } },
    });
    tokens.rider = await sessionFor(app, rider.id);

    const phone = freshPhone();
    ids.customerPhone = e164(phone);
    const { body } = await http().post('/v1/auth/otp/request').send({ phone, intent: 'signup' }).expect(200);
    const signedUp = await http().post('/v1/auth/otp/verify').send({ phone, code: body.devCode, intent: 'signup', firstName: 'Ada', lastName: 'Obi', consent: true }).expect(200);
    tokens.patient = signedUp.body.accessToken;
    ids.oakfield = (await prisma.pharmacy.findUniqueOrThrow({ where: { slug: 'oakfield-ikeja' } })).id;
    ids.paracetamol = (await prisma.product.findUniqueOrThrow({ where: { slug: 'paracetamol-500' } })).id;
  });

  afterAll(async () => {
    await prisma?.riderProfile.updateMany({ where: { partner: 'Test Couriers' }, data: { onlineSince: null, area: null } });
    await app?.close();
  });

  it('texts nearby online riders when packing starts — without customer details', async () => {
    ids.first = await paidOrder();
    const res = await http().post(`/v1/pharmacy/orders/${ids.first}/status`).set(as('staff')).send({ status: 'PREPARING' }).expect(200);
    ids.firstJob = res.body.delivery.code;

    const text = await textTo(e164(riderPhone), /new delivery job/);
    expect(text).toMatch(/Oakfield Pharmacy, Ikeja GRA to Yaba/);
    expect(text).toMatch(/\/rider$/);
    expect(text).not.toMatch(/Herbert|Ada|Paracetamol/i);
    expect(text.length).toBeLessThanOrEqual(160);
  });

  it('sends at most one new-job text per rider every few minutes', async () => {
    ids.second = await paidOrder();
    const res = await http().post(`/v1/pharmacy/orders/${ids.second}/status`).set(as('staff')).send({ status: 'PREPARING' }).expect(200);
    ids.secondJob = res.body.delivery.code;
    await sleep(300);
    expect(texts.filter((t) => t.phone === e164(riderPhone) && /new delivery job/.test(t.text))).toHaveLength(1);
  });

  it('tells the rider when their parcel is ready, and when a job is cancelled', async () => {
    await http().post(`/v1/rider/jobs/${ids.firstJob}/accept`).set(as('rider')).expect(200);
    await http().post(`/v1/pharmacy/orders/${ids.first}/status`).set(as('staff')).send({ status: 'READY' }).expect(200);
    expect(await textTo(e164(riderPhone), /ready for collection/)).toContain(ids.firstJob);

    await http().post(`/v1/rider/jobs/${ids.secondJob}/accept`).set(as('rider')).expect(200);
    await http().post(`/v1/pharmacy/orders/${ids.second}/status`).set(as('staff')).send({ status: 'CANCELLED', note: 'Out of stock' }).expect(200);
    expect(await textTo(e164(riderPhone), /cancelled/)).toContain(ids.secondJob);
  });

  it('texts the customer their code when the rider collects, and if it fails', async () => {
    await http().post(`/v1/pharmacy/orders/${ids.first}/handover`).set(as('staff')).send({ sealCode: ids.firstJob }).expect(200);
    const order = await http().get(`/v1/orders/${ids.first}`).set(as('patient')).expect(200);
    const text = await textTo(ids.customerPhone, /is bringing your order/);
    expect(text).toContain(`Kemi is bringing your order ${ids.first}`);
    expect(text).toContain(`Code ${order.body.delivery.dropoffCode}`);
    expect(text).toContain(`/track?code=${ids.first}`);
    expect(text).not.toMatch(/Paracetamol/i);
    expect(text.length).toBeLessThanOrEqual(160);

    await http().post(`/v1/rider/jobs/${ids.firstJob}/failed`).set(as('rider')).send({ reason: 'Customer not reachable' }).expect(200);
    const failed = await textTo(ids.customerPhone, /wasn't delivered/);
    expect(failed).toContain('Customer not reachable');
    expect(failed.length).toBeLessThanOrEqual(160);
  });

  it('texts the customer once when an order runs late, and tells the ops team', async () => {
    // The order is back at the pharmacy (READY) — make its promised time pass.
    await prisma.order.update({ where: { code: ids.first }, data: { paidAt: new Date(Date.now() - 3 * 60 * 60_000) } });
    const watch = app.get(DeliveryWatchService);
    texts.length = 0;
    expect((await watch.check()).late).toEqual([ids.first]);

    const text = await textTo(ids.customerPhone, /running late/);
    expect(text).toContain(ids.first);
    expect(text.length).toBeLessThanOrEqual(160);
    const ops = await textTo('+2348030000009', /^Pilbridge ops: 1 late/);
    expect(ops).toContain(ids.first);
    expect(ops).toMatch(/\/admin$/);

    expect((await watch.check()).late).toEqual([]);
    expect(texts.filter((t) => /running late|Pilbridge ops/.test(t.text))).toHaveLength(2);

    const live = await http().get('/v1/admin/deliveries/attention').set(as('admin')).expect(200);
    expect(live.body.late.find((l: { order: string }) => l.order === ids.first)).toMatchObject({ status: 'READY', pharmacy: 'Oakfield Pharmacy, Ikeja GRA' });
  });

  it('tells the ops team when no rider has taken a job for 10 minutes', async () => {
    const code = await paidOrder();
    const res = await http().post(`/v1/pharmacy/orders/${code}/status`).set(as('staff')).send({ status: 'PREPARING' }).expect(200);
    await prisma.delivery.update({ where: { code: res.body.delivery.code }, data: { createdAt: new Date(Date.now() - 15 * 60_000) } });
    texts.length = 0;

    const watch = app.get(DeliveryWatchService);
    expect((await watch.check()).unassigned).toEqual([code]);
    expect(await textTo('+2348030000009', /with no rider 10\+ min/)).toContain(code);
    expect((await watch.check()).unassigned).toEqual([]);

    const live = await http().get('/v1/admin/deliveries/attention').set(as('admin')).expect(200);
    expect(live.body.unassigned.find((u: { order: string }) => u.order === code)).toMatchObject({ pharmacy: 'Oakfield Pharmacy, Ikeja GRA' });
    await http().get('/v1/admin/deliveries/attention').set(as('staff')).expect(403);
  });
});
