import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type CryptoKey } from 'jose';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { SocialVerifier } from '../src/auth/social-verifier.service.js';
import { configureApp } from '../src/setup.js';

const GOOGLE_AUD = 'test-google-client.apps.googleusercontent.com';
const APPLE_AUD = 'ng.pilbridge.test';
const freshPhone = () => `0809${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
const freshSub = () => `sub-${Math.random().toString(36).slice(2)}`;

describe('Social sign-in (Google / Apple)', () => {
  let app: INestApplication<App>;
  let http: () => ReturnType<typeof request>;
  let key: CryptoKey;
  let strangerKey: CryptoKey;

  /** Sign an ID token the way Google or Apple would, with our test key. */
  async function idToken(claims: Record<string, unknown>, opts: { iss?: string; aud?: string; exp?: string; signWith?: CryptoKey } = {}) {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(opts.iss ?? 'https://accounts.google.com')
      .setAudience(opts.aud ?? GOOGLE_AUD)
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? '10m')
      .sign(opts.signWith ?? key);
  }

  /** Request a code and verify it, asserting the response status. */
  async function phoneVerify(phone: string, status = 200) {
    const { body } = await http().post('/v1/auth/otp/request').send({ phone }).expect(200);
    return http().post('/v1/auth/otp/verify').send({ phone, code: body.devCode }).expect(status);
  }

  /** Add a phone to the signed-in account, asserting the response status. */
  async function addPhone(accessToken: string, phone: string, status = 200) {
    const { body } = await http().post('/v1/auth/otp/request').send({ phone }).expect(200);
    return http().post('/v1/me/phone').set({ Authorization: `Bearer ${accessToken}` }).send({ phone, code: body.devCode }).expect(status);
  }

  const social = (token: string, provider = 'GOOGLE') => http().post('/v1/auth/social').send({ provider, idToken: token });

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256');
    key = pair.privateKey;
    strangerKey = (await generateKeyPair('RS256')).privateKey;
    const jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'test-key', alg: 'RS256' }] });
    const verifier = new SocialVerifier(new ConfigService({ GOOGLE_CLIENT_ID: GOOGLE_AUD, APPLE_CLIENT_ID: APPLE_AUD }), { GOOGLE: jwks, APPLE: jwks });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(SocialVerifier).useValue(verifier).compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    http = () => request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  it('creates an account without a phone the first time, then signs straight in', async () => {
    const sub = freshSub();
    const email = `${sub}@gmail.com`;
    const token = await idToken({ sub, email, email_verified: true, given_name: 'Ada', family_name: 'Obi' });

    const first = await social(token).expect(200);
    expect(first.body).toMatchObject({ status: 'signed_in', isNewUser: true });
    expect(first.body.user).toMatchObject({ phone: null, email, firstName: 'Ada', lastName: 'Obi', linkedAccounts: ['GOOGLE'], profileComplete: false });

    const again = await social(await idToken({ sub, email, email_verified: true })).expect(200);
    expect(again.body).toMatchObject({ status: 'signed_in', isNewUser: false });
    const me = await http().get('/v1/me').set({ Authorization: `Bearer ${again.body.accessToken}` }).expect(200);
    expect(me.body.id).toBe(first.body.user.id);
  });

  it('creates one account when the first sign-in arrives twice at once', async () => {
    const sub = freshSub();
    const [a, b] = await Promise.all([social(await idToken({ sub })), social(await idToken({ sub }))]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.user.id).toBe(b.body.user.id);
  });

  it('adds a phone number to a Google account', async () => {
    const { body } = await social(await idToken({ sub: freshSub() })).expect(200);
    const phone = freshPhone();
    const added = await addPhone(body.accessToken, phone);
    expect(added.body.user.id).toBe(body.user.id);
    expect(added.body.user.phone).toBe(`+234${phone.slice(1)}`);

    // The number now signs in to the same account.
    expect((await phoneVerify(phone)).body.user.id).toBe(body.user.id);
  });

  it('joins an existing phone account when its number is added to a new Google account', async () => {
    const phone = freshPhone();
    const original = (await phoneVerify(phone)).body.user;
    const sub = freshSub();
    const email = `${sub}@gmail.com`;

    const { body } = await social(await idToken({ sub, email, email_verified: true, given_name: 'Ada', family_name: 'Obi' })).expect(200);
    const joined = await addPhone(body.accessToken, phone);
    expect(joined.body.user).toMatchObject({ id: original.id, email, firstName: 'Ada', linkedAccounts: ['GOOGLE'] });

    // Google now signs in to the phone account.
    const again = await social(await idToken({ sub })).expect(200);
    expect(again.body.user.id).toBe(original.id);
  });

  it('won’t take a number that belongs to another account when this one already has a phone', async () => {
    const taken = freshPhone();
    await phoneVerify(taken);
    const { body } = await social(await idToken({ sub: freshSub() })).expect(200);
    // Adding a number signs out the old session; carry on with the new one.
    const added = await addPhone(body.accessToken, freshPhone());
    await addPhone(body.accessToken, taken, 401);
    await addPhone(added.body.accessToken, taken, 409);
  });

  it('never joins a phone account by email alone', async () => {
    const phone = freshPhone();
    const sub = freshSub();
    const email = `${sub}@gmail.com`;
    const { body: v } = await http().post('/v1/auth/otp/request').send({ phone, intent: 'signup' }).expect(200);
    const original = (
      await http().post('/v1/auth/otp/verify').send({ phone, code: v.devCode, intent: 'signup', firstName: 'K', lastName: 'B', email, consent: true }).expect(200)
    ).body.user;

    const { body } = await social(await idToken({ sub, email, email_verified: true })).expect(200);
    expect(body.user.id).not.toBe(original.id);
    expect(body.user.email).toBeNull();
  });

  it('requires a valid code to add a phone', async () => {
    const { body } = await social(await idToken({ sub: freshSub() })).expect(200);
    const phone = freshPhone();
    await http().post('/v1/auth/otp/request').send({ phone }).expect(200);
    await http().post('/v1/me/phone').set({ Authorization: `Bearer ${body.accessToken}` }).send({ phone, code: '000000' }).expect(401);
    await http().post('/v1/me/phone').send({ phone, code: '000000' }).expect(401);
  });

  it('rejects tokens with the wrong audience, issuer, signature or expiry', async () => {
    const sub = freshSub();
    for (const opts of [{ aud: 'someone-elses-app' }, { iss: 'https://evil.example' }, { signWith: strangerKey }, { exp: '-1m' }]) {
      await http().post('/v1/auth/social').send({ provider: 'GOOGLE', idToken: await idToken({ sub }, opts) }).expect(401);
    }
  });

  it('ignores unverified emails', async () => {
    const { body } = await social(await idToken({ sub: freshSub(), email: 'victim@example.com', email_verified: false })).expect(200);
    expect(body.user.email).toBeNull();
  });

  it('supports Apple, whose email_verified claim is a string', async () => {
    const sub = freshSub();
    const token = await idToken({ sub, email: `${sub}@privaterelay.appleid.com`, email_verified: 'true' }, { iss: 'https://appleid.apple.com', aud: APPLE_AUD });
    const { body } = await social(token, 'APPLE').expect(200);
    expect(body.user).toMatchObject({ email: `${sub}@privaterelay.appleid.com`, linkedAccounts: ['APPLE'] });

    // A Google token can't be passed off as Apple.
    await social(await idToken({ sub }), 'APPLE').expect(401);
  });

  it('signs a demo account straight in after the first time, without a phone (development only)', async () => {
    const email = `${freshSub()}@gmail.com`;
    const first = await http().post('/v1/auth/social/demo').send({ provider: 'GOOGLE', email, firstName: 'Ada', lastName: 'Obi' }).expect(200);
    expect(first.body).toMatchObject({ status: 'signed_in', isNewUser: true, user: { phone: null, email, firstName: 'Ada' } });
    const again = await http().post('/v1/auth/social/demo').send({ provider: 'GOOGLE', email }).expect(200);
    expect(again.body).toMatchObject({ isNewUser: false, user: { id: first.body.user.id } });
  });

  it('takes Apple’s name from beside the token, but never over the token’s own', async () => {
    const apple = await idToken({ sub: freshSub() }, { iss: 'https://appleid.apple.com', aud: APPLE_AUD });
    const { body } = await http().post('/v1/auth/social').send({ provider: 'APPLE', idToken: apple, firstName: 'Ada', lastName: 'Obi' }).expect(200);
    expect(body.user).toMatchObject({ firstName: 'Ada', lastName: 'Obi' });

    const google = await idToken({ sub: freshSub(), given_name: 'Real', family_name: 'Name' });
    const res = await http().post('/v1/auth/social').send({ provider: 'GOOGLE', idToken: google, firstName: 'Fake' }).expect(200);
    expect(res.body.user).toMatchObject({ firstName: 'Real', lastName: 'Name' });
  });
});
