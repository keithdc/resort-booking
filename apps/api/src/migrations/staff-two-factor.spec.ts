/**
 * @file apps/api/src/migrations/staff-two-factor.spec.ts
 * Migration 029: additive, replayable, and it never stores a readable secret, code or token.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sql = readFileSync(join(__dirname, '029_staff_two_factor.sql'), 'utf8');
const code = sql.replace(/^\s*--.*$/gm, '');

describe('029_staff_two_factor.sql', () => {
  it('never drops, truncates or deletes data', () => {
    expect(code).not.toMatch(/\bDROP\b|\bDELETE\s+FROM\b|\bTRUNCATE\b/i);
  });

  it('can run twice: every statement is guarded', () => {
    const statements = code.split(';').map((part: string): string => part.trim()).filter((part: string): boolean => part !== '');
    expect(statements).toHaveLength(4);
    for (const statement of statements) {
      expect(statement).toMatch(/IF NOT EXISTS/);
    }
  });

  it('stores the secret encrypted, the recovery codes hashed and the replay step', () => {
    expect(code).toContain('secret_encrypted text NOT NULL');
    expect(code).toContain('recovery_code_hashes text[]');
    expect(code).toContain('last_used_step bigint');
    expect(code).toContain('cardinality(recovery_code_hashes) <= 10');
    expect(code).not.toMatch(/\bsecret text\b|\bcode text\b/);
  });

  it('keeps only the hash of a challenge token, and removes rows with their person', () => {
    expect(code).toContain('token_hash text NOT NULL UNIQUE');
    expect(code).not.toMatch(/\btoken text\b/);
    expect(code.match(/ON DELETE CASCADE/g)).toHaveLength(2);
  });
});
