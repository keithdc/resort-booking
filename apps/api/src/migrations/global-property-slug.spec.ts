/**
 * @file apps/api/src/migrations/global-property-slug.spec.ts
 * Migration 030: one public slug per property across the deployment, without losing any data.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sql = readFileSync(join(__dirname, '030_global_property_slug.sql'), 'utf8');
const code = sql.replace(/^\s*--.*$/gm, '');

describe('030_global_property_slug.sql', () => {
  it('never drops, truncates or deletes data', () => {
    expect(code).not.toMatch(/\bDROP\b|\bDELETE\s+FROM\b|\bTRUNCATE\b/i);
  });

  it('makes slugs globally unique, ignoring case, with a replayable index', () => {
    expect(code).toContain('CREATE UNIQUE INDEX IF NOT EXISTS properties_slug_lower_key ON properties (lower(slug))');
  });

  it('settles existing duplicates deterministically (oldest keeps it) before creating the index', () => {
    expect(code).toContain('PARTITION BY lower(slug) ORDER BY created_at ASC, id ASC');
    expect(code).toContain('place > 1');
    expect(code).toContain('RAISE NOTICE');
    expect(code.indexOf('UPDATE properties')).toBeLessThan(code.indexOf('CREATE UNIQUE INDEX'));
  });

  it('only renames slugs, nothing else', () => {
    expect(code.match(/UPDATE properties SET (\w+)/g)).toEqual(['UPDATE properties SET slug']);
  });
});
