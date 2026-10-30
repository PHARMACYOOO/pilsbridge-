import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { JwtPayload } from '../common/auth-user.js';
import type { ClientInfo } from '../common/decorators.js';
import { parseDuration, SHORT_SESSION_ROLES } from '../common/env.js';
import type { Role } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Signed-in devices. Each access token carries its session id, and JwtAuthGuard checks the
 * session on every request, so signing out (here, everywhere, or by an admin) takes effect at once.
 * Staff and admin sessions are short (STAFF_SESSION_TTL, default 12h); others last JWT_TTL (7d).
 */
@Injectable()
export class SessionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  ttlSeconds(role: Role) {
    return SHORT_SESSION_ROLES.includes(role)
      ? (parseDuration(this.config.get('STAFF_SESSION_TTL')) ?? 12 * 3600)
      : (parseDuration(this.config.get('JWT_TTL')) ?? 7 * 86_400);
  }

  async create(user: { id: string; role: Role }, opts: { mfa: boolean; client?: ClientInfo }) {
    const ttl = this.ttlSeconds(user.role);
    const expiresAt = new Date(Date.now() + ttl * 1000);
    const s = await this.prisma.session.create({
      data: { userId: user.id, mfa: opts.mfa, expiresAt, ip: opts.client?.ip?.slice(0, 64) ?? null, userAgent: opts.client?.userAgent ?? null },
    });
    const accessToken = await this.jwt.signAsync({ sub: user.id, sid: s.id } satisfies JwtPayload, { expiresIn: ttl });
    return { accessToken, sessionId: s.id, expiresAt };
  }

  async revoke(sessionId: string, reason: string) {
    await this.prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: reason } });
  }

  /** Sign a user out everywhere (optionally keeping one session). Returns how many were ended. */
  async revokeAll(userId: string, reason: string, keep?: string) {
    const r = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null, ...(keep ? { id: { not: keep } } : {}) },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
    return r.count;
  }

  /** Live sessions, newest first, marking the caller's own. */
  async list(userId: string, current?: string) {
    const rows = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, createdAt: true, expiresAt: true, userAgent: true, ip: true, mfa: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows.map((r) => ({ ...r, current: r.id === current }));
  }
}
