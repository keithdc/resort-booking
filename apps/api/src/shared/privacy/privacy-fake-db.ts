/**
 * @file apps/api/src/shared/privacy/privacy-fake-db.ts
 * @shared A fake PrivacyDb for unit tests: records every transaction and statement, answers from a script
 * @dependencies privacy-db (types only)
 */

import type { QueryResultRow } from 'pg';
import type { PrivacyDb, PrivacyResult, PrivacyTx, TransactionOptions } from './privacy-db';

export interface RecordedStatement {
  text: string;
  params: readonly unknown[];
}

export interface RecordedTransaction {
  options: TransactionOptions;
  statements: RecordedStatement[];
  committed: boolean;
}

/** Decides the rows for a statement; return undefined for "no rows". */
export type Responder = (statement: RecordedStatement, transaction: RecordedTransaction) => Record<string, unknown>[] | undefined;

export interface FakePrivacyDb extends PrivacyDb {
  transactions: RecordedTransaction[];
}

/**
 * Builds the fake. A throw inside the callback marks the transaction as rolled back (committed stays false).
 */
export function fakePrivacyDb(responder: Responder = (): undefined => undefined): FakePrivacyDb {
  const transactions: RecordedTransaction[] = [];
  return {
    transactions,
    transaction: async <T>(fn: (tx: PrivacyTx) => Promise<T>, options: TransactionOptions = {}): Promise<T> => {
      const transaction: RecordedTransaction = { options, statements: [], committed: false };
      transactions.push(transaction);
      const tx: PrivacyTx = {
        query: <R extends QueryResultRow = QueryResultRow>(text: string, params: readonly unknown[] = []): Promise<PrivacyResult<R>> => {
          const statement: RecordedStatement = { text, params };
          transaction.statements.push(statement);
          const rows = responder(statement, transaction) ?? [];
          return Promise.resolve({ rows: rows as R[], rowCount: rows.length });
        },
      };
      const result = await fn(tx);
      transaction.committed = true;
      return result;
    },
  };
}
