/**
 * @file apps/api/src/shared/database/run-migrations.ts
 * @shared CLI entry for npm run migrate
 * @dependencies pg
 */

import { config } from 'dotenv';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Pool } from 'pg';

config({ path: join(__dirname, '../../../.env') });
config({ path: join(__dirname, '../../../.env.example') });

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString === undefined) {
    throw new Error('DATABASE_URL is required');
  }

  const pool = new Pool({ connectionString });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const dir = join(__dirname, '../../migrations');
  const files = (await readdir(dir)).filter((name: string): boolean => name.endsWith('.sql')).sort();

  for (const file of files) {
    const existing = await pool.query<{ id: string }>('SELECT id FROM schema_migrations WHERE id = $1', [
      file,
    ]);
    if ((existing.rowCount ?? 0) > 0) {
      continue;
    }
    const sql = await readFile(join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file]);
      await client.query('COMMIT');
      process.stdout.write(`applied ${file}\n`);
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  await pool.end();
}

void main();
