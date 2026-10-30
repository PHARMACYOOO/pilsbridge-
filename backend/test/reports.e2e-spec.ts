import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { configureApp } from '../src/setup.js';
import { sessionFor } from './sessions.js';

const freshPhone = () => `0705${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
const today = () => new Date(Date.now() + 60 * 60_000).toISOString().slice(0, 10); // Lagos

describe('Delivery reports and courier invoice reconciliation', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const tokens: Record<string, string> = {};
  const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
  const ids: Record<string, string> = {};
  const run = Date.now();

  /** An order delivered — or failed — through the test courier, booked at `feeKobo` under `ref`. */
  async function courierDelivery(ref: string, feeKobo: number, outcome: 'delivered' | 'courier-fault') {
    const order = await http()
      .post('/v1/orders')
      .set(as('patient'))
      .send({ pharmacyId: ids.oakfield, deliveryAddress: '5 Allen Avenue', deliveryArea: 'ikeja', items: [{ productId: ids.paracetamol, quantity: 1 }] })
      .expect(201);
    const code = order.body.code;
    await http().post(`/v1/orders/${code}/payment/demo`).set(as('patient')).expect(200);
    const prep = await http().post(`/v1/pharmacy/orders/${code}/status`).set(as('staff')).send({ status: 'PREPARING' }).expect(200);
    const job = prep.body.delivery.code;
    await http().post(`/v1/admin/deliveries/${job}/courier`).set(as('admin')).send({ courierId: ids.courier, providerRef: ref, feeKobo }).expect(200);
    await http().post(`/v1/pharmacy/orders/${code}/status`).set(as('staff')).send({ status: 'READY' }).expect(200);
    await http().post(`/v1/pharmacy/orders/${code}/handover`).set(as('staff')).send({ sealCode: job }).expect(200);
    if (outcome === 'delivered') {
      await http().post(`/v1/admin/deliveries/${job}/courier/delivered`).set(as('admin')).send({ courierProof: `POD ${ref}` }).expect(200);
    } else {
      await http().post(`/v1/admin/deliveries/${job}/courier/failed`).set(as('admin')).send({ reason: 'Rider abandoned the job', cause: 'COURIER_FAULT' }).expect(200);
    }
    return job as string;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
    for (const [who, phone] of [['admin', '+2348030000009'], ['staff', '+2348030000002']]) {
      tokens[who] = await sessionFor(app, (await prisma.user.findUniqueOrThrow({ where: { phone } })).id);
    }
    const phone = freshPhone();
    const { body } = await http().post('/v1/auth/otp/request').send({ phone, intent: 'signup' }).expect(200);
    tokens.patient = (await http().post('/v1/auth/otp/verify').send({ phone, code: body.devCode, intent: 'signup', firstName: 'Bola', lastName: 'Ade', consent: true }).expect(200)).body.accessToken;
    ids.oakfield = (await prisma.pharmacy.findUniqueOrThrow({ where: { slug: 'oakfield-ikeja' } })).id;
    ids.paracetamol = (await prisma.product.findUniqueOrThrow({ where: { slug: 'paracetamol-500' } })).id;
    ids.courierName = `Report Couriers ${run}`;
    ids.courier = (await http().post('/v1/admin/couriers').set(as('admin')).send({ name: ids.courierName }).expect(201)).body.id;

    ids.a = await courierDelivery(`A-${run}`, 180_000, 'delivered');
    ids.b = await courierDelivery(`B-${run}`, 150_000, 'delivered');
    ids.c = await courierDelivery(`C-${run}`, 180_000, 'courier-fault');
  });

  afterAll(async () => {
    await prisma?.courier.updateMany({ where: { id: ids.courier }, data: { active: false } });
    await app?.close();
  });

  it('records who bears a failed delivery’s cost', async () => {
    expect(await prisma.delivery.findUniqueOrThrow({ where: { code: ids.c } })).toMatchObject({ failureCause: 'COURIER_FAULT', costBearer: 'COURIER' });
  });

  it('checks a courier invoice line by line', async () => {
    const res = await http()
      .post(`/v1/admin/couriers/${ids.courier}/invoices`)
      .set(as('admin'))
      .send({
        number: `INV-${run}`,
        periodStart: today(),
        periodEnd: today(),
        lines: [
          { providerRef: `A-${run}`, amountKobo: 180_000 },
          { providerRef: `B-${run}`, amountKobo: 170_000 },
          { providerRef: `C-${run}`, amountKobo: 180_000 },
          { providerRef: `Z-${run}`, amountKobo: 99_000 },
        ],
      })
      .expect(201);
    ids.invoice = res.body.id;
    expect(res.body.lines.map((l: { outcome: string }) => l.outcome)).toEqual(['MATCHED', 'OVERCHARGED', 'COURIER_FAULT', 'UNKNOWN']);
    expect(res.body.totals).toMatchObject({ invoicedKobo: 629_000, disputedKobo: 20_000 + 180_000 + 99_000, payableKobo: 330_000, matched: 1, disputed: 3 });

    await http()
      .post(`/v1/admin/couriers/${ids.courier}/invoices`)
      .set(as('admin'))
      .send({ number: `INV-${run}`, periodStart: today(), periodEnd: today(), lines: [{ providerRef: 'x', amountKobo: 1 }] })
      .expect(409);
  });

  it('is marked reconciled once', async () => {
    const done = await http().post(`/v1/admin/invoices/${ids.invoice}/reconcile`).set(as('admin')).send({ note: 'Disputed 3 lines by email' }).expect(201);
    expect(done.body).toMatchObject({ status: 'RECONCILED', note: 'Disputed 3 lines by email' });
    await http().post(`/v1/admin/invoices/${ids.invoice}/reconcile`).set(as('admin')).send({}).expect(409);
    const list = await http().get('/v1/admin/invoices').set(as('admin')).expect(200);
    expect(list.body.find((i: { id: string }) => i.id === ids.invoice)).toMatchObject({ status: 'RECONCILED', lines: 4, courier: { name: ids.courierName } });
  });

  it('reports performance and cost by provider', async () => {
    const res = await http().get(`/v1/admin/reports/delivery?from=${today()}&to=${today()}`).set(as('admin')).expect(200);
    expect(res.body.targets).toMatchObject({ completion: 0.95, pickupPunctuality: 0.9 });
    const ours = res.body.byProvider.find((p: { name: string }) => p.name === ids.courierName);
    expect(ours).toMatchObject({ jobs: 3, delivered: 2, failed: 1, completionRate: 0.667, proofCoverage: 1 });
    // The courier is owed for the two it delivered, not the one it failed.
    expect(ours.money).toMatchObject({ courierCostKobo: 330_000, courierCostPerDeliveryKobo: 165_000 });
    expect(ours.failureCauses).toEqual([{ key: 'COURIER_FAULT', count: 1 }]);
    expect(ours.avgMinutes.packing).not.toBeNull();
    expect(res.body.byPharmacy.some((p: { name: string }) => p.name === 'Oakfield Pharmacy')).toBe(true);
  });

  it('exports deliveries as CSV, for admins only', async () => {
    const res = await http().get(`/v1/admin/reports/deliveries.csv?from=${today()}&to=${today()}`).set(as('admin')).expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('pilbridge-deliveries-');
    expect(res.text.split('\n')[0]).toMatch(/^delivery,order,provider/);
    expect(res.text).toContain(`${ids.c},`);
    expect(res.text).toMatch(/COURIER_FAULT,COURIER/);
    await http().get('/v1/admin/reports/delivery').set(as('staff')).expect(403);
    await http().get('/v1/admin/reports/delivery?from=12-10-2026').set(as('admin')).expect(400);
  });
});
