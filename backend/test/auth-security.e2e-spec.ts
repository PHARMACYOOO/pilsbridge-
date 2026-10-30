import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { base32Decode, hotp, stepAt } from '../src/auth/totp.js';
import { runRecovery } from '../src/cli/admin-recovery.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { configureApp } from '../src/setup.js';
import { SmsService } from '../src/sms/sms.service.js';
import { sessionFor } from './sessions.js';

const freshPhone = () =>
  `0817${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
const e164 = (local: string) => `+234${local.slice(1)}`;
/** The authenticator app's code for a step (default: now). */
const totp = (secret: string, step = stepAt(Date.now())) =>
  hotp(base32Decode(secret), step);

/** Sessions and sign-out, disabled accounts, the authenticator second factor, and phone number changes. */
describe('Auth security', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const texts: { phone: string; text: string }[] = [];
  let admin: string;
  let oakfield: string;

  async function code(phone: string, intent = 'auto') {
    return (
      await http()
        .post('/v1/auth/otp/request')
        .send({ phone, intent })
        .expect(200)
    ).body.devCode as string;
  }
  // Each code is fetched before the next request starts: supertest closes its server after each request.
  async function signUp(phone = freshPhone()) {
    const c = await code(phone, 'signup');
    const res = await http()
      .post('/v1/auth/otp/verify')
      .send({
        phone,
        code: c,
        intent: 'signup',
        firstName: 'Sec',
        lastName: 'Test',
        consent: true,
      })
      .expect(200);
    return {
      phone,
      token: res.body.accessToken as string,
      id: res.body.user.id as string,
    };
  }
  async function signIn(phone: string) {
    const c = await code(phone, 'signin');
    return (
      await http()
        .post('/v1/auth/otp/verify')
        .send({ phone, code: c, intent: 'signin' })
        .expect(200)
    ).body;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
    prisma = app.get(PrismaService);
    admin = await sessionFor(
      app,
      (
        await prisma.user.findUniqueOrThrow({
          where: { phone: '+2348030000009' },
        })
      ).id,
    );
    oakfield = (
      await prisma.pharmacy.findUniqueOrThrow({
        where: { slug: 'oakfield-ikeja' },
      })
    ).id;
    vi.spyOn(app.get(SmsService), 'sendText').mockImplementation(
      async (phone: string, text: string) => {
        texts.push({ phone, text });
      },
    );
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('sessions', () => {
    it('signs out this device, then every device', async () => {
      const { phone, token } = await signUp();
      const second = (await signIn(phone)).accessToken as string;
      await http().get('/v1/me').set(bearer(token)).expect(200);

      const list = await http()
        .get('/v1/me/sessions')
        .set(bearer(second))
        .expect(200);
      expect(list.body).toHaveLength(2);
      expect(
        list.body.filter((s: { current: boolean }) => s.current),
      ).toHaveLength(1);

      await http().post('/v1/auth/logout').set(bearer(token)).expect(204);
      await http().get('/v1/me').set(bearer(token)).expect(401);
      await http().get('/v1/me').set(bearer(second)).expect(200);

      const third = (await signIn(phone)).accessToken as string;
      const all = await http()
        .post('/v1/auth/logout-all')
        .set(bearer(third))
        .expect(200);
      expect(all.body.signedOut).toBe(2);
      await http().get('/v1/me').set(bearer(second)).expect(401);
      await http().get('/v1/me').set(bearer(third)).expect(401);
    });

    it('ends another device’s session from this one', async () => {
      const { phone, token } = await signUp();
      const other = (await signIn(phone)).accessToken as string;
      const list = await http()
        .get('/v1/me/sessions')
        .set(bearer(token))
        .expect(200);
      const otherId = list.body.find(
        (s: { current: boolean }) => !s.current,
      ).id;
      await http()
        .delete(`/v1/me/sessions/${otherId}`)
        .set(bearer(token))
        .expect(200);
      await http().get('/v1/me').set(bearer(other)).expect(401);
      await http()
        .delete(`/v1/me/sessions/${otherId}x`)
        .set(bearer(token))
        .expect(404);
    });

    it('refuses tokens without a session, and MFA challenge tokens', async () => {
      const { id } = await signUp();
      const jwt = app.get(JwtService);
      for (const payload of [
        { sub: id },
        { sub: id, purpose: 'mfa' },
        { sub: id, sid: 'not-a-session' },
      ]) {
        const t = await jwt.signAsync(payload);
        await http().get('/v1/me').set(bearer(t)).expect(401);
      }
    });

    it('expires a session on the server even if the token is still valid', async () => {
      const { token } = await signUp();
      const sid = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64url').toString(),
      ).sid as string;
      await prisma.session.update({
        where: { id: sid },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await http().get('/v1/me').set(bearer(token)).expect(401);
    });
  });

  describe('disabled accounts', () => {
    it('ends every session and refuses sign-in until re-enabled', async () => {
      const { phone, token, id } = await signUp();
      await http()
        .post(`/v1/admin/users/${id}/disable`)
        .set(bearer(token))
        .send({ reason: 'Not an admin' })
        .expect(403);
      const disabled = await http()
        .post(`/v1/admin/users/${id}/disable`)
        .set(bearer(admin))
        .send({ reason: 'Fraud report under review' })
        .expect(200);
      expect(disabled.body).toMatchObject({
        disabledReason: 'Fraud report under review',
        activeSessions: 0,
      });

      await http().get('/v1/me').set(bearer(token)).expect(401);
      await http()
        .post('/v1/auth/otp/request')
        .send({ phone, intent: 'signin' })
        .expect(403);

      await http()
        .post(`/v1/admin/users/${id}/enable`)
        .set(bearer(admin))
        .expect(200);
      expect((await signIn(phone)).status).toBe('signed_in');
    });

    it('takes a disabled rider offline, so no jobs are offered to them', async () => {
      const rider = await prisma.user.create({
        data: { phone: e164(freshPhone()), firstName: 'Off', lastName: 'Line', role: 'RIDER', riderProfile: { create: { partner: 'Test Couriers', area: 'yaba', onlineSince: new Date() } } },
      });
      await http().post(`/v1/admin/users/${rider.id}/disable`).set(bearer(admin)).send({ reason: 'Left the partner company' }).expect(200);
      expect(await prisma.riderProfile.findUniqueOrThrow({ where: { userId: rider.id } })).toMatchObject({ onlineSince: null, area: null });
    });

    it('won’t let admins act on their own account', async () => {
      const me = (
        await prisma.user.findUniqueOrThrow({
          where: { phone: '+2348030000009' },
        })
      ).id;
      await http()
        .post(`/v1/admin/users/${me}/disable`)
        .set(bearer(admin))
        .send({ reason: 'Testing myself' })
        .expect(403);
      await http()
        .post(`/v1/admin/users/${me}/mfa/reset`)
        .set(bearer(admin))
        .send({ reason: 'Testing myself' })
        .expect(403);
    });

    it('finds accounts by phone or name', async () => {
      const { phone } = await signUp();
      const found = await http()
        .get(`/v1/admin/users?q=${encodeURIComponent(phone)}`)
        .set(bearer(admin))
        .expect(200);
      expect(found.body).toHaveLength(1);
      expect(found.body[0]).toMatchObject({
        phone: e164(phone),
        role: 'PATIENT',
        mfaRequired: false,
        activeSessions: 1,
      });
    });
  });

  describe('authenticator second factor', () => {
    let phone: string;
    let userId: string;
    let secret: string;
    let recovery: string[];

    beforeAll(async () => {
      phone = freshPhone();
      userId = (
        await prisma.user.create({
          data: {
            phone: e164(phone),
            firstName: 'Mfa',
            lastName: 'Pharmacist',
            role: 'PHARMACIST',
            pharmacyId: oakfield,
            consentAt: new Date(),
          },
        })
      ).id;
    });

    it('sets up the authenticator at the first sign-in, before any session exists', async () => {
      const first = await signIn(phone);
      expect(first).toMatchObject({ status: 'mfa_setup_required' });
      expect(first.accessToken).toBeUndefined();
      await http().get('/v1/me').set(bearer(first.mfaToken)).expect(401);

      const setup = await http()
        .post('/v1/auth/mfa/setup')
        .send({ mfaToken: first.mfaToken })
        .expect(200);
      secret = setup.body.secret;
      expect(setup.body.otpauthUrl).toContain(`secret=${secret}`);
      const stored = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
      });
      expect(stored.totpSecret).toMatch(/^v1:/); // encrypted
      expect(stored.totpSecret).not.toContain(secret);

      await http()
        .post('/v1/auth/mfa/verify')
        .send({
          mfaToken: first.mfaToken,
          code: '000000' === totp(secret) ? '111111' : '000000',
        })
        .expect(401);
      const done = await http()
        .post('/v1/auth/mfa/verify')
        .send({ mfaToken: first.mfaToken, code: totp(secret) })
        .expect(200);
      expect(done.body.status).toBe('signed_in');
      recovery = done.body.recoveryCodes;
      expect(recovery).toHaveLength(10);
      await http()
        .get('/v1/pharmacy/orders')
        .set(bearer(done.body.accessToken))
        .expect(200);
    });

    it('won’t accept the same code twice', async () => {
      const again = await signIn(phone);
      expect(again.status).toBe('mfa_required');
      await http()
        .post('/v1/auth/mfa/verify')
        .send({ mfaToken: again.mfaToken, code: totp(secret) })
        .expect(401);
    });

    it('accepts each recovery code once, and texts the owner', async () => {
      const a = await signIn(phone);
      await http()
        .post('/v1/auth/mfa/verify')
        .send({ mfaToken: a.mfaToken, code: recovery[0].toUpperCase() })
        .expect(200);
      const b = await signIn(phone);
      await http()
        .post('/v1/auth/mfa/verify')
        .send({ mfaToken: b.mfaToken, code: recovery[0] })
        .expect(401);
      await new Promise((r) => setTimeout(r, 50));
      expect(
        texts.some(
          (t) =>
            t.phone === e164(phone) &&
            /recovery code was just used/.test(t.text),
        ),
      ).toBe(true);
    });

    it('locks the second step after five wrong codes', async () => {
      await prisma.user.update({
        where: { id: userId },
        data: { mfaFailures: 0 },
      }); // earlier tests' misses count too
      const c = await signIn(phone);
      const wrong = totp(secret, stepAt(Date.now()) + 5);
      for (let i = 0; i < 4; i++)
        await http()
          .post('/v1/auth/mfa/verify')
          .send({ mfaToken: c.mfaToken, code: wrong })
          .expect(401);
      await http()
        .post('/v1/auth/mfa/verify')
        .send({ mfaToken: c.mfaToken, code: wrong })
        .expect(401);
      await http()
        .post('/v1/auth/mfa/verify')
        .send({ mfaToken: c.mfaToken, code: recovery[1] })
        .expect(429);
      await prisma.user.update({
        where: { id: userId },
        data: { mfaLockedUntil: null },
      });
    });

    it('refuses a pharmacist session that skipped the second factor', async () => {
      const noMfa = await sessionFor(app, userId, { mfa: false });
      await http().get('/v1/pharmacy/orders').set(bearer(noMfa)).expect(401);
    });

    it('an admin reset signs them out and makes them set it up again', async () => {
      const live = await sessionFor(app, userId);
      await http()
        .post(`/v1/admin/users/${userId}/mfa/reset`)
        .set(bearer(admin))
        .send({ reason: 'Lost phone, confirmed by call' })
        .expect(200);
      await http().get('/v1/pharmacy/orders').set(bearer(live)).expect(401);
      await prisma.otpChallenge.deleteMany({ where: { phone: e164(phone) } }); // this number has used its 5 codes an hour
      expect((await signIn(phone)).status).toBe('mfa_setup_required');
      expect(await prisma.mfaRecoveryCode.count({ where: { userId } })).toBe(0);
    });

    it('also guards Google/Apple-style sign-ins (demo) for admins — no session without the second factor', async () => {
      const email = `mfa-${Date.now()}@example.com`;
      const res = await http()
        .post('/v1/auth/social/demo')
        .send({ provider: 'GOOGLE', email })
        .expect(200);
      expect(res.body.status).toBe('signed_in'); // a new account is a patient
      const id = res.body.user.id as string;
      await prisma.user.update({
        where: { id },
        data: { role: 'PLATFORM_ADMIN' },
      });
      const again = await http()
        .post('/v1/auth/social/demo')
        .send({ provider: 'GOOGLE', email })
        .expect(200);
      expect(again.body).toMatchObject({ status: 'mfa_setup_required' });
      expect(again.body.accessToken).toBeUndefined();
      await prisma.user.update({ where: { id }, data: { role: 'PATIENT' } });
    });
  });

  describe('phone number changes', () => {
    it('needs a recent sign-in, texts the old number and signs out other sessions', async () => {
      const { phone, token } = await signUp();
      const other = (await signIn(phone)).accessToken as string;
      const sid = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64url').toString(),
      ).sid as string;
      const next = freshPhone();

      await prisma.session.update({
        where: { id: sid },
        data: { createdAt: new Date(Date.now() - 11 * 60_000) },
      });
      let c = await code(next);
      await http()
        .post('/v1/me/phone')
        .set(bearer(token))
        .send({ phone: next, code: c })
        .expect(403);
      await prisma.session.update({
        where: { id: sid },
        data: { createdAt: new Date() },
      });

      c = await code(next);
      const changed = await http()
        .post('/v1/me/phone')
        .set(bearer(token))
        .send({ phone: next, code: c })
        .expect(200);
      expect(changed.body.user.phone).toBe(e164(next));
      await http().get('/v1/me').set(bearer(other)).expect(401);
      await http().get('/v1/me').set(bearer(token)).expect(401);
      await http()
        .get('/v1/me')
        .set(bearer(changed.body.accessToken))
        .expect(200);
      await new Promise((r) => setTimeout(r, 50));
      expect(
        texts.some(
          (t) => t.phone === e164(phone) && /number was changed/.test(t.text),
        ),
      ).toBe(true);
    });

    it('won’t let staff change their own sign-in number — an admin does it', async () => {
      const staff = await prisma.user.create({
        data: {
          phone: e164(freshPhone()),
          firstName: 'Counter',
          lastName: 'Staff',
          role: 'PHARMACY_STAFF',
          pharmacyId: oakfield,
        },
      });
      const token = await sessionFor(app, staff.id);
      const next = freshPhone();
      const c = await code(next);
      await http()
        .post('/v1/me/phone')
        .set(bearer(token))
        .send({ phone: next, code: c })
        .expect(403);

      const changed = await http()
        .put(`/v1/admin/users/${staff.id}/phone`)
        .set(bearer(admin))
        .send({ phone: next, reason: 'New work SIM, confirmed by call' })
        .expect(200);
      expect(changed.body).toMatchObject({
        phone: e164(next),
        activeSessions: 0,
      });
      await http().get('/v1/pharmacy/orders').set(bearer(token)).expect(401);
      await new Promise((r) => setTimeout(r, 50));
      expect(
        texts.some(
          (t) =>
            t.phone === staff.phone &&
            /changed your sign-in number/.test(t.text),
        ),
      ).toBe(true);
      expect(
        texts.some(
          (t) =>
            t.phone === e164(next) &&
            /now your Pilbridge sign-in number/.test(t.text),
        ),
      ).toBe(true);
    });

    it('leaves patients’ numbers to the patients', async () => {
      const { id } = await signUp();
      await http()
        .put(`/v1/admin/users/${id}/phone`)
        .set(bearer(admin))
        .send({ phone: freshPhone(), reason: 'Should not be allowed' })
        .expect(403);
    });
  });

  describe('break-glass admin recovery (server console)', () => {
    const run = async (args: Parameters<typeof runRecovery>[1], typed = '') => {
      const out: string[] = [];
      const code = await runRecovery(app, args, {
        print: (l) => out.push(l),
        confirm: async () => typed,
      });
      return { code, out: out.join('\n') };
    };

    it('clears a locked-out admin’s authenticator after confirmation, and audits who ran it', async () => {
      const phone = freshPhone();
      const lost = await prisma.user.create({
        data: {
          phone: e164(phone),
          firstName: 'Lost',
          lastName: 'Admin',
          role: 'PLATFORM_ADMIN',
          totpSecret: 'v1:x:y:z',
          totpEnabledAt: new Date(),
          disabledAt: new Date(),
          disabledReason: 'test',
        },
      });
      await prisma.mfaRecoveryCode.create({
        data: { userId: lost.id, codeHash: 'used-up' },
      });
      // Another admin who can still sign in with their authenticator.
      const helper = await prisma.user.create({
        data: {
          phone: e164(freshPhone()),
          firstName: 'Helper',
          lastName: 'Admin',
          role: 'PLATFORM_ADMIN',
          totpEnabledAt: new Date(),
        },
      });
      const live = await sessionFor(app, lost.id);
      try {
        // Needs a reason, the right number typed back, and --force while another admin could do it from the admin page.
        expect((await run({ phone, reason: 'short' })).code).toBe(2);
        const blocked = await run({
          phone,
          reason: 'Lost phone and codes; confirmed in person',
        });
        expect(blocked.code).toBe(1);
        expect(blocked.out).toMatch(/other admin\(s\) can sign in/);
        expect(
          (
            await run(
              {
                phone,
                reason: 'Lost phone and codes; confirmed in person',
                force: true,
              },
              '0800 000 0000',
            )
          ).code,
        ).toBe(1);
        expect(
          (await prisma.user.findUniqueOrThrow({ where: { id: lost.id } }))
            .totpEnabledAt,
        ).not.toBeNull();

        const done = await run(
          {
            phone,
            reason: 'Lost phone and codes; confirmed in person',
            force: true,
            enable: true,
          },
          phone,
        );
        expect(done.code).toBe(0);
        const after = await prisma.user.findUniqueOrThrow({
          where: { id: lost.id },
        });
        expect(after).toMatchObject({
          totpSecret: null,
          totpEnabledAt: null,
          disabledAt: null,
        });
        expect(
          await prisma.mfaRecoveryCode.count({ where: { userId: lost.id } }),
        ).toBe(0);
        expect(
          await prisma.session.count({
            where: { userId: lost.id, revokedAt: null },
          }),
        ).toBe(0);
        await http().get('/v1/me').set(bearer(live)).expect(401);

        const audit = await prisma.auditLog.findFirstOrThrow({
          where: { entityId: lost.id, action: 'auth.mfa_reset' },
          orderBy: { createdAt: 'desc' },
        });
        expect(audit.actorId).toBeNull();
        expect(audit.metadata).toMatchObject({
          via: 'server console',
          reason: 'Lost phone and codes; confirmed in person',
          operator: expect.stringContaining('@'),
        });
        expect((await signIn(phone)).status).toBe('mfa_setup_required');
      } finally {
        // Leave the seeded admin as the only one, even if this test fails: other suites count the admins they text.
        await prisma.user.updateMany({
          where: { id: { in: [lost.id, helper.id] } },
          data: { role: 'PATIENT' },
        });
      }
    });

    it('only recovers admins', async () => {
      const { phone } = await signUp();
      const res = await run({
        phone,
        reason: 'Not an admin account at all',
        force: true,
        yes: true,
      });
      expect(res.code).toBe(1);
      expect(res.out).toMatch(/No platform admin/);
    });
  });
});
