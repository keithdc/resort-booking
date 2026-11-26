/**
 * @file apps/api/src/shared/database/run-migrations.ts
 * @shared CLI entry for npm run migrate: applies pending migrations with the owner role
 * @dependencies pg, dotenv
 */

import { config } from 'dotenv';
import { join } from 'node:path';
import { Pool } from 'pg';
import { buildPoolConfig, readDatabaseSettings, resolveMigrationTarget } from './database-settings';
import { applyPendingMigrations, poolExecutor } from './migration-files';
import { DEFAULT_APP_ROLE } from './roles';

// Only `.env`: the example file holds development placeholders and must never act as configuration.
config({ path: join(__dirname, '../../../.env') });

async function main(): Promise<void> {
  const settings = readDatabaseSettings(process.env);
  const target = resolveMigrationTarget(settings);
  if (target.url === '') {
    throw new Error('MIGRATION_DATABASE_URL (or DATABASE_URL) is required');
  }
  if (!target.separate) {
    process.stderr.write('MIGRATION_DATABASE_URL is not set: using DATABASE_URL (fine for development).\n');
  }

  const pool = new Pool(buildPoolConfig(target.url, settings, 1));
  try {
    const applied = await applyPendingMigrations(poolExecutor(pool), {
      appRole: process.env.DB_APP_ROLE?.trim() || DEFAULT_APP_ROLE,
      onApplied: (file: string): void => {
        process.stdout.write(`applied ${file}\n`);
      },
    });
    if (applied.length === 0) {
      process.stdout.write('nothing to apply\n');
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown): void => {
  process.stderr.write(`${error instanceof Error ? error.message : 'migrate failed'}\n`);
  process.exit(1);
});
