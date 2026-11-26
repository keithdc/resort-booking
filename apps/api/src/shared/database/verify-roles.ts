/**
 * @file apps/api/src/shared/database/verify-roles.ts
 * @shared CLI for `npm run db:verify-roles`: proves the app and read-only roles can do their job and nothing more
 * @dependencies pg, dotenv
 */

import { config } from 'dotenv';
import { join } from 'node:path';
import { Client } from 'pg';
import { describeUrl } from './database-urls';
import { runProbes, type ProbeOutcome, type ProbeRole } from './role-probes';

config({ path: join(__dirname, '../../../.env') });

/**
 * Connects as the role and runs its probes. Every probe is rolled back, so it is safe on a real database.
 */
export async function verifyRole(url: string, role: ProbeRole, skipSlow: boolean): Promise<ProbeOutcome[]> {
  const client = new Client({ connectionString: url, application_name: 'resort-db-verify' });
  await client.connect();
  try {
    return await runProbes(client, role, { skipSlow });
  } finally {
    await client.end();
  }
}

/**
 * One line per probe plus a verdict.
 */
export function formatOutcomes(title: string, outcomes: readonly ProbeOutcome[]): { text: string; failed: number } {
  const lines = outcomes.map(
    (outcome: ProbeOutcome): string => `  ${outcome.ok ? 'PASS' : 'FAIL'}  ${outcome.probe.name}  [${outcome.detail.slice(0, 110)}]`,
  );
  const failed = outcomes.filter((outcome: ProbeOutcome): boolean => !outcome.ok).length;
  return { text: `${title}\n${lines.join('\n')}`, failed };
}

async function main(): Promise<void> {
  const skipSlow = process.argv.includes('--skip-timeout');
  const appUrl = process.env.DATABASE_URL?.trim();
  if (appUrl === undefined || appUrl === '') {
    throw new Error('DATABASE_URL is required (the app role).');
  }
  const readonlyUrl = process.env.READONLY_DATABASE_URL?.trim();
  let failed = 0;

  const app = formatOutcomes(`App role (${describeUrl(appUrl)})`, await verifyRole(appUrl, 'app', skipSlow));
  process.stdout.write(`${app.text}\n`);
  failed += app.failed;

  if (readonlyUrl === undefined || readonlyUrl === '') {
    process.stdout.write('\nREADONLY_DATABASE_URL is not set: the read-only role was not checked.\n');
  } else {
    const readonly = formatOutcomes(`Read-only role (${describeUrl(readonlyUrl)})`, await verifyRole(readonlyUrl, 'readonly', skipSlow));
    process.stdout.write(`\n${readonly.text}\n`);
    failed += readonly.failed;
  }

  process.stdout.write(failed === 0 ? '\nAll checks passed.\n' : `\n${String(failed)} check(s) FAILED: a role is too powerful or too weak.\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error: unknown): void => {
    process.stderr.write(`${error instanceof Error ? error.message : 'db:verify-roles failed'}\n`);
    process.exit(1);
  });
}
