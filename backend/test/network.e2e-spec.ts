import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { configureApp } from '../src/setup.js';
import { sessionFor } from './sessions.js';
import { SmsService } from '../src/sms/sms.service.js';

const PDF = Buffer.from('%PDF-1.7\n% test document\n');
const freshPhone = () => `0816${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
const tag = () => Math.random().toString(36).slice(2, 7);
const inDays = (d: number) => new Date(Date.now() + d * 24 * 60 * 60_000);
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Pharmacy network: onboarding and verification, staff accounts, partner applications,
 * compliance documents and licence enforcement, transfers, settlements, and the portal's own data.
 * Every pharmacy made here is suspended afterwards, so other suites still see the 3 seeded ones.
 */
describe('Pharmacy network', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const tokens: Record<string, string> = {};
  const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
  const created: string[] = [];
  const texts: { phone: string; text: string }[] = [];
  let paracetamol: string;
  let insulin: string;

  /** A verified pharmacy with a pharmacist and a counter-staff account, made through the admin API. */
  async function pharmacy(who: string, extra: Record<string, unknown> = {}) {
    const res = await http()
      .post('/v1/admin/pharmacies')
      .set(as('admin'))
      .send({ name: `Test Pharmacy ${tag()}`, area: 'Yaba', address: '1 Test Street, Yaba, Lagos', premisesLicenceNo: `PCN/T/${tag()}`, licenceExpiresAt: isoDay(inDays(365)), lat: 6.51, lng: 3.37, ...extra })
      .expect(201);
    const id: string = res.body.id;
    created.push(id);
    const ph = await http().post(`/v1/admin/pharmacies/${id}/staff`).set(as('admin')).send({ firstName: 'Ada', lastName: 'Pharm', phone: freshPhone(), role: 'PHARMACIST', pcnRegNo: `PCN/RP/${tag()}` }).expect(201);
    const st = await http().post(`/v1/admin/pharmacies/${id}/staff`).set(as('admin')).send({ firstName: 'Sola', lastName: 'Counter', phone: freshPhone(), role: 'PHARMACY_STAFF' }).expect(201);
    tokens[`${who}Pharmacist`] = await sessionFor(app, ph.body.id);
    tokens[`${who}Staff`] = await sessionFor(app, st.body.id);
    await http().post(`/v1/admin/pharmacies/${id}/verify`).set(as('admin')).send({ note: 'Licence checked on the PCN register (test)' }).expect(200);
    return { id, pharmacistId: ph.body.id as string, staffId: st.body.id as string, name: res.body.name as string };
  }

  async function stock(who: string, productId: string, quantity = 40, expiresAt = inDays(200)) {
    const res = await http()
      .post('/v1/pharmacy/inventory/batches')
      .set(as(`${who}Staff`))
      .send({ productId, batchNumber: `TB-${tag()}`, expiresAt: isoDay(expiresAt), quantity, priceKobo: 150_000 })
      .expect(201);
    return res.body as { id: string; batchNumber: string };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
    for (const [who, phone] of [['admin', '+2348030000009'], ['seededStaff', '+2348030000002']]) {
      tokens[who] = await sessionFor(app, (await prisma.user.findUniqueOrThrow({ where: { phone } })).id);
    }
    paracetamol = (await prisma.product.findUniqueOrThrow({ where: { slug: 'paracetamol-500' } })).id;
    insulin = (await prisma.product.findUniqueOrThrow({ where: { slug: 'insulin-glargine-pen' } })).id;
    const sms = app.get(SmsService);
    vi.spyOn(sms, 'sendText').mockImplementation(async (phone: string, text: string) => {
      texts.push({ phone, text });
    });
  });

  afterAll(async () => {
    if (prisma && created.length) await prisma.pharmacy.updateMany({ where: { id: { in: created } }, data: { status: 'SUSPENDED' } });
    await app?.close();
  });

  describe('onboarding', () => {
    it('creates a pharmacy pending verification, out of the catalogue until verified', async () => {
      const res = await http()
        .post('/v1/admin/pharmacies')
        .set(as('admin'))
        .send({ name: `Pending Pharmacy ${tag()}`, area: 'Ikorodu', address: '5 Lagos Road, Ikorodu', premisesLicenceNo: 'PCN/P/1', licenceExpiresAt: isoDay(inDays(200)) })
        .expect(201);
      created.push(res.body.id);
      expect(res.body).toMatchObject({ status: 'PENDING_VERIFICATION', staff: [] });
      const listed = await http().get('/v1/pharmacies').expect(200);
      expect(listed.body.map((p: { id: string }) => p.id)).not.toContain(res.body.id);

      // No pharmacist yet: can't go live.
      await http().post(`/v1/admin/pharmacies/${res.body.id}/verify`).set(as('admin')).send({ note: 'Licence checked on the PCN register' }).expect(422);
      // Staff need a PCN number to be added as pharmacists.
      await http().post(`/v1/admin/pharmacies/${res.body.id}/staff`).set(as('admin')).send({ firstName: 'A', lastName: 'B', phone: freshPhone(), role: 'PHARMACIST' }).expect(400);
    });

    it('refuses an expired licence and non-admins', async () => {
      await http().post('/v1/admin/pharmacies').set(as('admin')).send({ name: 'Old Licence', area: 'Yaba', address: '1 Test Street', premisesLicenceNo: 'PCN/X', licenceExpiresAt: '2020-01-01' }).expect(422);
      await http().post('/v1/admin/pharmacies').set(as('seededStaff')).send({}).expect(403);
      await http().get('/v1/admin/applications').set(as('seededStaff')).expect(403);
    });

    it('verifies, lists, suspends — and keeps a live pharmacy’s only pharmacist', async () => {
      const p = await pharmacy('onb');
      const listed = await http().get('/v1/pharmacies').expect(200);
      expect(listed.body.map((x: { id: string }) => x.id)).toContain(p.id);
      await vi.waitFor(() => expect(texts.some((t) => /is now live on Pilbridge/.test(t.text))).toBe(true)); // sent in the background

      await http().delete(`/v1/admin/pharmacies/${p.id}/staff/${p.pharmacistId}`).set(as('admin')).expect(409);
      await http().get('/v1/pharmacy/orders').set(as('onbPharmacist')).expect(200);

      const suspended = await http().post(`/v1/admin/pharmacies/${p.id}/suspend`).set(as('admin')).send({ reason: 'Test suspension' }).expect(200);
      expect(suspended.body).toMatchObject({ status: 'SUSPENDED', suspendedReason: 'Test suspension', openOrders: 0 });
      expect((await http().get('/v1/pharmacies').expect(200)).body.map((x: { id: string }) => x.id)).not.toContain(p.id);

      // Suspended: the last pharmacist can be removed, and the account becomes a plain patient account.
      await http().delete(`/v1/admin/pharmacies/${p.id}/staff/${p.pharmacistId}`).set(as('admin')).expect(200);
      await http().get('/v1/pharmacy/orders').set(as('onbPharmacist')).expect(401); // removal signs them out
      expect((await prisma.user.findUniqueOrThrow({ where: { id: p.pharmacistId } })).role).toBe('PATIENT');
    });

    it('won’t turn an existing account with history into staff', async () => {
      const p = await pharmacy('dup');
      const staff = await prisma.user.findUniqueOrThrow({ where: { id: p.staffId } });
      const local = `0${staff.phone!.slice(4)}`;
      await http().post(`/v1/admin/pharmacies/${p.id}/staff`).set(as('admin')).send({ firstName: 'X', lastName: 'Y', phone: local, role: 'PHARMACY_STAFF' }).expect(409);
    });

    it('takes partner applications from the public form, once', async () => {
      const email = `ops-${tag()}@example.com`;
      const body = { kind: 'LOGISTICS', organisation: 'Swift Test Logistics', email, phone: freshPhone(), details: { fleet: '12 bikes', coverage: 'Mainland', cold: 'Not yet — ambient only' } };
      const first = await http().post('/v1/partners/applications').send(body).expect(201);
      expect(first.body).toEqual({ code: expect.stringMatching(/^APP-\d{5}$/), status: 'NEW' });
      const again = await http().post('/v1/partners/applications').send(body).expect(201);
      expect(again.body.code).toBe(first.body.code);

      await http().post('/v1/partners/applications').send({ ...body, details: { '<script>': 'x' } }).expect(400);
      await http().post('/v1/partners/applications').send({ ...body, details: { notes: 'x'.repeat(501) } }).expect(400);
      await http().post('/v1/partners/applications').send({ ...body, phone: '12345' }).expect(400);

      const list = await http().get('/v1/admin/applications?status=NEW').set(as('admin')).expect(200);
      const app = list.body.find((a: { code: string }) => a.code === first.body.code);
      expect(app).toMatchObject({ kind: 'LOGISTICS', details: { fleet: '12 bikes' } });
      await http().post(`/v1/admin/applications/${app.id}/review`).set(as('admin')).send({ status: 'DECLINED', note: 'No cold chain yet' }).expect(200);
      await http().post(`/v1/admin/applications/${app.id}/review`).set(as('admin')).send({ status: 'APPROVED' }).expect(409);
    });
  });

  describe('compliance', () => {
    it('uploads documents for review, only visible to the pharmacy and admins', async () => {
      const a = await pharmacy('docA');
      await pharmacy('docB');
      await http().post('/v1/pharmacy/compliance/documents').set(as('docAStaff')).attach('file', Buffer.from('<html>'), 'x.pdf').field('kind', 'INSURANCE').field('reference', 'GIT-1').field('expiresAt', isoDay(inDays(300))).expect(422);
      await http().post('/v1/pharmacy/compliance/documents').set(as('docAStaff')).attach('file', PDF, 'licence.pdf').field('kind', 'PREMISES_LICENCE').field('reference', 'PCN/NEW/1').expect(422); // needs an expiry

      const renewed = isoDay(inDays(700));
      const up = await http().post('/v1/pharmacy/compliance/documents').set(as('docAStaff')).attach('file', PDF, 'licence.pdf').field('kind', 'PREMISES_LICENCE').field('reference', 'PCN/NEW/1').field('expiresAt', renewed).expect(201);
      expect(up.body).toMatchObject({ status: 'PENDING', kind: 'PREMISES_LICENCE' });
      expect(up.body.fileKey).toBeUndefined();

      await http().get(`/v1/pharmacy/compliance/documents/${up.body.id}/file`).set(as('docAStaff')).expect(200);
      await http().get(`/v1/pharmacy/compliance/documents/${up.body.id}/file`).set(as('docBStaff')).expect(404);
      await http().get(`/v1/admin/compliance/documents/${up.body.id}/file`).set(as('admin')).expect(200);

      const pending = await http().get('/v1/admin/compliance/documents').set(as('admin')).expect(200);
      expect(pending.body.map((d: { id: string }) => d.id)).toContain(up.body.id);
      await http().post(`/v1/admin/compliance/documents/${up.body.id}/review`).set(as('admin')).send({ decision: 'REJECT' }).expect(422); // needs a reason
      await http().post(`/v1/admin/compliance/documents/${up.body.id}/review`).set(as('admin')).send({ decision: 'VERIFY', note: 'Checked on the PCN register' }).expect(200);

      // A verified premises licence becomes the pharmacy's licence of record.
      const ph = await prisma.pharmacy.findUniqueOrThrow({ where: { id: a.id } });
      expect(ph.premisesLicenceNo).toBe('PCN/NEW/1');
      expect(isoDay(ph.licenceExpiresAt)).toBe(renewed);
      const overview = await http().get('/v1/pharmacy/compliance').set(as('docAStaff')).expect(200);
      expect(overview.body.kinds.find((k: { kind: string }) => k.kind === 'PREMISES_LICENCE')).toMatchObject({ state: 'valid', reference: 'PCN/NEW/1' });
      expect(overview.body.kinds.find((k: { kind: string }) => k.kind === 'INSURANCE')).toMatchObject({ state: 'missing' });
    });

    it('suspends a pharmacy when its licence expires, and reminds before that — once', async () => {
      const lapsing = await pharmacy('lapse');
      const soon = await pharmacy('soon');
      await prisma.pharmacy.update({ where: { id: lapsing.id }, data: { licenceExpiresAt: inDays(-1) } });
      await prisma.pharmacy.update({ where: { id: soon.id }, data: { licenceExpiresAt: inDays(20), licenceReminderDays: null } });

      const first = await http().post('/v1/admin/compliance/check').set(as('admin')).expect(200);
      expect(first.body.suspended).toContain(lapsing.name);
      expect(first.body.reminded).toContain(`${soon.name}: licence 30d`);
      expect((await prisma.pharmacy.findUniqueOrThrow({ where: { id: lapsing.id } })).status).toBe('SUSPENDED');
      expect((await http().get('/v1/pharmacies').expect(200)).body.map((x: { id: string }) => x.id)).not.toContain(lapsing.id);

      const second = await http().post('/v1/admin/compliance/check').set(as('admin')).expect(200);
      expect(second.body.suspended).not.toContain(lapsing.name);
      expect(second.body.reminded).not.toContain(`${soon.name}: licence 30d`);
      // It stays suspended until an admin reinstates it with a current licence.
      await http().post(`/v1/admin/pharmacies/${lapsing.id}/verify`).set(as('admin')).send({ note: 'Licence checked on the PCN register' }).expect(422);
    });
  });

  describe('transfers', () => {
    let to: Awaited<ReturnType<typeof pharmacy>>;

    beforeAll(async () => {
      await pharmacy('from', { coldChain: true });
      to = await pharmacy('to');
    });

    it('needs a pharmacist at each end, reserves stock on acceptance, and checks it in at the other end', async () => {
      const batch = await stock('from', paracetamol, 40);
      await http().post('/v1/pharmacy/transfers').set(as('fromStaff')).send({ batchId: batch.id, quantity: 41 }).expect(422);
      const draft = await http().post('/v1/pharmacy/transfers').set(as('fromStaff')).send({ batchId: batch.id, quantity: 10, toPharmacyId: to.id, note: 'Surplus' }).expect(201);
      expect(draft.body).toMatchObject({ status: 'DRAFT', direction: 'OUTGOING', blocked: null });
      const code = draft.body.code as string;

      // Drafts are private to the sender; counter staff can't approve.
      expect((await http().get('/v1/pharmacy/transfers').set(as('toPharmacist')).expect(200)).body.map((t: { code: string }) => t.code)).not.toContain(code);
      await http().post(`/v1/pharmacy/transfers/${code}/publish`).set(as('fromStaff')).expect(403);
      await http().post(`/v1/pharmacy/transfers/${code}/publish`).set(as('fromPharmacist')).expect(200);

      const incoming = (await http().get('/v1/pharmacy/transfers').set(as('toPharmacist')).expect(200)).body.find((t: { code: string }) => t.code === code);
      expect(incoming).toMatchObject({ status: 'OFFERED', direction: 'INCOMING' });
      const notes = await http().get('/v1/pharmacy/notifications').set(as('toStaff')).expect(200);
      expect(notes.body.items.some((n: { id: string; unread: boolean }) => n.id === `tr-${code}-offer` && n.unread)).toBe(true);

      await http().post(`/v1/pharmacy/transfers/${code}/accept`).set(as('fromPharmacist')).expect(404); // not your own offer
      await http().post(`/v1/pharmacy/transfers/${code}/accept`).set(as('toStaff')).expect(403);
      await http().post(`/v1/pharmacy/transfers/${code}/accept`).set(as('toPharmacist')).expect(200);
      expect((await prisma.batch.findUniqueOrThrow({ where: { id: batch.id } })).quantity).toBe(30);

      await http().post(`/v1/pharmacy/transfers/${code}/receive`).set(as('toPharmacist')).send({ conditionConfirmed: true, priceKobo: 160_000 }).expect(409); // not sent yet
      await http().post(`/v1/pharmacy/transfers/${code}/dispatch`).set(as('fromStaff')).expect(200);
      await http().post(`/v1/pharmacy/transfers/${code}/cancel`).set(as('fromPharmacist')).send({ reason: 'Too late' }).expect(409);
      await http().post(`/v1/pharmacy/transfers/${code}/receive`).set(as('toPharmacist')).send({ conditionConfirmed: false, priceKobo: 160_000 }).expect(400);
      const received = await http().post(`/v1/pharmacy/transfers/${code}/receive`).set(as('toPharmacist')).send({ conditionConfirmed: true, priceKobo: 160_000, location: 'Shelf T1' }).expect(200);
      expect(received.body).toMatchObject({ status: 'RECEIVED', quarantined: false });

      const at = await prisma.batch.findUniqueOrThrow({ where: { id: received.body.receivedBatchId } });
      expect(at).toMatchObject({ pharmacyId: to.id, batchNumber: batch.batchNumber, quantity: 10, status: 'SALEABLE', priceKobo: 160_000 });
    });

    it('returns reserved stock when an accepted transfer is cancelled', async () => {
      const batch = await stock('from', paracetamol, 20);
      const { body } = await http().post('/v1/pharmacy/transfers').set(as('fromStaff')).send({ batchId: batch.id, quantity: 5 }).expect(201);
      await http().post(`/v1/pharmacy/transfers/${body.code}/publish`).set(as('fromPharmacist')).expect(200);
      // Offered to the whole network: any other verified pharmacy's pharmacist can take it.
      await http().post(`/v1/pharmacy/transfers/${body.code}/accept`).set(as('toPharmacist')).expect(200);
      expect((await prisma.batch.findUniqueOrThrow({ where: { id: batch.id } })).quantity).toBe(15);
      await http().post(`/v1/pharmacy/transfers/${body.code}/cancel`).set(as('fromStaff')).send({ reason: 'Need it back' }).expect(403); // a pharmacist must
      await http().post(`/v1/pharmacy/transfers/${body.code}/cancel`).set(as('toPharmacist')).send({ reason: 'No longer needed' }).expect(200);
      expect((await prisma.batch.findUniqueOrThrow({ where: { id: batch.id } })).quantity).toBe(20);
    });

    it('blocks cold-chain, short-dated and quarantined stock', async () => {
      const cold = await stock('from', insulin, 5);
      await http().post('/v1/pharmacy/transfers').set(as('fromStaff')).send({ batchId: cold.id, quantity: 1 }).expect(422);
      const short = await stock('from', paracetamol, 5, inDays(20));
      await http().post('/v1/pharmacy/transfers').set(as('fromStaff')).send({ batchId: short.id, quantity: 1 }).expect(422);

      const held = await stock('from', paracetamol, 5);
      const { body } = await http().post('/v1/pharmacy/transfers').set(as('fromStaff')).send({ batchId: held.id, quantity: 2 }).expect(201);
      await http().post(`/v1/pharmacy/transfers/${body.code}/publish`).set(as('fromPharmacist')).expect(200);
      await http().post(`/v1/pharmacy/inventory/batches/${held.id}/quarantine`).set(as('fromStaff')).send({ reason: 'Recall notice' }).expect(200);
      const listed = (await http().get('/v1/pharmacy/transfers').set(as('toPharmacist')).expect(200)).body.find((t: { code: string }) => t.code === body.code);
      expect(listed.blocked).toMatch(/quarantined/);
      await http().post(`/v1/pharmacy/transfers/${body.code}/accept`).set(as('toPharmacist')).expect(422);
    });

    it('checks stock in to quarantine if its batch went on hold on the way', async () => {
      const batch = await stock('from', paracetamol, 8);
      const { body } = await http().post('/v1/pharmacy/transfers').set(as('fromStaff')).send({ batchId: batch.id, quantity: 3, toPharmacyId: to.id }).expect(201);
      await http().post(`/v1/pharmacy/transfers/${body.code}/publish`).set(as('fromPharmacist')).expect(200);
      await http().post(`/v1/pharmacy/transfers/${body.code}/accept`).set(as('toPharmacist')).expect(200);
      await http().post(`/v1/pharmacy/transfers/${body.code}/dispatch`).set(as('fromStaff')).expect(200);
      await http().post(`/v1/pharmacy/inventory/batches/${batch.id}/quarantine`).set(as('fromStaff')).send({ reason: 'Recall notice' }).expect(200);

      const received = await http().post(`/v1/pharmacy/transfers/${body.code}/receive`).set(as('toPharmacist')).send({ conditionConfirmed: true, priceKobo: 150_000 }).expect(200);
      expect(received.body.quarantined).toBe(true);
      const at = await prisma.batch.findUniqueOrThrow({ where: { id: received.body.receivedBatchId } });
      expect(at).toMatchObject({ status: 'QUARANTINED', quantity: 3 });
    });

    it('lets the receiving pharmacy decline an offer made to it', async () => {
      const batch = await stock('from', paracetamol, 4);
      const { body } = await http().post('/v1/pharmacy/transfers').set(as('fromStaff')).send({ batchId: batch.id, quantity: 2, toPharmacyId: to.id }).expect(201);
      await http().post(`/v1/pharmacy/transfers/${body.code}/publish`).set(as('fromPharmacist')).expect(200);
      const declined = await http().post(`/v1/pharmacy/transfers/${body.code}/decline`).set(as('toPharmacist')).send({ reason: 'Enough stock' }).expect(200);
      expect(declined.body).toMatchObject({ status: 'DECLINED', closeReason: 'Enough stock' });
    });
  });

  describe('settlements', () => {
    let p: Awaited<ReturnType<typeof pharmacy>>;
    const orderIds: string[] = [];

    beforeAll(async () => {
      p = await pharmacy('settle');
      const patient = await prisma.user.create({ data: { phone: `+234${freshPhone().slice(1)}`, firstName: 'Pay', lastName: 'Tient', consentAt: new Date() } });
      for (const subtotalKobo of [100_000, 250_000]) {
        const code = `PB-T${tag()}`;
        const o = await prisma.order.create({
          data: {
            code, patientId: patient.id, pharmacyId: p.id, status: 'DELIVERED', paymentStatus: 'PAID', paidAt: inDays(-3), deliveryAddress: '1 Test Street', deliveryArea: 'yaba',
            subtotalKobo, deliveryKobo: 150_000, serviceKobo: 30_000, totalKobo: subtotalKobo + 180_000,
            deliveries: { create: { code: `DL-T${tag()}`, status: 'DELIVERED', dropoffCode: '1234', deliveredAt: inDays(-2) } },
          },
        });
        orderIds.push(o.id);
      }
    });

    it('shows pharmacists what they’re owed; counter staff don’t see finances', async () => {
      await http().get('/v1/pharmacy/settlements').set(as('settleStaff')).expect(403);
      const res = await http().get('/v1/pharmacy/settlements').set(as('settlePharmacist')).expect(200);
      expect(res.body.unsettled).toEqual({ orderCount: 2, grossKobo: 350_000, feesKobo: 24_500, netKobo: 325_500 });
      expect(res.body.bank).toMatchObject({ payable: false, reason: 'No settlement account added' });
    });

    it('pays each order once, only to a verified account past its 48-hour hold', async () => {
      const preview = await http().get('/v1/admin/payouts/preview').set(as('admin')).expect(200);
      expect(preview.body.pharmacies.find((x: { pharmacy: { id: string } }) => x.pharmacy.id === p.id)).toMatchObject({ orderCount: 2, netKobo: 325_500 });
      await http().post('/v1/admin/payouts').set(as('admin')).send({ before: isoDay(inDays(5)) }).expect(400); // the future

      const made = await http().post('/v1/admin/payouts').set(as('admin')).send({}).expect(201);
      const payout = made.body.find((x: { pharmacyId: string }) => x.pharmacyId === p.id);
      expect(payout).toMatchObject({ status: 'SCHEDULED', orderCount: 2, grossKobo: 350_000, feesKobo: 24_500, netKobo: 325_500 });
      // Already in a payout: a second run doesn't pick them up again.
      const again = await http().post('/v1/admin/payouts').set(as('admin')).send({}).expect(201);
      expect(again.body.find((x: { pharmacyId: string }) => x.pharmacyId === p.id)).toBeUndefined();

      await http().post(`/v1/admin/payouts/${payout.id}/paid`).set(as('admin')).send({ reference: 'TRF-1' }).expect(422); // no account

      await http().put('/v1/pharmacy/settings/bank').set(as('settleStaff')).send({ bankName: 'GTBank', accountName: 'Test Pharmacy Ltd', accountNumber: '0123454821' }).expect(403);
      const bank = await http().put('/v1/pharmacy/settings/bank').set(as('settlePharmacist')).send({ bankName: 'GTBank', accountName: 'Test Pharmacy Ltd', accountNumber: '0123454821' }).expect(200);
      expect(bank.body.bank).toMatchObject({ accountNumber: '••••••4821', verified: false });
      await new Promise((r) => setTimeout(r, 50)); // texts are sent in the background
      expect(texts.some((t) => /settlement account for .* was changed to one ending 4821/.test(t.text))).toBe(true);

      await http().post(`/v1/admin/payouts/${payout.id}/paid`).set(as('admin')).send({ reference: 'TRF-1' }).expect(422); // not verified
      await http().post(`/v1/admin/pharmacies/${p.id}/bank/verify`).set(as('admin')).send({ note: 'Name matches the CAC certificate (test)' }).expect(200);
      const held = await http().post(`/v1/admin/payouts/${payout.id}/paid`).set(as('admin')).send({ reference: 'TRF-1' }).expect(422);
      expect(held.body.message).toMatch(/48-hour hold/);

      await prisma.pharmacy.update({ where: { id: p.id }, data: { bankUpdatedAt: new Date(Date.now() - 49 * 60 * 60_000) } });
      const paid = await http().post(`/v1/admin/payouts/${payout.id}/paid`).set(as('admin')).send({ reference: 'TRF-1' }).expect(200);
      expect(paid.body).toMatchObject({ status: 'PAID', reference: 'TRF-1', bankAccountNumber: '0123454821' });
      await http().post(`/v1/admin/payouts/${payout.id}/paid`).set(as('admin')).send({ reference: 'TRF-2' }).expect(409);

      const mine = await http().get(`/v1/pharmacy/settlements/${payout.code}`).set(as('settlePharmacist')).expect(200);
      expect(mine.body).toMatchObject({ status: 'PAID', bankAccountNumber: '••••••4821' });
      expect(mine.body.orders).toHaveLength(2);
    });

    it('voids an unpaid payout, freeing its orders for the next one', async () => {
      await prisma.order.updateMany({ where: { id: { in: orderIds } }, data: { payoutId: null } });
      const made = await http().post('/v1/admin/payouts').set(as('admin')).send({}).expect(201);
      const payout = made.body.find((x: { pharmacyId: string }) => x.pharmacyId === p.id);
      await http().post(`/v1/admin/payouts/${payout.id}/void`).set(as('admin')).send({ reason: 'Test void of a payout' }).expect(200);
      expect(await prisma.order.count({ where: { id: { in: orderIds }, payoutId: null } })).toBe(2);
    });
  });

  describe('portal settings, activity and notifications', () => {
    let p: Awaited<ReturnType<typeof pharmacy>>;

    beforeAll(async () => {
      p = await pharmacy('portal');
    });

    it('lets pharmacists set hours and delivery areas, which checkout respects', async () => {
      await http().patch('/v1/pharmacy/settings').set(as('portalStaff')).send({ coverageAreas: ['ikeja'] }).expect(403);
      await http().patch('/v1/pharmacy/settings').set(as('portalPharmacist')).send({ coverageAreas: ['mars'] }).expect(400);
      await http().patch('/v1/pharmacy/settings').set(as('portalPharmacist')).send({ opensAt: '20:00', lastOrderAt: '19:00' }).expect(422);
      const res = await http().patch('/v1/pharmacy/settings').set(as('portalPharmacist')).send({ coverageAreas: ['ikeja', 'ogba'], openDays: [6, 1, 2], opensAt: '08:00', lastOrderAt: '19:30' }).expect(200);
      expect(res.body).toMatchObject({ coverageAreas: ['ikeja', 'ogba'], hours: { openDays: [1, 2, 6], opensAt: '08:00', lastOrderAt: '19:30' } });

      await stock('portal', paracetamol, 10);
      const quotes = async (area: string) => (await http().post('/v1/quotes').send({ items: [{ productId: paracetamol, quantity: 1 }], area }).expect(200)).body.map((q: { pharmacy: { id: string } }) => q.pharmacy.id);
      expect(await quotes('ikeja')).toContain(p.id);
      expect(await quotes('yaba')).not.toContain(p.id);

      const patient = await prisma.user.create({ data: { phone: `+234${freshPhone().slice(1)}`, firstName: 'Cov', lastName: 'Erage', consentAt: new Date() } });
      tokens.patient = await sessionFor(app, patient.id);
      const order = { pharmacyId: p.id, items: [{ productId: paracetamol, quantity: 1 }], deliveryAddress: '1 Test Street, Yaba' };
      const refused = await http().post('/v1/orders').set(as('patient')).send({ ...order, deliveryArea: 'yaba' }).expect(422);
      expect(refused.body.message).toMatch(/doesn’t deliver to/);
      await http().post('/v1/orders').set(as('patient')).send({ ...order, deliveryArea: 'ikeja' }).expect(201);
    });

    it('lists the team with masked numbers', async () => {
      const team = await http().get('/v1/pharmacy/team').set(as('portalStaff')).expect(200);
      expect(team.body).toHaveLength(2);
      expect(team.body.every((m: { phone: string }) => m.phone.includes('•••'))).toBe(true);
    });

    it('shows only this pharmacy’s activity', async () => {
      const mine = await http().get('/v1/pharmacy/activity?limit=50').set(as('portalStaff')).expect(200);
      const texts = mine.body.map((e: { text: string }) => e.text);
      expect(texts).toContain('Changed pharmacy settings');
      expect(texts).toContain('Pilbridge verified the pharmacy');
      expect(texts.some((t: string) => t.startsWith('Received batch TB-'))).toBe(true);
      // Nothing from the seeded pharmacies' staff.
      const seeded = await prisma.user.findUniqueOrThrow({ where: { phone: '+2348030000002' } });
      const ids = new Set(mine.body.map((e: { id: string }) => e.id));
      const theirs = await prisma.auditLog.findMany({ where: { actorId: seeded.id }, select: { id: true }, take: 50 });
      expect(theirs.some((e) => ids.has(e.id))).toBe(false);
      await http().get('/v1/pharmacy/activity?limit=500').set(as('portalStaff')).expect(400);
    });

    it('marks notifications read', async () => {
      const before = await http().get('/v1/pharmacy/notifications').set(as('portalStaff')).expect(200);
      expect(before.body.items.some((n: { kind: string }) => n.kind === 'order')).toBe(false); // the order above isn't paid
      await http().post('/v1/pharmacy/notifications/read').set(as('portalStaff')).expect(200);
      const after = await http().get('/v1/pharmacy/notifications').set(as('portalStaff')).expect(200);
      expect(after.body.unread).toBe(0);
    });
  });
});
