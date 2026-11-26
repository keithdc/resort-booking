/**
 * @file apps/api/src/migrations/privacy-retention.spec.ts
 * Migrations 037 and 038 must be additive and replayable: a column, indexes, one new append-only table.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const code = (file: string): string => readFileSync(join(__dirname, file), 'utf8').replace(/^\s*--.*$/gm, '');
const statements = (sql: string): string[] => sql.split(';').map((part: string): string => part.trim()).filter((part: string): boolean => part !== '');

describe('037_privacy_retention.sql', () => {
  const sql = code('037_privacy_retention.sql');

  it('only adds: no drops, deletes, updates, truncates or type changes', () => {
    expect(sql).not.toMatch(/DROP|DELETE|UPDATE|TRUNCATE|ALTER COLUMN/i);
  });

  it('is replayable: every statement is guarded with IF NOT EXISTS', () => {
    for (const statement of statements(sql)) {
      expect(statement).toContain('IF NOT EXISTS');
    }
  });

  it('adds the anonymised_at marker and partial indexes for the rows the job reads', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS anonymised_at timestamptz');
    expect(sql).toContain('WHERE anonymised_at IS NULL');
    expect(sql).toContain('lower(btrim(booker_email))');
  });
});

describe('038_privacy_erasure_ledger.sql', () => {
  const sql = code('038_privacy_erasure_ledger.sql');

  it('creates one new table and touches no existing data', () => {
    expect(sql).not.toMatch(/INSERT INTO|\bUPDATE\s+\w+\s+SET|DELETE FROM|ALTER TABLE/i);
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS privacy_erasure_ledger');
  });

  it('stores a hash, never an email', () => {
    expect(sql).toContain("subject_hash ~ '^[0-9a-f]{64}$'");
    expect(sql).not.toMatch(/\bemail\b/i);
  });

  it('is append-only for every role through the generic history guard, and replayable', () => {
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON privacy_erasure_ledger');
    expect(sql).toContain('BEFORE TRUNCATE ON privacy_erasure_ledger');
    expect(sql.match(/resort_guard_history/g)).toHaveLength(2);
    expect(sql.match(/DROP TRIGGER IF EXISTS/g)).toHaveLength(2);
  });
});
