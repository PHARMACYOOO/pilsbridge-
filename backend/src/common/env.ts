import { Role } from '../generated/prisma/client.js';

/**
 * Development conveniences are only on when the environment says so explicitly. Anything else —
 * including NODE_ENV not being set at all — is treated as production, so a missing setting fails
 * closed instead of opening sign-in shortcuts on a live server.
 */
export const isLocalEnv = (nodeEnv: unknown) => nodeEnv === 'development' || nodeEnv === 'test';

/** "12h", "7d", "30m", "900s" → seconds, or null. */
export function parseDuration(value: unknown): number | null {
  const m = typeof value === 'string' ? /^(\d+)\s*(s|m|h|d)$/.exec(value.trim()) : null;
  if (!m) return null;
  const n = Number(m[1]) * { s: 1, m: 60, h: 3600, d: 86_400 }[m[2] as 's' | 'm' | 'h' | 'd'];
  return n > 0 ? n : null;
}

/** Roles that must pass an authenticator-app check at sign-in (MFA_REQUIRED_ROLES, comma-separated). */
export function parseMfaRoles(value: unknown): Role[] {
  const raw = typeof value === 'string' ? value : 'PLATFORM_ADMIN,PHARMACIST';
  return raw
    .split(',')
    .map((r) => r.trim())
    .filter((r): r is Role => (Object.values(Role) as string[]).includes(r));
}

/** Staff and admin sessions are kept short; patients and riders stay signed in longer. */
export const SHORT_SESSION_ROLES: Role[] = [Role.PLATFORM_ADMIN, Role.PHARMACIST, Role.PHARMACY_STAFF];
