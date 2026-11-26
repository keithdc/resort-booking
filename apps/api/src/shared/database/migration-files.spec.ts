/**
 * @file apps/api/src/shared/database/migration-files.spec.ts
 * @shared Finding and applying migration files, and locking the ledger
 */

import type { QueryResult, QueryResultRow } from 'pg';
import { listMigrationFiles, lockdownMigrationTable, pendingMigrations, restrictFinancialTables, type SqlExecutor } from './migration-files';

function result<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
}

function executor(options: { ledgerExists: boolean; applied: string[] }): { sql: SqlExecutor; seen: string[] } {
  const seen: string[] = [];
  // `jest.fn()` is loosely typed, which lets one fake answer for every row type the real, generic `query` can return.
  const query = jest.fn().mockImplementation(async (text: string) => {
    seen.push(text.replace(/\s+/g, ' ').trim());
    if (text.includes('to_regclass')) {
      return result([{ present: options.ledgerExists }]);
    }
    return result(text.includes('SELECT id FROM schema_migrations') ? options.applied.map((id: string) => ({ id })) : []);
  });
  const sql: SqlExecutor = {
    query,
    withClient: async (): Promise<never> => {
      throw new Error('not used');
    },
  };
  return { sql, seen };
}

describe('listMigrationFiles', () => {
  it('lists the shipped .sql files in the order they are applied', async () => {
    const files = await listMigrationFiles();

    expect(files[0]).toBe('001_init.sql');
    expect(files).toContain('027_database_access.sql');
    expect([...files].sort()).toEqual(files);
    expect(files.every((name: string) => name.endsWith('.sql'))).toBe(true);
  });
});

describe('pendingMigrations', () => {
  it('is everything when the database has no ledger yet', async () => {
    const { sql } = executor({ ledgerExists: false, applied: [] });

    expect(await pendingMigrations(sql)).toEqual(await listMigrationFiles());
  });

  it('is only what the ledger does not list, and only reads', async () => {
    const files = await listMigrationFiles();
    const { sql, seen } = executor({ ledgerExists: true, applied: files.slice(0, -2) });

    expect(await pendingMigrations(sql)).toEqual(files.slice(-2));
    expect(seen.every((text: string) => text.startsWith('SELECT'))).toBe(true);
  });

  it('is empty when everything is applied', async () => {
    const files = await listMigrationFiles();

    expect(await pendingMigrations(executor({ ledgerExists: true, applied: files }).sql)).toEqual([]);
  });
});

describe('lockdownMigrationTable', () => {
  it('revokes writes on the ledger from the app role, only if that role exists', async () => {
    const { sql, seen } = executor({ ledgerExists: true, applied: [] });

    await lockdownMigrationTable(sql);

    expect(seen[0]).toContain("IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'resort_app')");
    expect(seen[0]).toContain('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON schema_migrations FROM "resort_app"');
  });

  it('uses the configured role name', async () => {
    const { sql, seen } = executor({ ledgerExists: true, applied: [] });

    await lockdownMigrationTable(sql, 'api_rw');

    expect(seen[0]).toContain('FROM "api_rw"');
  });

  it('refuses a role name that could break out of the statement', async () => {
    const { sql } = executor({ ledgerExists: true, applied: [] });

    await expect(lockdownMigrationTable(sql, "x'; DROP TABLE houses; --")).rejects.toThrow(/the app role name must be/);
  });
});

describe('restrictFinancialTables', () => {
  it('narrows the money and audit tables and hides the erasure ledger from the app role, one statement each, and does nothing else', async () => {
    const { sql, seen } = executor({ ledgerExists: true, applied: [] });

    await restrictFinancialTables(sql, 'resort_app');

    expect(seen).toHaveLength(6);
    expect(seen.join('\n')).toContain('public.audit_log');
    expect(seen.join('\n')).toContain('public.privacy_erasure_ledger');
    expect(seen.join('\n')).toContain('public.payment_webhook_events');
    expect(seen.every((text: string) => text.startsWith('DO $$') && text.includes('"resort_app"'))).toBe(true);
  });

  it('uses the configured role name and refuses an unsafe one', async () => {
    const { sql, seen } = executor({ ledgerExists: true, applied: [] });

    await restrictFinancialTables(sql, 'api_rw');
    expect(seen.every((text: string) => text.includes('"api_rw"') && !text.includes('resort_app'))).toBe(true);
    await expect(restrictFinancialTables(sql, 'x"y')).rejects.toThrow(/must be lower-case/);
  });
});
