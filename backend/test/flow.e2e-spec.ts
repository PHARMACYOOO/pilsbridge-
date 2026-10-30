import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { configureApp } from '../src/setup.js';
import { sessionFor } from './sessions.js';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
/** A fresh, valid Nigerian mobile number per run, so reruns don't collide with earlier sign-ups. */
const freshPhone = (prefix: '0809' | '0705') => `${prefix}${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;

describe('Pilbridge API — patient to pharmacist to delivery', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let http: () => ReturnType<typeof request>;
  const ids: Record<string, string> = {};
  const tokens: Record<string, string> = {};

  const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    http = () => request(app.getHttpServer());
    prisma = app.get(PrismaService);

    // Seeded staff get tokens directly so the OTP rate limit isn't spent on them.
    for (const [who, phone] of [
      ['staff', '+2348030000002'],
      ['pharmacist', '+2348030000001'],
      ['otherPharmacist', '+2348030000003'],
      ['coldRider', '+2348030000011'],
      ['rider', '+2348030000012'],
    ]) {
      const u = await prisma.user.findUniqueOrThrow({ where: { phone } });
      tokens[who] = await sessionFor(app, u.id);
    }
    for (const slug of ['paracetamol-500', 'amoxicillin-500', 'tramadol-50']) {
      ids[slug] = (await prisma.product.findUniqueOrThrow({ where: { slug } })).id;
    }
    ids.oakfield = (await prisma.pharmacy.findUniqueOrThrow({ where: { slug: 'oakfield-ikeja' } })).id;
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('sign-in', () => {
    it('rejects a wrong code, then signs up a new number with the right one', async () => {
      const phone = freshPhone('0809');
      const { body } = await http().post('/v1/auth/otp/request').send({ phone }).expect(200);
      const wrong = body.devCode === '000000' ? '111111' : '000000';
      await http().post('/v1/auth/otp/verify').send({ phone, code: wrong }).expect(401);

      const ok = await http().post('/v1/auth/otp/verify').send({ phone, code: body.devCode }).expect(200);
      expect(ok.body.isNewUser).toBe(true);
      expect(ok.body.user.profileComplete).toBe(false);
      tokens.patient = ok.body.accessToken;

      // A code can only be used once.
      await http().post('/v1/auth/otp/verify').send({ phone, code: body.devCode }).expect(400);
    });

    it('locks a code after five wrong attempts', async () => {
      const phone = freshPhone('0705');
      const { body } = await http().post('/v1/auth/otp/request').send({ phone }).expect(200);
      const wrong = body.devCode === '000000' ? '111111' : '000000';
      for (let i = 0; i < 5; i++) await http().post('/v1/auth/otp/verify').send({ phone, code: wrong }).expect(401);
      await http().post('/v1/auth/otp/verify').send({ phone, code: body.devCode }).expect(429);
    });

    it('rejects non-Nigerian numbers and protects routes', async () => {
      await http().post('/v1/auth/otp/request').send({ phone: '+44 7911 123456' }).expect(400);
      await http().get('/v1/me').expect(401);
      await http().get('/v1/me').set({ Authorization: 'Bearer not-a-token' }).expect(401);
    });
  });

  describe('profile and catalogue', () => {
    it('requires consent before the profile is complete', async () => {
      await http().patch('/v1/me').set(as('patient')).send({ firstName: 'Chidi', lastName: 'Eze', consent: false }).expect(400);
      const res = await http().patch('/v1/me').set(as('patient')).send({ firstName: 'Chidi', lastName: 'Eze', consent: true }).expect(200);
      expect(res.body.profileComplete).toBe(true);
    });

    it('prices a basket at every verified pharmacy, flagging what each can\u2019t supply', async () => {
      const res = await http()
        .post('/v1/quotes')
        .send({ items: [{ productId: ids['paracetamol-500'], quantity: 2 }, { productId: ids['tramadol-50'], quantity: 1 }] })
        .expect(200);
      expect(res.body).toHaveLength(3);
      const oak = res.body.find((q: { pharmacy: { id: string } }) => q.pharmacy.id === ids.oakfield);
      expect(oak.lines[0]).toMatchObject({ available: true, unitPriceKobo: 120_000 });
      expect(oak.lines[1]).toMatchObject({ available: false, unitPriceKobo: null }); // controlled: never priced
      expect(oak).toMatchObject({ unavailable: 1, subtotalKobo: 240_000, totalKobo: 240_000 + 150_000 + 30_000 });
    });

    it('tells staff which pharmacy they belong to', async () => {
      const res = await http().get('/v1/me').set(as('staff')).expect(200);
      expect(res.body).toMatchObject({ role: 'PHARMACY_STAFF', pharmacy: { name: 'Oakfield Pharmacy', status: 'VERIFIED' } });
    });

    it('never lists controlled medicines', async () => {
      const res = await http().get('/v1/products').expect(200);
      expect(res.body.some((p: { slug: string }) => p.slug === 'tramadol-50')).toBe(false);
      await http().get('/v1/products/tramadol-50').expect(404);
    });
  });

  describe('ordering', () => {
    it('places an OTC order with correct totals in kobo', async () => {
      const res = await http()
        .post('/v1/orders')
        .set(as('patient'))
        .send({ pharmacyId: ids.oakfield, deliveryAddress: '14 Herbert Macaulay Way, Yaba', deliveryArea: 'yaba', items: [{ productId: ids['paracetamol-500'], quantity: 1 }] })
        .expect(201);
      expect(res.body.status).toBe('ACCEPTED');
      expect(res.body.code).toMatch(/^PB-\d{6}$/);
      expect(res.body).toMatchObject({ subtotalKobo: 120_000, deliveryKobo: 150_000, serviceKobo: 30_000, totalKobo: 300_000 });
      ids.otcOrder = res.body.code;
    });

    it('refuses controlled medicines and prescription-only items without a prescription', async () => {
      const base = { pharmacyId: ids.oakfield, deliveryAddress: '14 Herbert Macaulay Way, Yaba', deliveryArea: 'yaba' };
      await http().post('/v1/orders').set(as('patient')).send({ ...base, items: [{ productId: ids['tramadol-50'], quantity: 1 }] }).expect(422);
      await http().post('/v1/orders').set(as('patient')).send({ ...base, items: [{ productId: ids['amoxicillin-500'], quantity: 2 }] }).expect(422);
    });

    it('only accepts real image or PDF uploads as prescriptions', async () => {
      await http().post('/v1/prescriptions').set(as('patient')).attach('image', Buffer.from('<html>not an image</html>'), { filename: 'rx.jpg', contentType: 'image/jpeg' }).expect(422);
      const res = await http().post('/v1/prescriptions').set(as('patient')).attach('image', JPEG, { filename: 'rx.jpg', contentType: 'image/jpeg' }).field('prescriberName', 'Dr. K. Bello').expect(201);
      expect(res.body.status).toBe('PENDING');
      ids.rx = res.body.id;
      ids.rxCode = res.body.code;
    });

    it('holds a prescription order for pharmacist review', async () => {
      const res = await http()
        .post('/v1/orders')
        .set(as('patient'))
        .send({ pharmacyId: ids.oakfield, deliveryAddress: '14 Herbert Macaulay Way, Yaba', deliveryArea: 'yaba', prescriptionId: ids.rx, items: [{ productId: ids['amoxicillin-500'], quantity: 16 }] })
        .expect(201);
      expect(res.body.status).toBe('PHARMACIST_REVIEW');
      ids.rxOrder = res.body.code;

      // Paid only once a pharmacist has approved the prescription.
      await http().post(`/v1/orders/${ids.rxOrder}/payment`).set(as('patient')).send({}).expect(409);
    });
  });

  describe('pharmacist review', () => {
    it('keeps counter staff out of professional decisions', async () => {
      await http().post(`/v1/pharmacy/orders/${ids.rxOrder}/status`).set(as('staff')).send({ status: 'PREPARING' }).expect(409);
      await http().post(`/v1/pharmacy/prescriptions/${ids.rxCode}/review`).set(as('staff')).send({ decision: 'APPROVE' }).expect(403);
      await http().get(`/v1/pharmacy/prescriptions/${ids.rxCode}/image`).set(as('staff')).expect(403);
    });

    it('hides one pharmacy’s orders from another', async () => {
      await http().get(`/v1/pharmacy/prescriptions/${ids.rxCode}/image`).set(as('otherPharmacist')).expect(404);
      const res = await http().get('/v1/pharmacy/orders').set(as('otherPharmacist')).expect(200);
      expect(res.body).toHaveLength(0);
    });

    it('lets the pharmacist view the image, with an audit record', async () => {
      const res = await http().get(`/v1/pharmacy/prescriptions/${ids.rxCode}/image`).set(as('pharmacist')).expect(200);
      expect(res.headers['content-type']).toContain('image/jpeg');
      expect(res.headers['cache-control']).toBe('no-store');
      expect(await prisma.auditLog.count({ where: { action: 'prescription.image_viewed', entityId: ids.rx } })).toBe(1);
    });

    it('requires every professional check before approval, then releases the order', async () => {
      const url = `/v1/pharmacy/prescriptions/${ids.rxCode}/review`;
      await http().post(url).set(as('pharmacist')).send({ decision: 'APPROVE', checks: { prescriberAndDateVerified: true, doseAndQuantityAppropriate: true, noInteractionOrAllergyConcerns: false } }).expect(422);
      const res = await http()
        .post(url)
        .set(as('pharmacist'))
        .send({ decision: 'APPROVE', checks: { prescriberAndDateVerified: true, doseAndQuantityAppropriate: true, noInteractionOrAllergyConcerns: true } })
        .expect(200);
      expect(res.body.status).toBe('APPROVED');
      expect(res.body.order.status).toBe('ACCEPTED');
      await http().post(url).set(as('pharmacist')).send({ decision: 'REJECT', note: 'second decision' }).expect(409);
    });
  });

  describe('payment', () => {
    it('won’t let the pharmacy prepare an order before it’s paid', async () => {
      const res = await http().post(`/v1/pharmacy/orders/${ids.rxOrder}/status`).set(as('staff')).send({ status: 'PREPARING' }).expect(409);
      expect(res.body.message).toMatch(/hasn’t paid/);
    });

    it('takes payment for an approved order (demo payment in development), once', async () => {
      const start = await http().post(`/v1/orders/${ids.rxOrder}/payment`).set(as('patient')).send({}).expect(200);
      const order = await http().get(`/v1/orders/${ids.rxOrder}`).set(as('patient')).expect(200);
      expect(start.body).toMatchObject({ provider: 'demo', amount: order.body.totalKobo / 100, currency: 'NGN' });
      expect(order.body.paymentStatus).toBe('UNPAID');

      const paid = await http().post(`/v1/orders/${ids.rxOrder}/payment/demo`).set(as('patient')).expect(200);
      expect(paid.body).toMatchObject({ paymentStatus: 'PAID', status: 'ACCEPTED' });
      expect(paid.body.paidAt).toBeTruthy();
      await http().post(`/v1/orders/${ids.rxOrder}/payment/demo`).set(as('patient')).expect(409);
      await http().post(`/v1/orders/${ids.rxOrder}/payment`).set(as('patient')).send({}).expect(409);

      await http().post(`/v1/orders/${ids.otcOrder}/payment/demo`).set(as('patient')).expect(200);
    });

    it('keeps other people’s orders and forged webhooks out', async () => {
      await http().post(`/v1/orders/${ids.rxOrder}/payment`).set(as('staff')).send({}).expect(403);
      await http().post('/v1/payments/flutterwave/webhook').set({ 'verif-hash': 'guess' }).send({ event: 'charge.completed', data: { id: 1, tx_ref: `${ids.otcOrder}-x` } }).expect(404);
    });
  });

  describe('dispensing', () => {
    it('allocates stock first-expiry-first-out, splitting across batches', async () => {
      const res = await http().post(`/v1/pharmacy/orders/${ids.rxOrder}/status`).set(as('staff')).send({ status: 'PREPARING' }).expect(200);
      const lines = res.body.items.map((i: { quantity: number; batch: { batchNumber: string } }) => [i.batch.batchNumber, i.quantity]).sort();
      expect(lines).toEqual([['AMX-2309-114', 14], ['AMX-2405-201', 2]]);

      const batches = await prisma.batch.findMany({ where: { pharmacyId: ids.oakfield, productId: ids['amoxicillin-500'] }, orderBy: { expiresAt: 'asc' } });
      expect(batches.map((b) => b.quantity)).toEqual([0, 38]);
    });

    it('offers the job to nearby riders as soon as packing starts, and hands over only with the code', async () => {
      const pharmacyView = await http().get('/v1/pharmacy/orders').set(as('staff')).expect(200);
      const job = pharmacyView.body.find((o: { code: string }) => o.code === ids.rxOrder).delivery;
      expect(job).toMatchObject({ status: 'AWAITING_RIDER' });
      expect(job.dropoffCode).toBeUndefined(); // the pharmacy never sees the code

      // Riders only see jobs near them, and only the area until they accept.
      await http().put('/v1/rider/status').set(as('coldRider')).send({ online: true, area: 'ajah' }).expect(200);
      const far = await http().get('/v1/rider/jobs').set(as('coldRider')).expect(200);
      expect(far.body.open.some((j: { code: string }) => j.code === job.code)).toBe(false);
      const near = await http().put('/v1/rider/status').set(as('rider')).send({ online: true, area: 'ikeja' }).expect(200);
      const offered = near.body.open.find((j: { code: string }) => j.code === job.code);
      expect(offered.pickup.name).toBe('Oakfield Pharmacy');
      expect(offered.dropoff).toMatchObject({ area: 'Yaba / Ebute-Metta' });
      expect(offered.dropoff.address).toBeUndefined();

      const accepted = await http().post(`/v1/rider/jobs/${job.code}/accept`).set(as('rider')).expect(200);
      expect(accepted.body.dropoff.address).toBe('14 Herbert Macaulay Way, Yaba');
      await http().post(`/v1/rider/jobs/${job.code}/accept`).set(as('coldRider')).expect(409);

      // Handed over only once ready, and only when the seal code the rider shows matches the parcel.
      const handover = `/v1/pharmacy/orders/${ids.rxOrder}/handover`;
      await http().post(handover).set(as('staff')).send({ sealCode: job.code }).expect(409);
      await http().post(`/v1/pharmacy/orders/${ids.rxOrder}/status`).set(as('staff')).send({ status: 'READY' }).expect(200);
      await http().post(`/v1/pharmacy/orders/${ids.rxOrder}/status`).set(as('staff')).send({ status: 'PICKED_UP' }).expect(409);
      await http().post(handover).set(as('staff')).send({ sealCode: 'DL-00000000' }).expect(422);
      await http().post(handover).set(as('staff')).send({ sealCode: job.code.replace('DL-', '').toLowerCase() }).expect(200);

      const mine = await http().get(`/v1/orders/${ids.rxOrder}`).set(as('patient')).expect(200);
      expect(mine.body).toMatchObject({ status: 'PICKED_UP', delivery: { status: 'PICKED_UP', rider: { firstName: 'Bisi' } } });
      expect(mine.body.arriveBy).toBeTruthy();
      const code = mine.body.delivery.dropoffCode as string;
      expect(code).toMatch(/^\d{4}$/);

      const wrong = code === '0000' ? '1111' : '0000';
      await http().post(`/v1/rider/jobs/${job.code}/delivered`).set(as('rider')).send({ code: wrong }).expect(422);
      await http().post(`/v1/rider/jobs/${job.code}/delivered`).set(as('rider')).send({ code }).expect(200);
      const done = await http().get(`/v1/orders/${ids.rxOrder}`).set(as('patient')).expect(200);
      expect(done.body).toMatchObject({ status: 'DELIVERED', delivery: { status: 'DELIVERED', dropoffCode: null } });
      await http().post(`/v1/pharmacy/orders/${ids.rxOrder}/status`).set(as('staff')).send({ status: 'PREPARING' }).expect(409);
    });

    it('brings a failed delivery back to the pharmacy, which can book another rider', async () => {
      const order = await http()
        .post('/v1/orders')
        .set(as('patient'))
        .send({ pharmacyId: ids.oakfield, deliveryAddress: '14 Herbert Macaulay Way, Yaba', deliveryArea: 'yaba', items: [{ productId: ids['paracetamol-500'], quantity: 1 }] })
        .expect(201);
      const code = order.body.code;
      await http().post(`/v1/orders/${code}/payment/demo`).set(as('patient')).expect(200);
      const preparing = await http().post(`/v1/pharmacy/orders/${code}/status`).set(as('staff')).send({ status: 'PREPARING' }).expect(200);
      const job = preparing.body.delivery.code;
      await http().post(`/v1/rider/jobs/${job}/accept`).set(as('rider')).expect(200);
      await http().post(`/v1/pharmacy/orders/${code}/status`).set(as('staff')).send({ status: 'READY' }).expect(200);
      await http().post(`/v1/pharmacy/orders/${code}/handover`).set(as('staff')).send({ sealCode: job }).expect(200);
      await http().post(`/v1/rider/jobs/${job}/failed`).set(as('rider')).send({ reason: 'Customer not reachable' }).expect(200);

      const back = await http().get(`/v1/orders/${code}`).set(as('patient')).expect(200);
      expect(back.body).toMatchObject({ status: 'READY', delivery: { status: 'FAILED', failReason: 'Customer not reachable' } });
      const rebooked = await http().post(`/v1/pharmacy/orders/${code}/delivery`).set(as('staff')).expect(200);
      expect(rebooked.body.status).toBe('AWAITING_RIDER');
      await http().post(`/v1/pharmacy/orders/${code}/delivery`).set(as('staff')).expect(409);

      // Cancelled after it had been out: the returned packs are quarantined, not put back on sale.
      const saleable = await prisma.batch.findMany({ where: { pharmacyId: ids.oakfield, productId: ids['paracetamol-500'], status: 'SALEABLE' } });
      await http().post(`/v1/pharmacy/orders/${code}/status`).set(as('staff')).send({ status: 'CANCELLED', note: 'Customer unreachable twice' }).expect(200);
      const after = await prisma.batch.findMany({ where: { pharmacyId: ids.oakfield, productId: ids['paracetamol-500'], status: 'SALEABLE' } });
      expect(after.map((b) => [b.id, b.quantity])).toEqual(saleable.map((b) => [b.id, b.quantity]));
      const returned = await prisma.batch.findFirstOrThrow({ where: { batchNumber: { endsWith: `-RTN-${code}` } } });
      expect(returned).toMatchObject({ status: 'QUARANTINED', quantity: 1 });
      expect(returned.quarantineReason).toMatch(/inspect before resale/);
    });

    it('ranks pharmacies by delivery time for the customer’s area', async () => {
      const items = [{ productId: ids['paracetamol-500'], quantity: 1 }];
      const ikeja = await http().post('/v1/quotes').send({ items, area: 'ikeja' }).expect(200);
      const surulere = await http().post('/v1/quotes').send({ items, area: 'surulere' }).expect(200);
      expect(ikeja.body[0].pharmacy.name).toBe('Oakfield Pharmacy');
      expect(surulere.body[0].pharmacy.name).toBe('Unity Pharmacy');
      expect(ikeja.body[0].etaMinutes).toBeLessThan(ikeja.body[ikeja.body.length - 1].etaMinutes);
    });

    it('returns allocated stock to the shelf when a prepared order is cancelled', async () => {
      const before = await prisma.batch.findFirstOrThrow({ where: { pharmacyId: ids.oakfield, productId: ids['paracetamol-500'], status: 'SALEABLE' }, orderBy: { expiresAt: 'asc' } });
      await http().post(`/v1/pharmacy/orders/${ids.otcOrder}/status`).set(as('staff')).send({ status: 'PREPARING' }).expect(200);
      expect((await prisma.batch.findUniqueOrThrow({ where: { id: before.id } })).quantity).toBe(before.quantity - 1);
      const cancelled = await http().post(`/v1/pharmacy/orders/${ids.otcOrder}/status`).set(as('staff')).send({ status: 'CANCELLED', note: 'Patient unreachable' }).expect(200);
      expect((await prisma.batch.findUniqueOrThrow({ where: { id: before.id } })).quantity).toBe(before.quantity);
      // It was paid, so the money is owed back, and the rider job is withdrawn.
      expect(cancelled.body.paymentStatus).toBe('REFUND_DUE');
      expect(cancelled.body.delivery.status).toBe('CANCELLED');
    });
  });

  describe('inventory', () => {
    it('lists stock FEFO and leaves quarantine release to pharmacists', async () => {
      const list = await http().get('/v1/pharmacy/inventory').set(as('staff')).expect(200);
      const expiries = list.body.map((b: { expiresAt: string }) => b.expiresAt);
      expect(expiries).toEqual([...expiries].sort((a: string, b: string) => a.localeCompare(b)));

      const batchId = list.body.find((b: { status: string; quantity: number }) => b.status === 'SALEABLE' && b.quantity > 0).id;
      await http().post(`/v1/pharmacy/inventory/batches/${batchId}/quarantine`).set(as('staff')).send({ reason: 'Fridge 2 excursion' }).expect(200);
      await http().post(`/v1/pharmacy/inventory/batches/${batchId}/release`).set(as('staff')).send({ qualityAssessmentConfirmed: true }).expect(403);
      await http().post(`/v1/pharmacy/inventory/batches/${batchId}/release`).set(as('pharmacist')).send({ qualityAssessmentConfirmed: false }).expect(400);
      const released = await http().post(`/v1/pharmacy/inventory/batches/${batchId}/release`).set(as('pharmacist')).send({ qualityAssessmentConfirmed: true, note: 'Log reviewed' }).expect(200);
      expect(released.body.status).toBe('SALEABLE');
    });

    it('rejects already-expired batches on receipt', async () => {
      await http()
        .post('/v1/pharmacy/inventory/batches')
        .set(as('staff'))
        .send({ productId: ids['paracetamol-500'], batchNumber: 'OLD-001', expiresAt: '2020-01-31', quantity: 10, priceKobo: 120_000 })
        .expect(400);
    });
  });

  it('records an audit trail of every regulated step', async () => {
    const actions = (await prisma.auditLog.findMany({ select: { action: true } })).map((a) => a.action);
    for (const a of ['auth.signed_up', 'order.created', 'order.paid', 'prescription.uploaded', 'prescription.image_viewed', 'prescription.approve', 'order.status_changed', 'delivery.requested', 'delivery.assigned', 'delivery.handed_over', 'delivery.delivered', 'delivery.failed', 'batch.quarantined', 'batch.released']) {
      expect(actions).toContain(a);
    }
  });
});
