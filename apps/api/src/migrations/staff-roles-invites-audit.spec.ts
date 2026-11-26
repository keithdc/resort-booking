/**
 * @file apps/api/src/migrations/staff-roles-invites-audit.spec.ts
 * Migration 028: additive, safe to replay, and it never stores secrets or readable IPs.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sql = readFileSync(join(__dirname, '028_staff_roles_invites_audit.sql'), 'utf8');
const code = sql.replace(/^\s*--.*$/gm, '');

describe('028_staff_roles_invites_audit.sql', () => {
  it('never drops, truncates or deletes data', () => {
    expect(code).not.toMatch(/\bDROP\b|\bDELETE\s+FROM\b|\bTRUNCATE\b/i);
  });

  it('makes everyone who exists today an admin, once: only inside the guard that adds the role column', () => {
    const updates = code.match(/UPDATE staff_users SET role = 'admin'/g) ?? [];
    expect(updates).toHaveLength(1);
    const guard = code.slice(code.indexOf('DO $$'), code.indexOf('END $$'));
    expect(guard).toContain("column_name = 'role'");
    expect(guard).toContain("UPDATE staff_users SET role = 'admin'");
  });

  it('defaults a new account to the safer role, and only allows the two roles', () => {
    expect(code).toContain("role text NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'employee'))");
    expect(code).toContain("role text NOT NULL CHECK (role IN ('admin', 'employee'))");
  });

  it('can run twice: every other statement is guarded', () => {
    const outsideGuard = code.slice(code.indexOf('END $$') + 'END $$;'.length);
    const statements = outsideGuard.split(';').map((part: string): string => part.trim()).filter((part: string): boolean => part !== '');
    for (const statement of statements) {
      expect(statement).toMatch(/IF NOT EXISTS|ADD COLUMN IF NOT EXISTS/);
    }
  });

  it('makes emails unique case-insensitively', () => {
    expect(code).toContain('ON staff_users (lower(email))');
    expect(code).toContain('CREATE UNIQUE INDEX IF NOT EXISTS staff_users_email_lower_key');
  });

  it('stores only a hash of an invitation token, unique, never the token', () => {
    expect(code).toContain('token_hash text NOT NULL UNIQUE');
    expect(code).not.toMatch(/\btoken\s+text/i);
  });

  it('allows one open invitation per email and organization, counting only unused, unrevoked ones', () => {
    expect(code).toContain('ON staff_invites (organization_id, lower(email))');
    expect(code).toContain('WHERE accepted_at IS NULL AND revoked_at IS NULL');
  });

  it('lets an access-reset invitation point at the account it resets', () => {
    expect(code).toContain('staff_user_id uuid REFERENCES staff_users (id) ON DELETE CASCADE');
  });

  it('keeps the audit log free of readable IPs, emails and secrets: an IP hash column and JSON metadata only', () => {
    const audit = code.slice(code.indexOf('CREATE TABLE IF NOT EXISTS audit_log'));
    expect(audit).toContain('ip_hash text');
    expect(audit).toContain("metadata jsonb NOT NULL DEFAULT '{}'::jsonb");
    expect(audit).not.toMatch(/\bip\s+(inet|text|varchar)/i);
    expect(audit).not.toMatch(/\bemail\b|password|token/i);
  });

  it('indexes the audit log for the organization\'s newest-first listing, and by action', () => {
    expect(code).toContain('ON audit_log (organization_id, created_at DESC, id DESC)');
    expect(code).toContain('ON audit_log (organization_id, action, created_at DESC)');
  });

  it('allows a null organization only for sign-in attempts that matched no account, and keeps rows when a person is removed', () => {
    expect(code).toContain('organization_id uuid REFERENCES organizations (id),');
    expect(code).toContain('staff_user_id uuid REFERENCES staff_users (id) ON DELETE SET NULL');
  });
});
