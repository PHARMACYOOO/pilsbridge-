import { normalisePhone } from '../auth/phone.js';

type Req = { ip?: string; ips?: string[]; body?: unknown };

/**
 * Rate-limit key for sign-in code endpoints: the phone number being signed in, so people who
 * share a mobile carrier's IP address don't block each other. Falls back to the client IP.
 */
export function phoneTracker(req: Req): string {
  const raw = (req.body as { phone?: unknown } | undefined)?.phone;
  const phone = typeof raw === 'string' ? normalisePhone(raw) : null;
  return phone ? `phone:${phone}` : `ip:${req.ips?.[0] ?? req.ip ?? 'unknown'}`;
}
