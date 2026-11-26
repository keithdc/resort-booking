/**
 * @file apps/api/src/shared/database/migration-files.ts
 * @shared Finding and applying the SQL migration files, on whichever connection is allowed to change the schema
 * @dependencies pg, node:fs
 */

import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { compareMigrations } from './migration-status';
import { assertIdentifier, DEFAULT_APP_ROLE } from './roles';

/** The two things the migration code needs from a connection: a plain query and a client for a transaction. */
export interface SqlExecutor {
  query<T extends QueryResultRow>(text: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
  withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T>;
}

/**
 * Wraps a pg pool as an executor.
 */
export function poolExecutor(pool: Pool): SqlExecutor {
  return {
    query: <T extends QueryResultRow>(text: string, params: readonly unknown[] = []): Promise<QueryResult<T>> =>
      pool.query<T>(text, [...params]),
    withClient: async <T>(fn: (client: PoolClient) => Promise<T>): Promise<T> => {
      const client = await pool.connect();
      try {
        return await fn(client);
      } finally {
        client.release();
      }
    },
  };
}

/**
 * The folder with the `NNN_name.sql` files (source tree, compiled output, or the working directory).
 */
export function resolveMigrationsDir(): string {
  const candidates = [
    join(__dirname, '../../migrations'),
    join(process.cwd(), 'src/migrations'),
    join(process.cwd(), 'dist/migrations'),
  ];
  const found = candidates.find((dir: string): boolean => existsSync(dir));
  if (found === undefined) {
    throw new Error('Could not find SQL migrations directory');
  }
  return found;
}

/**
 * The migration files this build ships, sorted (the order they are applied in).
 */
export async function listMigrationFiles(dir: string = resolveMigrationsDir()): Promise<string[]> {
  return (await readdir(dir)).filter((name: string): boolean => name.endsWith('.sql')).sort();
}

/**
 * Files not yet recorded in `schema_migrations`. Read-only, so the least-privilege runtime role can do it; a database
 * with no `schema_migrations` yet has everything pending.
 */
export async function pendingMigrations(executor: SqlExecutor, dir: string = resolveMigrationsDir()): Promise<string[]> {
  const files = await listMigrationFiles(dir);
  const exists = await executor.query<{ present: boolean }>("SELECT to_regclass('schema_migrations') IS NOT NULL AS present");
  if (exists.rows[0]?.present !== true) {
    return files;
  }
  const applied = await executor.query<{ id: string }>('SELECT id FROM schema_migrations');
  return compareMigrations(
    files,
    applied.rows.map((row: { id: string }): string => row.id),
  ).pending;
}

/**
 * The runtime role may read `schema_migrations` (the stale-build check) but never write to it: a bug or an injection
 * must not be able to mark a migration as applied, or erase the record. Idempotent; does nothing if the role does not exist.
 */
export async function lockdownMigrationTable(executor: SqlExecutor, appRole: string = DEFAULT_APP_ROLE): Promise<void> {
  const role = assertIdentifier(appRole, 'the app role name');
  await executor.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN
        REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON schema_migrations FROM "${role}";
      END IF;
    END
    $$
  `);
}

/**
 * Applies every pending file, each in its own transaction together with its `schema_migrations` row. Needs a
 * connection that may change the schema. Returns the files applied, in order.
 */
export async function applyPendingMigrations(
  executor: SqlExecutor,
  options: { dir?: string; appRole?: string; onApplied?: (file: string) => void } = {},
): Promise<string[]> {
  const dir = options.dir ?? resolveMigrationsDir();
  await executor.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await lockdownMigrationTable(executor, options.appRole);

  const applied: string[] = [];
  for (const file of await pendingMigrations(executor, dir)) {
    const sql = await readFile(join(dir, file), 'utf8');
    await executor.withClient(async (client): Promise<void> => {
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (error: unknown) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
    options.onApplied?.(file);
    applied.push(file);
  }
  return applied;
}
