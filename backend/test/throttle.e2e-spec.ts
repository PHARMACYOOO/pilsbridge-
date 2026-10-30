import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';

// This file runs with rate limiting ON (other e2e files switch it off). Set before the app module loads.
process.env.THROTTLE_DISABLED = 'false';

const freshPhone = () => `0809${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;

describe('Sign-in rate limits', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const { AppModule } = await import('../src/app.module.js');
    const { configureApp } = await import('../src/setup.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('limits codes per phone number without blocking others on the same IP', async () => {
    const http = () => request(app.getHttpServer());
    const target = freshPhone();
    for (let i = 0; i < 3; i++) await http().post('/v1/auth/otp/request').send({ phone: target }).expect(200);
    await http().post('/v1/auth/otp/request').send({ phone: target }).expect(429);
    // The same number written differently is still the same number.
    await http().post('/v1/auth/otp/request').send({ phone: target.replace(/^0/, '+234') }).expect(429);

    // Neighbours behind the same carrier IP can still sign in.
    for (let i = 0; i < 5; i++) await http().post('/v1/auth/otp/request').send({ phone: freshPhone() }).expect(200);
  });
});
