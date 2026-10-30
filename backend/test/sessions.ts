import type { INestApplication } from '@nestjs/common';
import { SessionsService } from '../src/auth/sessions.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * An access token for a user, as if they had signed in — with the second factor passed unless
 * `mfa: false`. Tests use this for seeded staff so they don't spend sign-in codes.
 */
export async function sessionFor(app: INestApplication, userId: string, opts: { mfa?: boolean } = {}) {
  const user = await app.get(PrismaService).user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, role: true } });
  return (await app.get(SessionsService).create(user, { mfa: opts.mfa ?? true })).accessToken;
}
