/**
 * @file apps/admin/src/features/account/utils/device-time.test.ts
 * @feature account
 */

import { describe, expect, it } from 'vitest';
import { describeLastActive, describeSignedIn } from './device-time';

const NOW = Date.parse('2026-11-26T12:00:00Z');
const ago = (ms: number): string => new Date(NOW - ms).toISOString();

describe('describeLastActive', () => {
  it('says "just now" for the last two minutes, then minutes, then hours', () => {
    expect(describeLastActive(ago(30_000), NOW)).toBe('just now');
    expect(describeLastActive(ago(5 * 60_000), NOW)).toBe('5 minutes ago');
    expect(describeLastActive(ago(60 * 60_000), NOW)).toBe('1 hour ago');
    expect(describeLastActive(ago(3 * 3_600_000), NOW)).toBe('3 hours ago');
  });

  it('falls back to a date after a day, and never shows a negative age', () => {
    expect(describeLastActive(ago(3 * 24 * 3_600_000), NOW)).toMatch(/2026/);
    expect(describeLastActive(new Date(NOW + 60_000).toISOString(), NOW)).toBe('just now');
  });

  it('answers "Unknown" for junk', () => {
    expect(describeLastActive('not a date', NOW)).toBe('Unknown');
    expect(describeSignedIn('not a date')).toBe('Unknown');
  });
});

describe('describeSignedIn', () => {
  it('formats a real time', () => {
    expect(describeSignedIn('2026-11-26T09:14:00Z')).toMatch(/\d/);
  });
});
