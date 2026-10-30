/**
 * Break-glass recovery for a platform admin who can't sign in — lost phone and recovery codes, or
 * every admin disabled — when no other admin can help from the admin page.
 *
 * Run it on a server that has the production environment (shell access to it is the proof of
 * who you are):
 *
 *   npm run admin:recover -- --phone 0803 000 0009 --reason "Lost phone; identity confirmed by the CEO in person"
 *
 * It clears the admin's authenticator app (they set it up again at their next sign-in), re-enables
 * the account if it was disabled (--enable), signs it out everywhere, texts them, and writes an
 * audit entry naming the server user who ran it. If another admin could do this from the admin
 * page instead, it stops unless you pass --force.
 */
import { Logger, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { userInfo, hostname } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { AuditService } from '../audit/audit.service.js';
import { MfaService } from '../auth/mfa.service.js';
import { normalisePhone } from '../auth/phone.js';
import { SessionsService } from '../auth/sessions.service.js';
import { Role } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type RecoveryArgs = { phone?: string; reason?: string; enable?: boolean; force?: boolean; yes?: boolean };
type Io = { print: (line: string) => void; confirm: (question: string) => Promise<string> };

export function parseArgs(argv: string[]): RecoveryArgs {
  const args: RecoveryArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--enable') args.enable = true;
    else if (a === '--force') args.force = true;
    else if (a === '--yes') args.yes = true;
    else if (a === '--phone' || a === '--reason') {
      // Values may be split over several words: take everything up to the next flag.
      const words: string[] = [];
      while (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) words.push(argv[++i]);
      args[a.slice(2) as 'phone' | 'reason'] = words.join(' ');
    } else throw new Error(`Unknown option ${a}`);
  }
  return args;
}

/** Returns a process exit code. */
export async function runRecovery(app: INestApplicationContext, args: RecoveryArgs, io: Io): Promise<number> {
  const prisma = app.get(PrismaService);
  const phone = args.phone ? normalisePhone(args.phone) : null;
  if (!phone) {
    io.print('Give the admin’s phone number: --phone 0803 000 0009');
    return 2;
  }
  if (!args.reason || args.reason.trim().length < 10) {
    io.print('Give a reason of at least 10 characters for the audit log: --reason "…how you confirmed who they are…"');
    return 2;
  }
  const reason = args.reason.trim();

  const admin = await prisma.user.findUnique({ where: { phone }, select: { id: true, role: true, firstName: true, lastName: true, disabledAt: true, totpEnabledAt: true } });
  if (!admin || admin.role !== Role.PLATFORM_ADMIN) {
    io.print('No platform admin has that number. Other accounts are recovered by an admin from the admin page.');
    return 1;
  }

  // An admin who can still sign in should do this from the admin page, where it's tied to their account.
  const helpers = await prisma.user.count({ where: { role: Role.PLATFORM_ADMIN, disabledAt: null, totpEnabledAt: { not: null }, id: { not: admin.id } } });
  if (helpers && !args.force) {
    io.print(`${helpers} other admin(s) can sign in — ask one of them to use Admin › Accounts & security instead (or pass --force).`);
    return 1;
  }

  const name = [admin.firstName, admin.lastName].filter(Boolean).join(' ') || 'this admin';
  const actions = [
    admin.totpEnabledAt ? 'clear their authenticator app (they set it up again at next sign-in)' : 'clear any half-finished authenticator set-up',
    ...(admin.disabledAt && args.enable ? ['re-enable the account'] : []),
    'sign them out everywhere',
  ];
  io.print(`About to recover ${name} (${phone.slice(0, 7)}•••${phone.slice(-2)}):`);
  for (const a of actions) io.print(`  - ${a}`);
  if (admin.disabledAt && !args.enable) io.print('  (The account is disabled and stays disabled — add --enable to re-enable it.)');

  if (!args.yes) {
    const typed = await io.confirm('Type the phone number again to confirm: ');
    if (normalisePhone(typed) !== phone) {
      io.print('That doesn’t match — nothing was changed.');
      return 1;
    }
  }

  const operator = { via: 'server console', operator: `${userInfo().username}@${hostname()}` };
  await app.get(MfaService).reset(null, admin.id, reason, operator);
  if (admin.disabledAt && args.enable) {
    await prisma.user.update({ where: { id: admin.id }, data: { disabledAt: null, disabledReason: null } });
    await app.get(AuditService).record({ actorId: null, action: 'account.enabled', entityType: 'User', entityId: admin.id, metadata: { reason, ...operator } });
  }
  await app.get(SessionsService).revokeAll(admin.id, 'recovered from the server console');
  io.print(`Done. ${name} can sign in with a code to their phone and will set up their authenticator app again.`);
  return 0;
}

async function main() {
  // A one-off command: don't start the background delivery and licence checks.
  process.env.LATE_CHECK_MS = '0';
  process.env.COMPLIANCE_CHECK_MS = '0';
  const { AppModule } = await import('../app.module.js');
  let args: RecoveryArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 2;
    return;
  }
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  // Opened only when asking, so piped input isn't read early; no answer counts as "no".
  const confirm = (question: string) =>
    new Promise<string>((resolve) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      rl.on('close', () => resolve('')); // input ended without an answer
      rl.question(question).then(resolve, () => resolve('')).finally(() => rl.close());
    });
  try {
    process.exitCode = await runRecovery(app, args, { print: (l) => console.log(l), confirm });
  } catch (e) {
    Logger.error(e instanceof Error ? e.message : String(e), 'AdminRecovery');
    process.exitCode = 1;
  } finally {
    // Give background texts a moment to go out before closing.
    await new Promise((r) => setTimeout(r, 1500));
    await app.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
