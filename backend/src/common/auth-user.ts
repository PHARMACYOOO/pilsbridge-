import type { Role } from '../generated/prisma/client.js';

/** The authenticated caller, attached to the request by JwtAuthGuard. */
export interface AuthUser {
  id: string;
  role: Role;
  pharmacyId: string | null;
  /** The session this request's token belongs to. */
  sessionId: string;
  /** When that session signed in — for actions that need a recent sign-in. */
  sessionCreatedAt: Date;
  /** The second factor was passed for this session. */
  mfa: boolean;
}

/** Access tokens name a user and a session; MFA challenge tokens carry `purpose: 'mfa'` and no session. */
export interface JwtPayload {
  sub: string;
  sid?: string;
  purpose?: 'mfa';
}
