/**
 * @file apps/api/src/shared/privacy/privacy-db.ts
 * @shared The one way the privacy commands talk to Postgres: a transaction, optionally read-only, optionally with the maintenance switch
 * @dependencies pg
 */

import type { Pool, QueryResultRow } from 'pg';

/**
 * The documented escape hatch of the append-only guards (docs/11, migration 032). Transaction-local, so it cannot be
 * left on, and meaningless for a role without the privileges (resort_app).
 */
export const MAINTENANCE_SQL = "SET LOCAL resort.record_maintenance = 'on'";

export interface PrivacyResult<T> {
  rows: T[];
  rowCount: number;
}

/** What a statement inside a transaction can do. */
export interface PrivacyTx {
  query<T extends QueryResultRow = QueryResultRow>(text: string, params?: readonly unknown[]): Promise<PrivacyResult<T>>;
}

export interface TransactionOptions {
  /** A read-only transaction: a dry run can never change anything, whatever the SQL says. */
  readOnly?: boolean;
  /** Run `SET LOCAL resort.record_maintenance = 'on'` first (only for steps that touch an append-only table). */
  maintenance?: boolean;
}

/** One transaction at a time: `fn` runs between BEGIN and COMMIT, and any throw rolls back. */
export interface PrivacyDb {
  transaction<T>(fn: (tx: PrivacyTx) => Promise<T>, options?: TransactionOptions): Promise<T>;
}

/**
 * Adapts a pg pool. Each call takes its own connection, so a batch commits (or rolls back) on its own.
 */
export function poolPrivacyDb(pool: Pool): PrivacyDb {
  return {
    transaction: async <T>(fn: (tx: PrivacyTx) => Promise<T>, options: TransactionOptions = {}): Promise<T> => {
      const client = await pool.connect();
      try {
        await client.query(options.readOnly === true ? 'BEGIN READ ONLY' : 'BEGIN');
        try {
          if (options.maintenance === true) {
            await client.query(MAINTENANCE_SQL);
          }
          const result = await fn({
            query: async <R extends QueryResultRow = QueryResultRow>(text: string, params: readonly unknown[] = []): Promise<PrivacyResult<R>> => {
              const answer = await client.query<R>(text, [...params]);
              return { rows: answer.rows, rowCount: answer.rowCount ?? 0 };
            },
          });
          await client.query('COMMIT');
          return result;
        } catch (error: unknown) {
          await client.query('ROLLBACK');
          throw error;
        }
      } finally {
        client.release();
      }
    },
  };
}
