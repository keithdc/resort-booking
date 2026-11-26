/**
 * @file apps/api/src/shared/database/migration-runner.spec.ts
 * @shared Stale-build safeguard and the migration connection rules in the migration runner
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { DatabaseService } from './database.service';
import { MigrationRunner } from './migration-runner';

const shipped = readdirSync(join(__dirname, '../../migrations')).filter((n: string): boolean => n.endsWith('.sql'));

interface Recorder {
  runner: MigrationRunner;
  queries: string[];
  clientQueries: string[];
  /** Every statement the schema-changing connection ran, whole. */
  clientStatements: string[];
}

async function build(applied: string[], ledgerExists = true): Promise<Recorder> {
  const queries: string[] = [];
  const clientQueries: string[] = [];
  const clientStatements: string[] = [];
  const moduleRef = await Test.createTestingModule({
    providers: [
      MigrationRunner,
      {
        provide: DatabaseService,
        useValue: {
          query: async (text: string): Promise<{ rows: unknown[]; rowCount: number }> => {
            queries.push(text.replace(/\s+/g, ' ').trim());
            if (text.includes('to_regclass')) {
              return { rows: [{ present: ledgerExists }], rowCount: 1 };
            }
            if (text.includes('SELECT id FROM schema_migrations')) {
              return { rows: applied.map((id: string): { id: string } => ({ id })), rowCount: applied.length };
            }
            return { rows: [], rowCount: 0 };
          },
          withClient: async <T>(fn: (client: { query: (text: string) => Promise<unknown> }) => Promise<T>): Promise<T> =>
            fn({
              query: async (text: string): Promise<unknown> => {
                const whole = text.replace(/\s+/g, ' ').trim();
                clientStatements.push(whole);
                // The runner holds the migration lock and reads the ledger through this connection (docs/13 R2-22).
                if (whole.includes('pg_try_advisory_lock')) {
                  return { rows: [{ locked: true }], rowCount: 1 };
                }
                if (whole.includes('to_regclass')) {
                  return { rows: [{ present: ledgerExists }], rowCount: 1 };
                }
                if (whole.includes('information_schema.columns')) {
                  return { rows: [{ present: true }], rowCount: 1 };
                }
                if (whole === 'SELECT id FROM schema_migrations') {
                  return { rows: applied.map((id: string): { id: string } => ({ id })), rowCount: applied.length };
                }
                if (whole.startsWith('SELECT pg_advisory_unlock') || whole.startsWith('SELECT pg_try_advisory_lock') || whole.startsWith('INSERT INTO schema_migrations') || whole.startsWith('UPDATE schema_migrations')) {
                  return { rows: [], rowCount: 0 };
                }
                clientQueries.push(text.slice(0, 40).replace(/\s+/g, ' ').trim());
                return { rows: [], rowCount: 0 };
              },
            }),
        },
      },
    ],
  }).compile();
  return { runner: moduleRef.get(MigrationRunner), queries, clientQueries, clientStatements };
}

describe('MigrationRunner', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  describe('stale-build safeguard', () => {
    it('reports migrations the database has that this build does not ship', async () => {
      const { runner } = await build([...shipped, '999_from_a_newer_build.sql']);
      await expect(runner.status()).resolves.toEqual({ pending: [], unknown: ['999_from_a_newer_build.sql'] });
    });

    it('refuses to start when the database is ahead of the code', async () => {
      const { runner } = await build([...shipped, '999_from_a_newer_build.sql']);
      await expect(runner.onModuleInit()).rejects.toThrow('999_from_a_newer_build.sql');
    });

    it('starts normally when the database matches this build', async () => {
      const { runner } = await build(shipped);
      await expect(runner.onModuleInit()).resolves.toBeUndefined();
      runner.onModuleDestroy();
    });
  });

  describe('which connection changes the schema', () => {
    it('applies nothing, and never runs DDL, when nothing is pending (the least-privilege role can start)', async () => {
      const { runner, queries, clientQueries } = await build(shipped);

      await runner.runPending();

      expect(clientQueries).toEqual([]);
      expect(queries.some((text: string): boolean => text.includes('CREATE TABLE'))).toBe(false);
    });

    it('in development with one URL, applies pending files on that connection and locks the ledger down', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.MIGRATION_DATABASE_URL;
      const { runner, clientQueries, clientStatements } = await build(shipped.slice(0, 2));

      await runner.runPending();

      expect(clientStatements.some((text: string): boolean => text.startsWith('CREATE TABLE IF NOT EXISTS schema_migrations'))).toBe(true);
      expect(clientStatements.some((text: string): boolean => text.includes('REVOKE INSERT, UPDATE, DELETE, TRUNCATE') && text.includes('"resort_app"'))).toBe(true);
      // One run holds the migration lock from the first file to the last, and lets go of it.
      expect(clientStatements.filter((text: string): boolean => text.includes('pg_try_advisory_lock'))).toHaveLength(1);
      expect(clientStatements.filter((text: string): boolean => text.includes('pg_advisory_unlock'))).toHaveLength(1);
      expect(clientQueries.filter((text: string): boolean => text === 'BEGIN')).toHaveLength(shipped.length - 2);
      expect(clientQueries.filter((text: string): boolean => text === 'COMMIT')).toHaveLength(shipped.length - 2);
    });

    it('treats a database without a ledger as everything pending', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.MIGRATION_DATABASE_URL;
      const { runner, clientQueries } = await build([], false);

      await runner.runPending();

      expect(clientQueries.filter((text: string): boolean => text === 'COMMIT')).toHaveLength(shipped.length);
    });

    it('does not apply migrations at start when RUN_MIGRATIONS_ON_START=false, but still checks for a stale build', async () => {
      process.env.RUN_MIGRATIONS_ON_START = 'false';
      const { runner, clientQueries } = await build(shipped.slice(0, 2));

      await expect(runner.onModuleInit()).resolves.toBeUndefined();

      expect(clientQueries).toEqual([]);
      runner.onModuleDestroy();
    });

    it('never applies migrations at start in production unless asked to', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.RUN_MIGRATIONS_ON_START;
      const { runner, clientQueries } = await build(shipped.slice(0, 2));

      await runner.onModuleInit();

      expect(clientQueries).toEqual([]);
      runner.onModuleDestroy();
    });
  });
});
