import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Role } from '../generated/prisma/client.js';
import type { AuthUser } from './auth-user.js';

export const IS_PUBLIC = 'isPublic';
export const ROLES = 'roles';

/** Skip authentication for this route. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Restrict a route to the given roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

/** Pharmacist or counter staff of a pharmacy. */
export const PharmacyStaff = () => Roles(Role.PHARMACIST, Role.PHARMACY_STAFF);

/** Where a request came from, recorded on the session it starts. */
export type ClientInfo = { ip?: string; userAgent?: string };

export const Client = createParamDecorator((_: unknown, ctx: ExecutionContext): ClientInfo => {
  const req = ctx.switchToHttp().getRequest<{ ip?: string; ips?: string[]; headers: Record<string, string | string[] | undefined> }>();
  const ua = req.headers['user-agent'];
  return { ip: req.ips?.[0] ?? req.ip, userAgent: typeof ua === 'string' ? ua.slice(0, 200) : undefined };
});

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  return ctx.switchToHttp().getRequest<{ user: AuthUser }>().user;
});
