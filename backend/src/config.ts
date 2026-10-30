import { isLocalEnv, parseDuration, parseMfaRoles } from './common/env.js';

/** Fail fast on missing or unsafe configuration. */
export function validateEnv(env: Record<string, unknown>) {
  const missing = ['DATABASE_URL', 'JWT_SECRET'].filter((k) => !env[k]);
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  if (String(env.JWT_SECRET).length < 32) throw new Error('JWT_SECRET must be at least 32 characters');

  // Anything other than an explicit development or test environment is production.
  const local = isLocalEnv(env.NODE_ENV);
  const hint = 'set NODE_ENV=development on your own machine';
  if (!local && env.OTP_DEV_ECHO === 'true') throw new Error(`OTP_DEV_ECHO is only allowed with NODE_ENV=development or test (${hint})`);
  if (!local && env.THROTTLE_DISABLED === 'true') throw new Error(`THROTTLE_DISABLED is only allowed with NODE_ENV=development or test (${hint})`);
  if (!local && !env.TERMII_API_KEY) throw new Error(`TERMII_API_KEY is required in production to send sign-in codes (${hint})`);
  const missingFlw = ['FLW_PUBLIC_KEY', 'FLW_SECRET_KEY', 'FLW_SECRET_HASH'].filter((k) => !env[k]);
  if (!local && missingFlw.length) throw new Error(`Payments need ${missingFlw.join(', ')} in production (${hint})`);

  for (const key of ['JWT_TTL', 'STAFF_SESSION_TTL']) {
    if (env[key] !== undefined && env[key] !== '' && parseDuration(env[key]) === null) throw new Error(`${key} must look like 12h, 7d or 30m`);
  }
  // Second factor: admins and pharmacists always need it in production, and its secrets need their own key.
  const mfaRoles = parseMfaRoles(env.MFA_REQUIRED_ROLES);
  if (!local && !(mfaRoles.includes('PLATFORM_ADMIN') && mfaRoles.includes('PHARMACIST'))) {
    throw new Error('MFA_REQUIRED_ROLES must include PLATFORM_ADMIN and PHARMACIST in production');
  }
  if (!local && (typeof env.MFA_ENCRYPTION_KEY !== 'string' || env.MFA_ENCRYPTION_KEY.length < 32)) throw new Error('MFA_ENCRYPTION_KEY (at least 32 characters) is required in production');

  const { TERMII_SENDER_ID: sender, TERMII_CHANNEL: channel } = env;
  if (sender && (typeof sender !== 'string' || !/^[A-Za-z0-9]{3,11}$/.test(sender))) throw new Error('TERMII_SENDER_ID must be 3–11 letters or digits');
  if (channel && channel !== 'dnd' && channel !== 'generic') throw new Error('TERMII_CHANNEL must be "dnd" or "generic"');
  return env;
}
