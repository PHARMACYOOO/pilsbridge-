import { isLocalEnv, parseDuration, parseMfaRoles } from './common/env.js';
import { validateEnv } from './config.js';

const base = { DATABASE_URL: 'postgresql://x', JWT_SECRET: 'x'.repeat(40) };
const production = {
  ...base,
  NODE_ENV: 'production',
  TERMII_API_KEY: 'k',
  FLW_PUBLIC_KEY: 'p',
  FLW_SECRET_KEY: 's',
  FLW_SECRET_HASH: 'h',
  MFA_ENCRYPTION_KEY: 'm'.repeat(40),
};

describe('validateEnv', () => {
  it('only allows development shortcuts with an explicit development or test environment', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'development', OTP_DEV_ECHO: 'true' })).not.toThrow();
    expect(() => validateEnv({ ...base, NODE_ENV: 'test', OTP_DEV_ECHO: 'true', THROTTLE_DISABLED: 'true' })).not.toThrow();
    // NODE_ENV missing is production: it fails closed.
    expect(() => validateEnv({ ...production, NODE_ENV: undefined, OTP_DEV_ECHO: 'true' })).toThrow(/OTP_DEV_ECHO/);
    expect(() => validateEnv({ ...production, NODE_ENV: 'staging', OTP_DEV_ECHO: 'true' })).toThrow(/OTP_DEV_ECHO/);
    expect(() => validateEnv({ ...production, THROTTLE_DISABLED: 'true' })).toThrow(/THROTTLE_DISABLED/);
  });

  it('treats a missing NODE_ENV as production for required settings', () => {
    expect(() => validateEnv({ ...base })).toThrow(/TERMII_API_KEY/);
    expect(() => validateEnv(production)).not.toThrow();
  });

  it('requires the second factor for admins and pharmacists in production, with its own key', () => {
    expect(() => validateEnv({ ...production, MFA_ENCRYPTION_KEY: undefined })).toThrow(/MFA_ENCRYPTION_KEY/);
    expect(() => validateEnv({ ...production, MFA_REQUIRED_ROLES: 'PLATFORM_ADMIN' })).toThrow(/MFA_REQUIRED_ROLES/);
    expect(() => validateEnv({ ...base, NODE_ENV: 'development', MFA_REQUIRED_ROLES: '' })).not.toThrow();
  });

  it('checks session lengths', () => {
    expect(() => validateEnv({ ...production, STAFF_SESSION_TTL: '12 hours' })).toThrow(/STAFF_SESSION_TTL/);
    expect(() => validateEnv({ ...production, JWT_TTL: '7d', STAFF_SESSION_TTL: '8h' })).not.toThrow();
  });
});

describe('env helpers', () => {
  it('parses durations, MFA roles and local environments', () => {
    expect(parseDuration('12h')).toBe(43_200);
    expect(parseDuration('7d')).toBe(604_800);
    expect(parseDuration('0m')).toBeNull();
    expect(parseDuration('soon')).toBeNull();
    expect(parseMfaRoles(undefined)).toEqual(['PLATFORM_ADMIN', 'PHARMACIST']);
    expect(parseMfaRoles('PLATFORM_ADMIN, NOT_A_ROLE')).toEqual(['PLATFORM_ADMIN']);
    expect(isLocalEnv(undefined)).toBe(false);
    expect(isLocalEnv('production')).toBe(false);
    expect(isLocalEnv('development')).toBe(true);
  });
});
