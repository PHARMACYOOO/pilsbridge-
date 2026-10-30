import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { configureApp } from '../src/setup.js';
import { sessionFor } from './sessions.js';
import { SmsService } from '../src/sms/sms.service.js';

const freshPhone = () => `0705${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Courier bookings, incidents and delivery eligibility', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const tokens: Record<string, string> = {};
  const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
  const ids: Record<string, string> = {};
  const texts: { phone: string; text: string }[] = [];

  async function signUp() {
    const phone = freshPhone();
    const { body } = await http().post('/v1/auth/otp/request').send({ phone, intent: 'signup' }).expect(200);
    const res = await http().post('/v1/auth/otp/verify').send({ phone, code: body.devCode, intent: 'signup', firstName: 'Tolu', lastName: 'Ade', consent: true }).expect(200);
    return res.body.accessToken as string;
  }

  /** A paid OTC order the pharmacy has started preparing: its job is open. */
  async function openJob() {
    const order = await http()
      .post('/v1/orders')
      .set(as('patient'))
      .send({ pharmacyId: ids.oakfield, deliveryAddress: '5 Allen Avenue', deliveryArea: 'ikeja', items: [{ productId: ids.paracetamol, quantity: 1 }] })
      .expect(201);
    await http().post(`/v1/orders/${order.body.code}/payment/demo`).set(as('patient')).expect(200);
    const prep = await http().post(`/v1/pharmacy/orders/${order.body.code}/status`).set(as('staff')).send({ status: 'PREPARING' }).expect(200);
    return { order: order.body.code as string, job: prep.body.delivery.code as string };
  }

  beforeAll(async () => {
    const fakeSms = { devEcho: true, sendOtp: async () => {}, sendText: async (phone: string, text: string) => void texts.push({ phone, text }) };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(SmsService).useValue(fakeSms).compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
    for (const [who, phone] of [['admin', '+2348030000009'], ['staff', '+2348030000002'], ['pharmacist', '+2348030000001']]) {
      tokens[who] = await sessionFor(app, (await prisma.user.findUniqueOrThrow({ where: { phone } })).id);
    }
    tokens.patient = await signUp();
    tokens.otherPatient = await signUp();
    ids.oakfield = (await prisma.pharmacy.findUniqueOrThrow({ where: { slug: 'oakfield-ikeja' } })).id;
    ids.paracetamol = (await prisma.product.findUniqueOrThrow({ where: { slug: 'paracetamol-500' } })).id;
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('courier bookings', () => {
    it('records a courier and what it has accepted in writing', async () => {
      const name = `Test Relay ${Date.now()}`;
      const res = await http()
        .post('/v1/admin/couriers')
        .set(as('admin'))
        .send({ name, contact: 'dispatch@relay.test', approvalNote: 'Email from ops, OTC only' })
        .expect(201);
      expect(res.body).toMatchObject({ name, acceptsPrescription: false, acceptsColdChain: false, active: true });
      ids.courier = res.body.id;
      await http().post('/v1/admin/couriers').set(as('admin')).send({ name }).expect(409);
      await http().post('/v1/admin/couriers').set(as('staff')).send({ name: 'Nope' }).expect(403);
    });

    it('books an open job with a courier, takes it off the rider board, and can hand it back', async () => {
      const { order, job } = await openJob();
      ids.order = order;
      ids.job = job;
      const book = { courierId: ids.courier, providerRef: 'RLY-1001', feeKobo: 180_000, trackingUrl: 'https://track.relay.test/RLY-1001' };
      await http().post(`/v1/admin/deliveries/${job}/courier`).set(as('admin')).send(book).expect(200);
      await http().post(`/v1/admin/deliveries/${job}/courier`).set(as('admin')).send(book).expect(409);

      const live = await http().get('/v1/admin/deliveries/attention').set(as('admin')).expect(200);
      expect(live.body.queue.some((q: { delivery: string }) => q.delivery === job)).toBe(false);
      expect(live.body.courierJobs.find((c: { delivery: string }) => c.delivery === job)).toMatchObject({ providerRef: 'RLY-1001', feeKobo: 180_000, status: 'ASSIGNED' });

      const mine = await http().get(`/v1/orders/${order}`).set(as('patient')).expect(200);
      expect(mine.body.delivery).toMatchObject({ provider: 'COURIER', courier: { name: expect.stringContaining('Test Relay') }, trackingUrl: book.trackingUrl });

      await http().post(`/v1/admin/deliveries/${job}/courier/cancel`).set(as('admin')).expect(200);
      const back = await http().get('/v1/admin/deliveries/attention').set(as('admin')).expect(200);
      expect(back.body.queue.some((q: { delivery: string }) => q.delivery === job)).toBe(true);
      await http().post(`/v1/admin/deliveries/${job}/courier`).set(as('admin')).send(book).expect(200);
    });

    it('is handed over at the pharmacy and completed with the courier’s proof of delivery', async () => {
      await http().post(`/v1/pharmacy/orders/${ids.order}/status`).set(as('staff')).send({ status: 'READY' }).expect(200);
      await http().post(`/v1/admin/deliveries/${ids.job}/courier/delivered`).set(as('admin')).send({ courierProof: 'POD 1' }).expect(409);
      await http().post(`/v1/pharmacy/orders/${ids.order}/handover`).set(as('staff')).send({ sealCode: ids.job }).expect(200);

      await http().post(`/v1/admin/deliveries/${ids.job}/courier/delivered`).set(as('admin')).send({}).expect(422);
      const done = await http().post(`/v1/admin/deliveries/${ids.job}/courier/delivered`).set(as('admin')).send({ courierProof: 'Relay POD PIN confirmed' }).expect(200);
      expect(done.body).toMatchObject({ status: 'DELIVERED', proof: 'courier proof: Relay POD PIN confirmed' });
      const order = await http().get(`/v1/orders/${ids.order}`).set(as('patient')).expect(200);
      expect(order.body.status).toBe('DELIVERED');
    });

    it('only uses couriers approved for the parcel’s categories', async () => {
      const { job } = await openJob();
      await prisma.delivery.update({ where: { code: job }, data: { coldChain: true } }); // as if it held insulin
      const res = await http().post(`/v1/admin/deliveries/${job}/courier`).set(as('admin')).send({ courierId: ids.courier, providerRef: 'RLY-2' }).expect(422);
      expect(res.body.message).toMatch(/cold-chain/);
      await http().patch(`/v1/admin/couriers/${ids.courier}`).set(as('admin')).send({ acceptsColdChain: true, approvalNote: 'Cold-chain SOP and logger evidence received' }).expect(200);
      await http().post(`/v1/admin/deliveries/${job}/courier`).set(as('admin')).send({ courierId: ids.courier, providerRef: 'RLY-2' }).expect(200);
    });
  });

  describe('incidents', () => {
    it('lets the customer report a problem with their own order only', async () => {
      const res = await http().post(`/v1/orders/${ids.order}/incidents`).set(as('patient')).send({ type: 'DAMAGED', description: 'Box was crushed' }).expect(201);
      expect(res.body).toMatchObject({ type: 'DAMAGED', status: 'OPEN', critical: false });
      expect(res.body.code).toMatch(/^INC-/);
      await http().post(`/v1/orders/${ids.order}/incidents`).set(as('otherPatient')).send({ type: 'DAMAGED', description: 'Not mine' }).expect(404);
    });

    it('texts admins and the pharmacy’s pharmacists straight away about critical incidents', async () => {
      texts.length = 0;
      const res = await http().post(`/v1/pharmacy/orders/${ids.order}/incidents`).set(as('staff')).send({ type: 'TAMPERED', description: 'Seal broken on return' }).expect(201);
      expect(res.body.critical).toBe(true);
      for (let i = 0; i < 40 && texts.length < 2; i++) await sleep(50);
      const to = texts.map((t) => t.phone);
      expect(to).toEqual(expect.arrayContaining(['+2348030000009', '+2348030000001']));
      expect(texts[0].text).toMatch(new RegExp(`URGENT: ${res.body.code} on order ${ids.order}`));
      ids.incident = res.body.code;
    });

    it('is resolved by operations, once', async () => {
      const open = await http().get('/v1/admin/incidents?status=OPEN').set(as('admin')).expect(200);
      const inc = open.body.find((i: { code: string }) => i.code === ids.incident);
      expect(inc).toMatchObject({ type: 'TAMPERED', reporterRole: 'PHARMACY_STAFF', order: { code: ids.order } });
      await http().post(`/v1/admin/incidents/${inc.id}/resolve`).set(as('admin')).send({ resolution: 'Pharmacist inspected; written off; customer refunded' }).expect(201);
      await http().post(`/v1/admin/incidents/${inc.id}/resolve`).set(as('admin')).send({ resolution: 'again' }).expect(409);
    });
  });

  describe('delivery eligibility', () => {
    it('keeps pickup-only products out of delivery orders', async () => {
      const list = await http().get('/v1/admin/products').set(as('admin')).expect(200);
      expect(list.body.some((p: { name: string }) => p.name === 'Tramadol')).toBe(false); // controlled: never listed
      await http().patch(`/v1/admin/products/${ids.paracetamol}`).set(as('admin')).send({ deliveryAllowed: false }).expect(200);
      try {
        const res = await http()
          .post('/v1/orders')
          .set(as('patient'))
          .send({ pharmacyId: ids.oakfield, deliveryAddress: '5 Allen Avenue', deliveryArea: 'ikeja', items: [{ productId: ids.paracetamol, quantity: 1 }] })
          .expect(422);
        expect(res.body.message).toMatch(/pickup only/);
      } finally {
        await http().patch(`/v1/admin/products/${ids.paracetamol}`).set(as('admin')).send({ deliveryAllowed: true }).expect(200);
      }
    });
  });
});
