import { config } from 'dotenv';
import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';

/**
 * Bring the test database up to date without destroying anything: apply pending migrations,
 * then re-run the (idempotent) seed, which restores seeded stock levels. Tests use fresh phone
 * numbers each run, so leftover rows from earlier runs don't affect results.
 */
export default function setup() {
  const env = { ...process.env, ...config({ path: '.env', quiet: true }).parsed, ...config({ path: '.env.test', override: true, quiet: true }).parsed };
  if (!env.DATABASE_URL?.includes('_test')) throw new Error('Refusing to touch a database whose name does not end in _test');
  execSync('npx prisma migrate deploy', { env, stdio: 'pipe' });
  execSync('npx prisma db seed', { env, stdio: 'pipe' });
  return () => rmSync(env.UPLOAD_DIR ?? './uploads-test', { recursive: true, force: true });
}
