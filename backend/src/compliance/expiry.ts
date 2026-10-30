import { EXPIRY_REMINDER_DAYS } from '../common/fees.js';

const DAY = 24 * 60 * 60_000;
const THRESHOLDS = [...EXPIRY_REMINDER_DAYS].sort((a, b) => a - b); // 7, 30, 60

export const daysLeft = (expiresAt: Date, now: Date) => Math.ceil((expiresAt.getTime() - now.getTime()) / DAY);

/**
 * The expiry reminder due now (60, 30 or 7 days before), or null. Each is sent once: `lastSent`
 * is the last threshold already sent, so a closer one is still due but the same or a further one
 * isn't. Already expired: null (expiry itself is handled separately).
 */
export function dueReminder(expiresAt: Date, lastSent: number | null, now: Date): number | null {
  const left = daysLeft(expiresAt, now);
  if (left <= 0) return null;
  const t = THRESHOLDS.find((d) => left <= d);
  if (t === undefined) return null;
  return lastSent !== null && lastSent <= t ? null : t;
}

export type ExpiryState = 'valid' | 'expiring' | 'expired';

export function expiryState(expiresAt: Date | null, now: Date): ExpiryState {
  if (!expiresAt) return 'valid';
  const left = daysLeft(expiresAt, now);
  return left <= 0 ? 'expired' : left <= THRESHOLDS[THRESHOLDS.length - 1] ? 'expiring' : 'valid';
}
