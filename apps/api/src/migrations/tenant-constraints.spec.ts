/**
 * @file apps/api/src/migrations/tenant-constraints.spec.ts
 * Migrations 035 and 036 (docs/13 R2-21): the shape of the SQL. The behaviour against a real database is in
 * tenant-constraints.integration.spec.ts (opt-in).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (name: string): string => readFileSync(join(__dirname, name), 'utf8').replace(/^\s*--.*$/gm, '');
const checks = read('035_check_constraints.sql');
const keys = read('036_tenant_composite_foreign_keys.sql');

describe.each([
  ['035_check_constraints.sql', checks],
  ['036_tenant_composite_foreign_keys.sql', keys],
])('%s', (_name, code) => {
  it('never deletes, truncates or rewrites a row', () => {
    expect(code).not.toMatch(/\bDELETE\s+FROM\b|\bTRUNCATE\b|\bUPDATE\s+\w+\s+SET\b|\bDROP\s+(TABLE|COLUMN|CONSTRAINT)\b/i);
  });

  it('adds every constraint NOT VALID and validates it only when no row breaks it', () => {
    expect(code).toContain('NOT VALID');
    expect(code).toContain('IF broken = 0 THEN');
    expect(code).toContain('VALIDATE CONSTRAINT');
    expect(code).toContain('RAISE WARNING');
  });

  it('skips a constraint that already exists (replayable) and leaves no helper behind', () => {
    expect(code).toContain('FROM pg_constraint WHERE conrelid');
    expect(code).toMatch(/DROP FUNCTION resort_migration_add_(check|fk)\(/);
  });

  it('uses no temporary function (the roles have no TEMP right)', () => {
    expect(code).not.toMatch(/pg_temp/);
  });
});

describe('035 check constraints', () => {
  it.each([
    ['houses', 'houses_currency_format'],
    ['extra_services', 'extra_services_currency_format'],
    ['payments', 'payments_currency_format'],
    ['refunds', 'refunds_currency_format'],
    ['discount_redemptions', 'discount_redemptions_amount_nonneg'],
    ['booking_changes', 'booking_changes_old_stay_ordered'],
    ['booking_changes', 'booking_changes_new_stay_ordered'],
    ['properties', 'properties_slug_format'],
    ['houses', 'houses_slug_format'],
    ['properties', 'properties_country_code_format'],
    ['properties', 'properties_coordinates_range'],
  ])('covers %s with %s', (table, name) => {
    expect(checks).toContain(`('${table}', '${name}'`);
  });

  it('does not touch the tables other work owns', () => {
    expect(checks).not.toMatch(/'(inventory_blocks|staff_sessions|audit_log)'/);
  });
});

describe('036 composite foreign keys', () => {
  it.each([
    'houses',
    'property_photos',
    'property_request_options',
    'extra_services',
    'cancellation_tiers',
    'property_rebook_settings',
    'discounts',
    'rate_period_bulk_applications',
    'payments',
    'refunds',
    'booking_changes',
  ])('ties %s to the organization of its property', (table) => {
    expect(keys).toMatch(new RegExp(`add_fk\\('${table}', '\\w+', ARRAY\\['property_id', 'organization_id'\\], 'properties'`));
  });

  it.each(['house_photos', 'house_amenities', 'rate_periods'])('ties %s to the property AND organization of its house', (table) => {
    expect(keys).toMatch(new RegExp(`add_fk\\('${table}', '\\w+', ARRAY\\['house_id', 'property_id', 'organization_id'\\], 'houses'`));
  });

  it('ties refunds and booking changes to the organization of their payment', () => {
    expect(keys).toContain("add_fk('refunds', 'refunds_payment_organization_fkey', ARRAY['payment_id', 'organization_id'], 'payments'");
    expect(keys).toContain("add_fk('booking_changes', 'booking_changes_payment_organization_fkey', ARRAY['payment_id', 'organization_id'], 'payments'");
  });

  it('keeps every cascade the single-column keys had, so no delete that worked is blocked', () => {
    for (const table of ['property_request_options', 'extra_services', 'house_amenities', 'rate_periods']) {
      expect(keys).toMatch(new RegExp(`add_fk\\('${table}'[^;]*'CASCADE'\\)`));
    }
  });

  it('creates the unique indexes the keys point at', () => {
    expect(keys).toContain('ON properties (id, organization_id)');
    expect(keys).toContain('ON houses (id, property_id, organization_id)');
    expect(keys).toContain('ON payments (id, organization_id)');
  });

  it('does not touch the tables other work owns', () => {
    expect(keys).not.toMatch(/add_fk\('(inventory_blocks|staff_sessions|audit_log)'/);
    expect(keys).not.toMatch(/REFERENCES inventory_blocks/);
  });
});
