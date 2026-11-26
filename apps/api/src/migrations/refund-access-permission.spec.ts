/**
 * @file apps/api/src/migrations/refund-access-permission.spec.ts
 * Migration 031: the per-member refund permission is added without touching existing data.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sql = readFileSync(join(__dirname, '031_refund_access_permission.sql'), 'utf8');
const code = sql.replace(/^\s*--.*$/gm, '');

describe('031_refund_access_permission.sql', () => {
  it('never drops, deletes, truncates or rewrites rows', () => {
    expect(code).not.toMatch(/\bDROP\b|\bDELETE\s+FROM\b|\bTRUNCATE\b|\bUPDATE\b/i);
  });

  it('adds the flag to accounts and invitations, off by default, replayably', () => {
    const columns = code.match(/ADD COLUMN IF NOT EXISTS can_manage_refunds boolean NOT NULL DEFAULT false/g) ?? [];
    expect(columns).toHaveLength(2);
    expect(code).toContain('ALTER TABLE staff_users');
    expect(code).toContain('ALTER TABLE staff_invites');
  });
});
