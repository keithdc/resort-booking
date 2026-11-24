/**
 * @file apps/web/src/shared/utils/iso-date-text.test.ts
 * @shared Calendar-date arithmetic and wording
 */

import { describe, expect, it } from 'vitest';
import { formatDayMonth, formatDayMonthYear, isRealIsoDate, shiftIsoDate } from './iso-date-text';

describe('isRealIsoDate', () => {
  it('accepts real dates, including 29 February in a leap year', () => {
    expect(isRealIsoDate('2026-12-03')).toBe(true);
    expect(isRealIsoDate('2028-02-29')).toBe(true);
  });

  it('rejects impossible and malformed dates', () => {
    expect(isRealIsoDate('2027-02-29')).toBe(false);
    expect(isRealIsoDate('2027-13-01')).toBe(false);
    expect(isRealIsoDate('2027-1-1')).toBe(false);
    expect(isRealIsoDate('')).toBe(false);
  });
});

describe('shiftIsoDate', () => {
  it('goes back across a month boundary', () => {
    expect(shiftIsoDate('2026-12-03', -7)).toBe('2026-11-26');
  });

  it('goes back across a year boundary', () => {
    expect(shiftIsoDate('2027-01-02', -7)).toBe('2026-12-26');
  });

  it('handles leap days', () => {
    expect(shiftIsoDate('2028-03-01', -1)).toBe('2028-02-29');
    expect(shiftIsoDate('2027-03-01', -1)).toBe('2027-02-28');
  });

  it('is not moved by daylight-saving changes', () => {
    expect(shiftIsoDate('2026-03-30', -3)).toBe('2026-03-27');
    expect(shiftIsoDate('2026-10-27', -3)).toBe('2026-10-24');
  });

  it('shifts by zero and forward', () => {
    expect(shiftIsoDate('2026-12-03', 0)).toBe('2026-12-03');
    expect(shiftIsoDate('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('returns null for a value that is not a date', () => {
    expect(shiftIsoDate('soon', -1)).toBeNull();
  });
});

describe('formatting', () => {
  it('words a date with the year', () => {
    expect(formatDayMonthYear('2026-12-03')).toBe('3 Dec 2026');
  });

  it('words a date without the year', () => {
    expect(formatDayMonth('2026-07-10')).toBe('10 Jul');
  });

  it('returns an empty string for junk', () => {
    expect(formatDayMonthYear('nope')).toBe('');
    expect(formatDayMonth('nope')).toBe('');
  });
});
