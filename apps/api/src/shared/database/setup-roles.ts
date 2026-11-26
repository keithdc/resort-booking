/**
 * @file apps/api/src/shared/database/setup-roles.ts
 * @shared CLI for `npm run db:setup-roles`: creates or repairs the owner, app and read-only database roles
 * @dependencies pg, dotenv
 */

import { config } from 'dotenv';
import { join } from 'node:path';
import { Client } from 'pg';
import { databaseNameOf, describeUrl } from './database-urls';
import { buildRoleStatements, roleOptionsFromEnv, type RoleStatement } from './roles';

config({ path: join(__dirname, '../../../.env') });

/**
 * Runs the statements in ONE transaction on an admin connection: either every role and privilege is in place, or
 * nothing changed. Prints each statement with passwords hidden.
 */
export async function runRoleStatements(
  adminUrl: string,
  statements: readonly RoleStatement[],
  print: (line: string) => void,
): Promise<void> {
  const client = new Client({ connectionString: adminUrl, application_name: 'resort-db-setup' });
  await client.connect();
  try {
    await client.query('BEGIN');
    for (const statement of statements) {
      print(`  ${statement.log.slice(0, 160)}`);
      await client.query(statement.sql);
    }
    await client.query('COMMIT');
  } catch (error: unknown) {
    await client.query('ROLLBACK').catch((): undefined => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const adminUrl = process.env.DATABASE_ADMIN_URL?.trim();
  if (adminUrl === undefined || adminUrl === '') {
    throw new Error('DATABASE_ADMIN_URL is required: the superuser connection of the database server (docs/11-database-access.md).');
  }
  const database = databaseNameOf(adminUrl);
  if (database === null) {
    throw new Error('DATABASE_ADMIN_URL must name the database, e.g. postgres://user:pass@host:5433/resort_booking');
  }
  const options = roleOptionsFromEnv(process.env, database);
  const statements = buildRoleStatements(options);
  process.stdout.write(`Setting up the database roles in ${describeUrl(adminUrl)}\n`);
  await runRoleStatements(adminUrl, statements, (line: string): void => {
    process.stdout.write(`${line}\n`);
  });
  process.stdout.write(
    `\nDone. Roles: ${options.ownerRole} (migrations), ${options.appRole} (the API), ${options.readonlyRole} (reports).\n` +
      'Next: put the app role in DATABASE_URL, the owner role in MIGRATION_DATABASE_URL, then run `npm run db:verify-roles`.\n',
  );
}

if (require.main === module) {
  main().catch((error: unknown): void => {
    process.stderr.write(`${error instanceof Error ? error.message : 'db:setup-roles failed'}\n`);
    process.exit(1);
  });
}
