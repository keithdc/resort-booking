/**
 * @file apps/api/src/shared/database/migration-apply.spec.ts
 * @shared Applying migrations: advisory lock, checksums of applied files, one transaction per file, clear failures
 */

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { QueryResult, QueryResultRow } from 'pg';
import {
  applyPendingMigrations,
  describeEditedMigrations,
  findEditedMigrations,
  migrationChecksum,
  type SqlClient,
  type SqlExecutor,
} from './migration-files';

function result<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
}

interface FakeLedger {
  applied: Array<{ id: string; checksum: string | null }>;
  /** Answers for pg_try_advisory_lock, in order; the last one repeats. */
  lockAnswers: boolean[];
  /** A file whose SQL should fail, with the error to throw. */
  failOn?: { sql: string; error: Error };
}

function fake(ledger: FakeLedger): { executor: SqlExecutor; statements: string[]; applied: () => FakeLedger['applied'] } {
  const statements: string[] = [];
  let lockCalls = 0;
  // `jest.fn()` is loosely typed, which lets one fake answer for every row type the real, generic `query` can return.
  const query = jest.fn().mockImplementation((text: string, params: unknown[] = []): Promise<QueryResult<QueryResultRow>> => {
    const sql = text.replace(/\s+/g, ' ').trim();
    statements.push(sql);
    if (sql.includes('pg_try_advisory_lock')) {
      const answer = ledger.lockAnswers[Math.min(lockCalls, ledger.lockAnswers.length - 1)] ?? true;
      lockCalls += 1;
      return Promise.resolve(result([{ locked: answer }]));
    }
    if (ledger.failOn !== undefined && sql === ledger.failOn.sql.replace(/\s+/g, ' ').trim()) {
      return Promise.reject(ledger.failOn.error);
    }
    if (sql.includes('information_schema.columns')) {
      return Promise.resolve(result([{ present: true }]));
    }
    if (sql.startsWith('SELECT id, checksum FROM schema_migrations')) {
      return Promise.resolve(result(ledger.applied.filter((row) => row.checksum !== null).map((row) => ({ id: row.id, checksum: row.checksum }))));
    }
    if (sql.includes('to_regclass')) {
      return Promise.resolve(result([{ present: true }]));
    }
    if (sql === 'SELECT id FROM schema_migrations WHERE checksum IS NULL') {
      return Promise.resolve(result(ledger.applied.filter((row) => row.checksum === null).map((row) => ({ id: row.id }))));
    }
    if (sql === 'SELECT id FROM schema_migrations') {
      return Promise.resolve(result(ledger.applied.map((row) => ({ id: row.id }))));
    }
    if (sql.startsWith('INSERT INTO schema_migrations')) {
      ledger.applied.push({ id: String(params[0]), checksum: String(params[1]) });
    }
    if (sql.startsWith('UPDATE schema_migrations AS m')) {
      const ids = params[0];
      const sums = params[1];
      if (Array.isArray(ids) && Array.isArray(sums)) {
        ids.forEach((id: unknown, index: number) => {
          const row = ledger.applied.find((item) => item.id === id);
          if (row !== undefined && row.checksum === null) {
            row.checksum = typeof sums[index] === 'string' ? String(sums[index]) : null;
          }
        });
      }
    }
    return Promise.resolve(result([]));
  });
  const executor: SqlExecutor = {
    query,
    withClient: <T>(fn: (client: SqlClient) => Promise<T>): Promise<T> => fn({ query }),
  };
  return { executor, statements, applied: (): FakeLedger['applied'] => ledger.applied };
}

function folder(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'migrations-'));
  for (const [name, sql] of Object.entries(files)) {
    writeFileSync(join(dir, name), sql);
  }
  return dir;
}

describe('migrationChecksum', () => {
  it('is a SHA-256 of the text and ignores line-ending style', () => {
    expect(migrationChecksum('SELECT 1;\n')).toMatch(/^[0-9a-f]{64}$/);
    expect(migrationChecksum('a\r\nb\r\n')).toBe(migrationChecksum('a\nb\n'));
    expect(migrationChecksum('a')).not.toBe(migrationChecksum('b'));
  });
});

describe('applyPendingMigrations', () => {
  const A = 'SELECT 1;';
  const B = 'SELECT 2;';

  it('takes the lock, runs each file in its own transaction with its checksum, and releases the lock', async () => {
    const dir = folder({ '001_a.sql': A, '002_b.sql': B });
    const { executor, statements, applied } = fake({ applied: [], lockAnswers: [true] });

    const done = await applyPendingMigrations(executor, { dir });

    expect(done).toEqual(['001_a.sql', '002_b.sql']);
    expect(applied()).toEqual([
      { id: '001_a.sql', checksum: migrationChecksum(A) },
      { id: '002_b.sql', checksum: migrationChecksum(B) },
    ]);
    const order = statements.filter((text) => /^(BEGIN|COMMIT|ROLLBACK|SELECT pg_try|SELECT pg_advisory_unlock|SELECT [12];)/.test(text));
    expect(order).toEqual([
      'SELECT pg_try_advisory_lock($1::bigint) AS locked',
      'BEGIN',
      'SELECT 1;',
      'COMMIT',
      'BEGIN',
      'SELECT 2;',
      'COMMIT',
      'SELECT pg_advisory_unlock($1::bigint)',
    ]);
  });

  it('creates the ledger with the checksum column and adds it to an older ledger', async () => {
    const { executor, statements } = fake({ applied: [], lockAnswers: [true] });

    await applyPendingMigrations(executor, { dir: folder({}) });

    expect(statements.some((text) => text.includes('CREATE TABLE IF NOT EXISTS schema_migrations') && text.includes('checksum text'))).toBe(true);
    expect(statements).toContain('ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum text');
  });

  it('waits for another runner, then runs (the lock is retried)', async () => {
    const { executor, statements } = fake({ applied: [], lockAnswers: [false, false, true] });

    await applyPendingMigrations(executor, { dir: folder({ '001_a.sql': A }), lockPollMs: 1 });

    expect(statements.filter((text) => text.includes('pg_try_advisory_lock'))).toHaveLength(3);
  });

  it('gives up with a clear message when the lock never frees, and runs nothing', async () => {
    const { executor, statements } = fake({ applied: [], lockAnswers: [false] });

    await expect(applyPendingMigrations(executor, { dir: folder({ '001_a.sql': A }), lockWaitMs: 5, lockPollMs: 1 })).rejects.toThrow(/Another migration run holds the migration lock/);
    expect(statements).not.toContain('BEGIN');
    // It never held the lock, so it must not release someone else's.
    expect(statements.some((text) => text.includes('pg_advisory_unlock'))).toBe(false);
  });

  it('names the failing file, rolls it back, releases the lock and does not run later files', async () => {
    const dir = folder({ '001_a.sql': A, '002_b.sql': 'SELECT broken;', '003_c.sql': 'SELECT 3;' });
    const error = Object.assign(new Error('column "broken" does not exist'), { position: '8' });
    const { executor, statements, applied } = fake({ applied: [], lockAnswers: [true], failOn: { sql: 'SELECT broken;', error } });

    const failure = await applyPendingMigrations(executor, { dir }).then(
      (): string => 'no error',
      (caught: unknown): string => (caught instanceof Error ? caught.message : 'not an Error'),
    );

    expect(failure).toContain('Migration 002_b.sql failed and was rolled back');
    expect(failure).toContain('column "broken" does not exist');
    expect(failure).toContain('character 8');
    expect(applied().map((row) => row.id)).toEqual(['001_a.sql']);
    expect(statements).toContain('ROLLBACK');
    expect(statements).not.toContain('SELECT 3;');
    expect(statements.some((text) => text.includes('pg_advisory_unlock'))).toBe(true);
  });

  it('refuses to run when an applied file was edited (strict, the default) and names the file', async () => {
    const dir = folder({ '001_a.sql': 'SELECT 1; -- edited', '002_b.sql': B });
    const { executor, statements } = fake({ applied: [{ id: '001_a.sql', checksum: migrationChecksum(A) }], lockAnswers: [true] });

    await expect(applyPendingMigrations(executor, { dir })).rejects.toThrow(/edited after they ran: 001_a\.sql/);
    expect(statements).not.toContain('BEGIN');
  });

  it('only reports an edited file when not strict (a development machine), and still applies what is pending', async () => {
    const dir = folder({ '001_a.sql': 'SELECT 1; -- edited', '002_b.sql': B });
    const { executor } = fake({ applied: [{ id: '001_a.sql', checksum: migrationChecksum(A) }], lockAnswers: [true] });
    const reported: string[] = [];

    const done = await applyPendingMigrations(executor, { dir, strictChecksums: false, onEdited: (message) => reported.push(message) });

    expect(done).toEqual(['002_b.sql']);
    expect(reported).toHaveLength(1);
    expect(reported[0]).toContain('001_a.sql');
  });

  it('records checksums for rows that were applied before checksums existed (trust on first use)', async () => {
    const dir = folder({ '001_a.sql': A });
    const { executor, applied } = fake({ applied: [{ id: '001_a.sql', checksum: null }], lockAnswers: [true] });

    await applyPendingMigrations(executor, { dir });

    expect(applied()).toEqual([{ id: '001_a.sql', checksum: migrationChecksum(A) }]);
  });

  it('is a no-op that still locks and unlocks when nothing is pending', async () => {
    const dir = folder({ '001_a.sql': A });
    const { executor, statements } = fake({ applied: [{ id: '001_a.sql', checksum: migrationChecksum(A) }], lockAnswers: [true] });

    await expect(applyPendingMigrations(executor, { dir })).resolves.toEqual([]);
    expect(statements).not.toContain('BEGIN');
    expect(statements.some((text) => text.includes('pg_advisory_unlock'))).toBe(true);
  });
});

describe('findEditedMigrations', () => {
  it('lists only files whose checksum differs, ignores files that no longer exist and rows without a checksum', async () => {
    const dir = folder({ '001_a.sql': 'SELECT 1; -- edited', '002_b.sql': 'SELECT 2;' });
    const { executor } = fake({
      applied: [
        { id: '001_a.sql', checksum: migrationChecksum('SELECT 1;') },
        { id: '002_b.sql', checksum: migrationChecksum('SELECT 2;') },
        { id: '009_gone.sql', checksum: migrationChecksum('x') },
        { id: '010_old.sql', checksum: null },
      ],
      lockAnswers: [true],
    });

    const edited = await findEditedMigrations(executor, dir);

    expect(edited.map((item) => item.id)).toEqual(['001_a.sql']);
    expect(edited[0]?.current).toBe(migrationChecksum('SELECT 1; -- edited'));
  });

  it('says how to fix it, without printing file contents', () => {
    const text = describeEditedMigrations([{ id: '001_a.sql', recorded: 'a'.repeat(64), current: 'b'.repeat(64) }]);

    expect(text).toContain('001_a.sql');
    expect(text).toContain('NEW migration file');
    expect(text).toContain('UPDATE schema_migrations SET checksum');
  });
});
