import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/setup.js';

const freshPhone = () => `0809${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;

describe('Separate sign up and sign in', () => {
  let app: INestApplication<App>;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  async function code(phone: string, intent: string) {
    const res = await http().post('/v1/auth/otp/request').send({ phone, intent }).expect(200);
    return res.body.devCode as string;
  }

  it('creates a complete account in one step when signing up', async () => {
    const phone = freshPhone();
    const devCode = await code(phone, 'signup');
    const res = await http()
      .post('/v1/auth/otp/verify')
      .send({ phone, code: devCode, intent: 'signup', firstName: 'Kemi', lastName: 'Bello', consent: true })
      .expect(200);
    expect(res.body.isNewUser).toBe(true);
    expect(res.body.user).toMatchObject({ firstName: 'Kemi', lastName: 'Bello', profileComplete: true });
  });

  it('requires a name and consent to sign up', async () => {
    const phone = freshPhone();
    const devCode = await code(phone, 'signup');
    await http().post('/v1/auth/otp/verify').send({ phone, code: devCode, intent: 'signup', firstName: 'Kemi', lastName: 'Bello' }).expect(400);
    await http().post('/v1/auth/otp/verify').send({ phone, code: devCode, intent: 'signup', consent: true }).expect(400);
  });

  it('won’t sign up a number that already has an account', async () => {
    const phone = freshPhone();
    const devCode = await code(phone, 'signup');
    await http().post('/v1/auth/otp/verify').send({ phone, code: devCode, intent: 'signup', firstName: 'A', lastName: 'B', consent: true }).expect(200);
    const res = await http().post('/v1/auth/otp/request').send({ phone, intent: 'signup' }).expect(409);
    expect(res.body.message).toMatch(/sign in instead/);
  });

  it('won’t sign in a number with no account — and sends no code', async () => {
    const res = await http().post('/v1/auth/otp/request').send({ phone: freshPhone(), intent: 'signin' }).expect(404);
    expect(res.body.message).toMatch(/create one/);
    expect(res.body.devCode).toBeUndefined();
  });

  it('signs in an existing account', async () => {
    const phone = freshPhone();
    const signupCode = await code(phone, 'signup');
    await http().post('/v1/auth/otp/verify').send({ phone, code: signupCode, intent: 'signup', firstName: 'Tolu', lastName: 'A', consent: true }).expect(200);
    const signinCode = await code(phone, 'signin');
    const res = await http().post('/v1/auth/otp/verify').send({ phone, code: signinCode, intent: 'signin' }).expect(200);
    expect(res.body.isNewUser).toBe(false);
    expect(res.body.user.firstName).toBe('Tolu');
  });

  it('keeps the quick combined flow for checkout', async () => {
    const phone = freshPhone();
    const devCode = await code(phone, 'auto');
    const res = await http().post('/v1/auth/otp/verify').send({ phone, code: devCode }).expect(200);
    expect(res.body).toMatchObject({ isNewUser: true, user: { profileComplete: false } });
  });
});
