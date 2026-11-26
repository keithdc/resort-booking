/**
 * @file apps/api/src/migrations/financial-record-guards.spec.ts
 * Migrations 032 to 034: the append-only triggers, the refund lease columns and the webhook table (static checks;
 * the behaviour is proven against a real Postgres by shared/database/database-roles.integration.spec.ts).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function read(name: string): { sql: string; code: string } {
  const sql = readFileSync(join(__dirname, name), 'utf8');
  return { sql, code: sql.replace(/^\s*--.*$/gm, '') };
}

describe('032_financial_record_guards.sql', () => {
  const { code } = read('032_financial_record_guards.sql');

  it('never reads, rewrites or deletes data', () => {
    expect(code).not.toMatch(/\bDELETE\s+FROM\b|\bTRUNCATE\s+TABLE\b/i);
    expect(code).not.toMatch(/\bINSERT\s+INTO\b|\bUPDATE\s+\w+\s+SET\b/i);
    expect(code).not.toMatch(/\bDROP\s+(TABLE|COLUMN|FUNCTION)\b/i);
  });

  it('can run twice: functions are replaced and every trigger is dropped before it is created', () => {
    const creates = code.match(/CREATE TRIGGER (\w+)/g) ?? [];
    expect(creates).toHaveLength(8);
    for (const create of creates) {
      const name = create.replace('CREATE TRIGGER ', '');
      expect(code).toContain(`DROP TRIGGER IF EXISTS ${name} ON`);
    }
    expect(code.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(4);
    expect(code).not.toMatch(/CREATE FUNCTION/);
  });

  it('blocks update, delete and truncate of the audit log, with the staff-account foreign key as the only exception', () => {
    expect(code).toContain('CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log');
    expect(code).toContain('CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log');
    expect(code).toContain("(to_jsonb(NEW) - 'staff_user_id') = (to_jsonb(OLD) - 'staff_user_id')");
  });

  it('has a transaction-local escape hatch for retention jobs and no other bypass', () => {
    expect(code.match(/resort\.record_maintenance/g)?.length).toBeGreaterThanOrEqual(4);
    expect(code).not.toMatch(/session_user|current_user/);
  });

  it('keeps amount, currency and links of a payment fixed, and only lets a succeeded payment change its booking', () => {
    for (const column of ['amount_cents', 'currency_code', 'provider_ref', 'provider', 'organization_id', 'purpose']) {
      expect(code).toContain(`NEW.${column} IS DISTINCT FROM OLD.${column}`);
    }
    expect(code).toContain("OLD.status = 'succeeded' AND NEW.status = 'succeeded'");
  });

  it('allows only the legal payment and refund status moves', () => {
    expect(code).toContain("OLD.status = 'requires_payment' AND NEW.status IN ('succeeded', 'failed', 'cancelled')");
    expect(code).toContain("OLD.status IN ('failed', 'cancelled') AND NEW.status = 'succeeded'");
    expect(code).toContain("OLD.status = 'pending' AND NEW.status IN ('succeeded', 'failed')");
    expect(code).toContain("OLD.status = 'failed' AND NEW.status IN ('pending', 'succeeded')");
    expect(code).toContain("OLD.status = 'succeeded' AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD)");
  });

  it('keeps the refund amount, links and reason fixed and lets the provider change only to manual', () => {
    for (const column of ['amount_cents', 'currency_code', 'inventory_block_id', 'payment_id', 'kind', 'reason_code']) {
      expect(code).toContain(`NEW.${column} IS DISTINCT FROM OLD.${column}`);
    }
    expect(code).toContain("NEW.provider <> 'manual'");
  });

  it('makes booking_changes append-only', () => {
    expect(code).toContain('CREATE TRIGGER booking_changes_append_only BEFORE UPDATE OR DELETE ON booking_changes');
  });
});

describe('033_refund_lease_and_late_payments.sql', () => {
  const { code } = read('033_refund_lease_and_late_payments.sql');

  it('only adds columns with defaults and widens two constraints', () => {
    expect(code).not.toMatch(/\bDELETE\s+FROM\b|\bTRUNCATE\b|\bDROP\s+(TABLE|COLUMN)\b/i);
    expect(code).toContain('ADD COLUMN IF NOT EXISTS processing_started_at timestamptz');
    expect(code).toContain('ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0');
    expect(code).toContain('ADD COLUMN IF NOT EXISTS key_generation integer NOT NULL DEFAULT 1');
    expect(code).toContain("'cancellation', 'rebook_difference', 'late_payment'");
    expect(code).toContain("'dates_changed', 'late_payment'");
  });

  it('can run twice', () => {
    expect(code).toContain('DROP CONSTRAINT IF EXISTS refunds_kind_check');
    expect(code).toContain('DROP CONSTRAINT IF EXISTS refunds_reason_code_check');
    expect(code).toContain('CREATE INDEX IF NOT EXISTS');
  });
});

describe('034_payment_webhook_events.sql', () => {
  const { code } = read('034_payment_webhook_events.sql');

  it('is unique per provider and event id, and keeps a hash, never the body or card data', () => {
    expect(code).toContain('UNIQUE (provider, provider_event_id)');
    expect(code).toContain('payload_sha256 text NOT NULL');
    expect(code).not.toMatch(/\bpayload (jsonb|text)\b|\bbody\b|\bcard\b|\bsignature\b|\bsecret\b/i);
  });

  it('knows the four event states and can run twice', () => {
    expect(code).toContain("CHECK (status IN ('received', 'processed', 'ignored', 'failed'))");
    expect(code).toContain('CREATE TABLE IF NOT EXISTS payment_webhook_events');
    expect(code).toContain('CREATE INDEX IF NOT EXISTS');
  });
});
