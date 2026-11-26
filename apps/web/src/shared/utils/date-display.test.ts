/**
 * @file apps/web/src/shared/utils/date-display.test.ts
 * @shared Date field text
 */

import { describe, expect, it } from 'vitest';
import { formatDateForField, formatShortDate, summarizeStaySearch } from './date-display';

describe('formatDateForField', () => {
  it('shows an ISO date the way the field does', () => {
    expect(formatDateForField('2027-07-10')).toBe('10/07/2027');
    expect(formatDateForField('2026-12-01')).toBe('01/12/2026');
  });

  it('shows nothing for an empty or malformed value', () => {
    expect(formatDateForField('')).toBe('');
    expect(formatDateForField('10/07/2027')).toBe('');
    expect(formatDateForField('2027-7-1')).toBe('');
    expect(formatDateForField('soon')).toBe('');
  });
});

describe('formatShortDate', () => {
  it('writes day and month', () => {
    expect(formatShortDate('2026-12-10')).toBe('10 Dec');
    expect(formatShortDate('2027-01-05')).toBe('5 Jan');
  });

  it('returns anything that is not a date unchanged', () => {
    expect(formatShortDate('')).toBe('');
    expect(formatShortDate('soon')).toBe('soon');
    expect(formatShortDate('2026-13-01')).toBe('2026-13-01');
  });
});

describe('summarizeStaySearch', () => {
  it('joins the dates and the guest count', () => {
    expect(summarizeStaySearch('2026-12-10', '2026-12-12', '2')).toBe('10 Dec – 12 Dec · 2 guests');
  });

  it('uses the singular for one guest and a safe word for a bad count', () => {
    expect(summarizeStaySearch('2026-12-10', '2026-12-11', '1')).toBe('10 Dec – 11 Dec · 1 guest');
    expect(summarizeStaySearch('2026-12-10', '2026-12-11', '')).toBe('10 Dec – 11 Dec · Guests');
  });
});
