/**
 * @file apps/admin/src/shared/utils/safe-redirect.test.ts
 * @shared Post-login redirect safety
 */

import { describe, expect, it } from 'vitest';
import { safeRedirectTarget } from './safe-redirect';

describe('safeRedirectTarget', () => {
  it.each(['/', '/%0a-encoded-is-fine', '/reports', '/reports?tab=bookings', '/properties/abc/edit#rates', '/a/b/c'])('keeps the same-site path %s', (path) => {
    expect(safeRedirectTarget(path)).toBe(path);
  });

  it.each([
    '//evil.example',
    '//evil.example/path',
    '/\\evil.example',
    '/\\/evil.example',
    'https://evil.example',
    'http://evil.example/reports',
    'javascript:alert(1)',
    'data:text/html,hi',
    'evil.example',
    'reports',
    '/\t/evil.example',
    '/\n/evil.example',
    '/\r/evil.example',
    '/redirect:me',
    '/a\\b',
    ' /reports',
  ])('sends %j to the home page', (value) => {
    expect(safeRedirectTarget(value)).toBe('/');
  });

  it('allows a colon or backslash after the query starts', () => {
    expect(safeRedirectTarget('/reports?from=2026-11-01T00:00')).toBe('/reports?from=2026-11-01T00:00');
  });

  it('falls back for empty, missing and oversized values', () => {
    expect(safeRedirectTarget(null)).toBe('/');
    expect(safeRedirectTarget(undefined)).toBe('/');
    expect(safeRedirectTarget('')).toBe('/');
    expect(safeRedirectTarget(`/${'a'.repeat(2000)}`)).toBe('/');
  });
});
