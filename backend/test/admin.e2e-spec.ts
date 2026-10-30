import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { configureApp } from '../src/setup.js';
import { sessionFor } from './sessions.js';

const freshPhone = () => `0705${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;

describe('Admin: riders and pharmacy locations', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const tokens: Record<string, string> = {};
  const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
    for (const [who, phone] of [['admin', '+2348030000009'], ['staff', '+2348030000002']]) {
      tokens[who] = await sessionFor(app, (await prisma.user.findUniqueOrThrow({ where: { phone } })).id);
    }
  });

  afterAll(async () => {
    await app?.close();
  });

  it('is for platform admins only', async () => {
    await http().get('/v1/admin/riders').set(as('staff')).expect(403);
    await http().get('/v1/admin/riders').expect(401);
  });

  it('adds a partner’s rider, who can then go online — and pauses them', async () => {
    const phone = freshPhone();
    const created = await http()
      .post('/v1/admin/riders')
      .set(as('admin'))
      .send({ firstName: 'Ngozi', lastName: 'Eze', phone, partner: 'Metro Dispatch', coldChain: true })
      .expect(201);
    expect(created.body).toMatchObject({ firstName: 'Ngozi', partner: 'Metro Dispatch', coldChain: true, active: true, online: false });
    await http().post('/v1/admin/riders').set(as('admin')).send({ firstName: 'A', lastName: 'B', phone, partner: 'Metro Dispatch' }).expect(409);

    tokens.rider = await sessionFor(app, created.body.id);
    await http().put('/v1/rider/status').set(as('rider')).send({ online: true, area: 'yaba' }).expect(200);

    const paused = await http().patch(`/v1/admin/riders/${created.body.id}`).set(as('admin')).send({ active: false }).expect(200);
    expect(paused.body).toMatchObject({ active: false, online: false });
    await http().put('/v1/rider/status').set(as('rider')).send({ online: true, area: 'yaba' }).expect(403);

    await http().patch(`/v1/admin/riders/${created.body.id}`).set(as('admin')).send({ active: true }).expect(200);
    await http().put('/v1/rider/status').set(as('rider')).send({ online: false }).expect(200);
  });

  it('sets a pharmacy’s location, within Lagos', async () => {
    const list = await http().get('/v1/admin/pharmacies').set(as('admin')).expect(200);
    const unity = list.body.find((p: { name: string }) => p.name === 'Unity Pharmacy');
    await http().put(`/v1/admin/pharmacies/${unity.id}/location`).set(as('admin')).send({ lat: 9.06, lng: 7.49 }).expect(400); // Abuja
    const set = await http().put(`/v1/admin/pharmacies/${unity.id}/location`).set(as('admin')).send({ lat: unity.lat, lng: unity.lng }).expect(200);
    expect(set.body).toMatchObject({ lat: unity.lat, lng: unity.lng });
  });
});
