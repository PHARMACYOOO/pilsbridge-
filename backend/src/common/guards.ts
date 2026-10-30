import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { Role } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser, JwtPayload } from './auth-user.js';
import { IS_PUBLIC, ROLES } from './decorators.js';
import { parseMfaRoles } from './env.js';

/**
 * Global guard: every route needs a valid bearer token unless marked @Public(). The token must name
 * a live session (not signed out, not expired) of an account that isn't disabled; admins and
 * pharmacists also need a session that passed the second factor. The user is re-read with the
 * session, so role changes, pharmacy reassignments and sign-outs apply immediately.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly mfaRoles: Role[];

  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.mfaRoles = parseMfaRoles(config.get('MFA_REQUIRED_ROLES'));
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const [scheme, token] = req.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Sign in to continue');

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Your session has expired — please sign in again');
    }

    // MFA challenge tokens (and tokens from before sessions existed) have no session: not accepted here.
    if (typeof payload.sub !== 'string' || !payload.sub || typeof payload.sid !== 'string' || payload.purpose) throw new UnauthorizedException('Sign in to continue');
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      select: { id: true, userId: true, mfa: true, createdAt: true, expiresAt: true, revokedAt: true, user: { select: { id: true, role: true, pharmacyId: true, disabledAt: true } } },
    });
    if (!session || session.userId !== payload.sub || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('You’ve been signed out — please sign in again');
    }
    const { user } = session;
    if (user.disabledAt) throw new UnauthorizedException('This account has been disabled — contact Pilbridge support');
    if (this.mfaRoles.includes(user.role) && !session.mfa) throw new UnauthorizedException('Sign in again and confirm with your authenticator app');
    req.user = { id: user.id, role: user.role, pharmacyId: user.pharmacyId, sessionId: session.id, sessionCreatedAt: session.createdAt, mfa: session.mfa };
    return true;
  }
}

/** Global guard: enforces @Roles(). Pharmacy roles must also belong to a pharmacy. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, [ctx.getHandler(), ctx.getClass()]);
    if (!roles?.length) return true;

    const user = ctx.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user || !roles.includes(user.role)) throw new ForbiddenException('You don’t have access to this');
    const pharmacyRole = user.role === Role.PHARMACIST || user.role === Role.PHARMACY_STAFF;
    if (pharmacyRole && !user.pharmacyId) throw new ForbiddenException('Your account isn’t linked to a pharmacy');
    return true;
  }
}
