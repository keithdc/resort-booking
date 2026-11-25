/**
 * @file apps/admin/src/shared/utils/format-date.test.ts
 * @shared Staff date formatting
 */

import { describe, expect, it } from 'vitest';
import { formatIsoDate, formatShortDate } from './format-date';

describe('formatIsoDate', () => {
  it('formats a calendar date for staff', () => {
    expect(formatIsoDate('2027-07-01')).toBe('1 Jul 2027');
    expect(formatIsoDate('2026-12-31')).toBe('31 Dec 2026');
  });

  it('does not shift the day with the machine timezone', () => {
    expect(formatIsoDate('2027-03-28')).toBe('28 Mar 2027');
  });

  it('returns unreadable input unchanged', () => {
    expect(formatIsoDate('soon')).toBe('soon');
    expect(formatIsoDate('')).toBe('');
  });
});

describe('formatShortDate', () => {
  it('drops the year for dense rows and leaves bad input readable', () => {
    expect(formatShortDate('2026-11-25')).toBe('25 Nov');
    expect(formatShortDate('2027-01-01')).toBe('1 Jan');
    expect(formatShortDate('nonsense')).toBe('nonsense');
  });
});
