/**
 * @file apps/api/src/shared/database/migration-files.ts
 * @shared Finding and applying the SQL migration files, on whichever connection is allowed to change the schema
 * @dependencies pg, node:fs
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Pool, QueryResult, QueryResultRow } from 'pg';
import { compareMigrations } from './migration-status';
import { assertIdentifier, DEFAULT_APP_ROLE, restrictedTableStatements } from './roles';

/** What the migration code needs from one connection: run a statement. (A pg PoolClient fits; so does a small fake.) */
export interface SqlClient {
  query<T extends QueryResultRow>(text: string, params?: unknown[]): Promise<QueryResult<T>>;
}

/** The two things the migration code needs from a connection: a plain query and a client for a transaction. */
export interface SqlExecutor {
  query<T extends QueryResultRow>(text: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
  withClient<T>(fn: (client: SqlClient) => Promise<T>): Promise<T>;
}

/**
 * Wraps a pg pool as an executor.
 */
export function poolExecutor(pool: Pool): SqlExecutor {
  return {
    query: <T extends QueryResultRow>(text: string, params: readonly unknown[] = []): Promise<QueryResult<T>> =>
      pool.query<T>(text, [...params]),
    withClient: async <T>(fn: (client: SqlClient) => Promise<T>): Promise<T> => {
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
 * Narrows the runtime role's rights on the audit log and the money tables (INSERT and read, UPDATE of a few columns, no
 * DELETE; docs/13 R2-05). New tables get the blanket default privileges when the owner creates them, so this runs after
 * every migration run, like the ledger lock-down. Idempotent; does nothing if the role does not exist.
 */
export async function restrictFinancialTables(executor: SqlExecutor, appRole: string = DEFAULT_APP_ROLE): Promise<void> {
  for (const sql of restrictedTableStatements(appRole)) {
    await executor.query(sql);
  }
}

/** What the ledger holds for one applied file next to what the file says now. */
export interface EditedMigration {
  id: string;
  recorded: string;
  current: string;
}

/** The advisory lock every migration runner takes, so two runners (two API instances, or one plus `npm run migrate`) never overlap. */
const MIGRATION_LOCK_KEY = '7262000117';
const LOCK_WAIT_MS = 60_000;
const LOCK_POLL_MS = 500;

/**
 * SHA-256 of a migration file's text. Line endings are normalised first, so a checkout with CRLF (git autocrlf) is not
 * mistaken for an edit.
 */
export function migrationChecksum(sql: string): string {
  return createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
}

/**
 * Applied migrations whose file no longer matches the checksum recorded when it ran (docs/13 R2-22). Read-only, so the
 * runtime role can ask. A ledger without the checksum column, or a row recorded before checksums existed, is not an edit.
 */
export async function findEditedMigrations(executor: SqlExecutor, dir: string = resolveMigrationsDir()): Promise<EditedMigration[]> {
  const column = await executor.query<{ present: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = 'schema_migrations' AND column_name = 'checksum'
     ) AS present`,
  );
  if (column.rows[0]?.present !== true) {
    return [];
  }
  const recorded = await executor.query<{ id: string; checksum: string }>('SELECT id, checksum FROM schema_migrations WHERE checksum IS NOT NULL ORDER BY id');
  const edited: EditedMigration[] = [];
  for (const row of recorded.rows) {
    const path = join(dir, row.id);
    if (!existsSync(path)) {
      continue;
    }
    const current = migrationChecksum(await readFile(path, 'utf8'));
    if (current !== row.checksum) {
      edited.push({ id: row.id, recorded: row.checksum, current });
    }
  }
  return edited;
}

/**
 * Operator-facing message for edited history.
 */
export function describeEditedMigrations(edited: readonly EditedMigration[]): string {
  const list = edited.map((item): string => `${item.id} (recorded ${item.recorded.slice(0, 12)}, file now ${item.current.slice(0, 12)})`).join(', ');
  return (
    `Applied migration(s) were edited after they ran: ${list}. A migration that has been applied must never change: ` +
    'put the change in a NEW migration file. If the edit is harmless (a comment) and already reviewed, bring the ledger in line with ' +
    'UPDATE schema_migrations SET checksum = <file now> WHERE id = <file>.'
  );
}

function clientExecutor(client: SqlClient): SqlExecutor {
  return {
    query: <T extends QueryResultRow>(text: string, params: readonly unknown[] = []): Promise<QueryResult<T>> => client.query<T>(text, [...params]),
    withClient: <T>(fn: (client: SqlClient) => Promise<T>): Promise<T> => fn(client),
  };
}

function pause(ms: number): Promise<void> {
  return new Promise<void>((resolve): void => {
    setTimeout(resolve, ms);
  });
}

/** Waits for the migration lock for up to `waitMs`; throws a message that says who to wait for. */
async function acquireMigrationLock(client: SqlClient, waitMs: number, pollMs: number): Promise<void> {
  const deadline = Date.now() + waitMs;
  for (;;) {
    const result = await client.query<{ locked: boolean }>('SELECT pg_try_advisory_lock($1::bigint) AS locked', [MIGRATION_LOCK_KEY]);
    if (result.rows[0]?.locked === true) {
      return;
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `Another migration run holds the migration lock and did not finish within ${String(Math.round(waitMs / 1000))} seconds. ` +
          'Wait for it (another API instance with RUN_MIGRATIONS_ON_START, or `npm run migrate`) and try again.',
      );
    }
    await pause(pollMs);
  }
}

function describeFailure(file: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : 'unknown error';
  const position = typeof error === 'object' && error !== null && 'position' in error && typeof error.position === 'string' ? ` (at character ${error.position})` : '';
  return new Error(
    `Migration ${file} failed and was rolled back, so nothing from it is applied and the files after it were not run: ${message}${position}. ` +
      'Fix the SQL (or the data it trips over) and run the migration again.',
    { cause: error },
  );
}

export interface ApplyOptions {
  dir?: string;
  appRole?: string;
  onApplied?: (file: string) => void;
  /** Applied files that were edited: true (the default) refuses to run, false only reports through `onEdited`. */
  strictChecksums?: boolean;
  onEdited?: (message: string) => void;
  /** How long to wait for another runner (tests shorten it). */
  lockWaitMs?: number;
  lockPollMs?: number;
}

/**
 * Applies every pending file, each in its own transaction together with its `schema_migrations` row (and the file's
 * SHA-256). Needs a connection that may change the schema. Returns the files applied, in order.
 *
 * One advisory lock is held for the whole run, so two runners never overlap: the second waits, then finds nothing
 * pending. Before anything runs, every applied file is compared with its recorded checksum (docs/13 R2-22): an edited
 * history stops the run (strict) or is reported (not strict, for a development machine). A failing file is rolled back and
 * named in the error.
 */
export async function applyPendingMigrations(executor: SqlExecutor, options: ApplyOptions = {}): Promise<string[]> {
  const dir = options.dir ?? resolveMigrationsDir();
  return executor.withClient(async (client): Promise<string[]> => {
    await acquireMigrationLock(client, options.lockWaitMs ?? LOCK_WAIT_MS, options.lockPollMs ?? LOCK_POLL_MS);
    try {
      return await applyWithLock(clientExecutor(client), client, dir, options);
    } finally {
      await client.query('SELECT pg_advisory_unlock($1::bigint)', [MIGRATION_LOCK_KEY]).catch((): undefined => undefined);
    }
  });
}

async function applyWithLock(session: SqlExecutor, client: SqlClient, dir: string, options: ApplyOptions): Promise<string[]> {
  await session.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now(),
      checksum text
    )
  `);
  await session.query('ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum text');
  await lockdownMigrationTable(session, options.appRole);

  const edited = await findEditedMigrations(session, dir);
  if (edited.length > 0) {
    const message = describeEditedMigrations(edited);
    if (options.strictChecksums ?? true) {
      throw new Error(message);
    }
    options.onEdited?.(message);
  }
  await backfillChecksums(session, dir);

  const applied: string[] = [];
  for (const file of await pendingMigrations(session, dir)) {
    const sql = await readFile(join(dir, file), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (id, checksum) VALUES ($1, $2)', [file, migrationChecksum(sql)]);
      await client.query('COMMIT');
    } catch (error: unknown) {
      await client.query('ROLLBACK').catch((): undefined => undefined);
      throw describeFailure(file, error);
    }
    options.onApplied?.(file);
    applied.push(file);
  }
  await restrictFinancialTables(session, options.appRole);
  return applied;
}

/**
 * Rows recorded before checksums existed get the checksum of the file as it is now (trust on first use): from here on an
 * edit is noticed, though an edit made before this ran cannot be.
 */
async function backfillChecksums(session: SqlExecutor, dir: string): Promise<void> {
  const missing = await session.query<{ id: string }>('SELECT id FROM schema_migrations WHERE checksum IS NULL');
  const ids: string[] = [];
  const sums: string[] = [];
  for (const row of missing.rows) {
    const path = join(dir, row.id);
    if (existsSync(path)) {
      ids.push(row.id);
      sums.push(migrationChecksum(await readFile(path, 'utf8')));
    }
  }
  if (ids.length > 0) {
    await session.query(
      'UPDATE schema_migrations AS m SET checksum = v.checksum FROM unnest($1::text[], $2::text[]) AS v(id, checksum) WHERE m.id = v.id AND m.checksum IS NULL',
      [ids, sums],
    );
  }
}
