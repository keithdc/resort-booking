/**
 * @file apps/api/src/migrations/hold-creator.spec.ts
 * Migration 026 must be additive and replayable: it only adds a column and two partial indexes.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sql = readFileSync(join(__dirname, '026_hold_creator.sql'), 'utf8');
const code = sql.replace(/^\s*--.*$/gm, '');

describe('026_hold_creator.sql', () => {
  it('only adds: no drops, deletes, updates or type changes', () => {
    expect(code).not.toMatch(/DROP|DELETE|UPDATE|TRUNCATE|ALTER COLUMN/i);
  });

  it('can run twice: every statement is guarded with IF NOT EXISTS', () => {
    const statements = code.split(';').map((part: string): string => part.trim()).filter((part: string): boolean => part !== '');

    expect(statements).toHaveLength(3);
    for (const statement of statements) {
      expect(statement).toContain('IF NOT EXISTS');
    }
  });

  it('stores a hash column, not an IP column', () => {
    expect(code).toContain('creator_ip_hash text');
    expect(code).not.toMatch(/\bip\s+(inet|text|varchar)/i);
  });

  it('indexes only live holds, which is all the cap query reads', () => {
    expect(code).toContain("WHERE kind = 'hold' AND status = 'active'");
    expect(code).toContain('lower(booker_email)');
  });
});
