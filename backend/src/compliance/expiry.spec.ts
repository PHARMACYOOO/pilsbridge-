import { dueReminder, expiryState } from './expiry.js';

const now = new Date('2026-10-23T09:00:00Z');
const inDays = (d: number) => new Date(now.getTime() + d * 24 * 60 * 60_000);

describe('dueReminder', () => {
  it('sends 60, 30 and 7 days before, each once', () => {
    expect(dueReminder(inDays(90), null, now)).toBeNull();
    expect(dueReminder(inDays(60), null, now)).toBe(60);
    expect(dueReminder(inDays(45), 60, now)).toBeNull();
    expect(dueReminder(inDays(30), 60, now)).toBe(30);
    expect(dueReminder(inDays(20), 30, now)).toBeNull();
    expect(dueReminder(inDays(7), 30, now)).toBe(7);
    expect(dueReminder(inDays(3), 7, now)).toBeNull();
  });

  it('skips straight to the closest reminder when earlier ones were missed', () => {
    expect(dueReminder(inDays(5), null, now)).toBe(7);
    expect(dueReminder(inDays(25), null, now)).toBe(30);
  });

  it('leaves expiry itself to the suspension check', () => {
    expect(dueReminder(inDays(0), null, now)).toBeNull();
    expect(dueReminder(inDays(-3), null, now)).toBeNull();
  });
});

describe('expiryState', () => {
  it('flags documents within 60 days, and expired ones', () => {
    expect(expiryState(null, now)).toBe('valid');
    expect(expiryState(inDays(200), now)).toBe('valid');
    expect(expiryState(inDays(59), now)).toBe('expiring');
    expect(expiryState(inDays(-1), now)).toBe('expired');
  });
});
