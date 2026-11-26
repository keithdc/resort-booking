/**
 * @file apps/api/src/migrations/staff-session-hygiene.spec.ts
 * Migration 039: additive, replayable, and it never stores a raw User-Agent or IP.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sql = readFileSync(join(__dirname, '039_staff_session_hygiene.sql'), 'utf8');
const code = sql.replace(/^\s*--.*$/gm, '');

describe('039_staff_session_hygiene.sql', () => {
  it('never drops, truncates or deletes data', () => {
    expect(code).not.toMatch(/\bDROP\b|\bDELETE\s+FROM\b|\bTRUNCATE\b/i);
  });

  it('can run twice: every column and index is guarded', () => {
    const statements = code.split(';').map((part: string): string => part.trim()).filter((part: string): boolean => part !== '');
    expect(statements).toHaveLength(2);
    expect(code.match(/ADD COLUMN IF NOT EXISTS/g)).toHaveLength(3);
    expect(code).toContain('CREATE INDEX IF NOT EXISTS');
  });

  it('keeps a label and a hash, never the raw User-Agent or IP', () => {
    expect(code).toContain('device_label text');
    expect(code).toContain('created_ip_hash text');
    expect(code).not.toMatch(/\buser_agent\b|\bip text\b|\bip_address\b/);
  });

  it('existing sessions start "just used", so the migration signs nobody out', () => {
    expect(code).toContain('last_used_at timestamptz NOT NULL DEFAULT now()');
  });
});
