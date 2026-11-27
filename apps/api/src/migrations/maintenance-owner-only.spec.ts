/**
 * @file apps/api/src/migrations/maintenance-owner-only.spec.ts
 * Migration 044 (the maintenance switch works only for the table owner): no data touched, owner read from the catalog.
 * The behaviour against a real database is in maintenance-owner-only.integration.spec.ts (opt-in).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sql = readFileSync(join(__dirname, '044_maintenance_owner_only.sql'), 'utf8').replace(/^\s*--.*$/gm, '');

describe('044_maintenance_owner_only.sql', () => {
  it('touches no rows and drops nothing', () => {
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b|\bTRUNCATE\b|\bUPDATE\s+\w+\s+SET\b|\bDROP\s+(TABLE|COLUMN)\b/i);
  });

  it('decides from the catalog, not from a hard-coded role name', () => {
    expect(sql).toContain("pg_has_role(current_user, (SELECT relowner FROM pg_class WHERE oid = guarded), 'MEMBER')");
    expect(sql).not.toMatch(/resort_owner|resort_app/);
  });

  it('is a plain function (not SECURITY DEFINER) so current_user is the caller', () => {
    expect(sql).not.toMatch(/SECURITY\s+DEFINER/i);
  });

  it('rewrites every guard that mentions the switch, and is replayable', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION resort_maintenance_allowed');
    expect(sql).toContain("position(old_check IN p.prosrc) > 0");
  });
});
