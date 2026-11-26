/**
 * @file apps/admin/src/features/reporting/utils/report-range.test.ts
 * @feature reporting
 */

import { describe, expect, it } from 'vitest';
import {
  customRange,
  describePeriod,
  describePreset,
  isRangePreset,
  MAX_CUSTOM_RANGE_DAYS,
  periodNights,
  rangeFromPreset,
  REPORT_RANGE_OPTIONS,
  shiftIso,
} from './report-range';

const NOW = new Date(2027, 6, 15, 14, 30); // 15 Jul 2027, local

describe('rangeFromPreset', () => {
  it('this month runs from the 1st to the 1st of next month', () => {
    expect(rangeFromPreset('this_month', NOW)).toEqual({ from: '2027-07-01', to: '2027-08-01' });
  });

  it('last month is the whole previous month, across a year boundary too', () => {
    expect(rangeFromPreset('last_month', NOW)).toEqual({ from: '2027-06-01', to: '2027-07-01' });
    expect(rangeFromPreset('last_month', new Date(2027, 0, 5))).toEqual({ from: '2026-12-01', to: '2027-01-01' });
  });

  it('this month in December ends on 1 January', () => {
    expect(rangeFromPreset('this_month', new Date(2027, 11, 20))).toEqual({ from: '2027-12-01', to: '2028-01-01' });
  });

  it('next 30 days starts today and covers 30 nights', () => {
    const range = rangeFromPreset('next_30', NOW);
    expect(range).toEqual({ from: '2027-07-15', to: '2027-08-14' });
    expect(periodNights(range.from, range.to)).toBe(30);
  });

  it('this year covers January to December', () => {
    expect(rangeFromPreset('this_year', NOW)).toEqual({ from: '2027-01-01', to: '2028-01-01' });
  });
});

describe('customRange', () => {
  it('makes the last day inclusive by moving the API end one day on', () => {
    expect(customRange('2027-07-01', '2027-07-31')).toEqual({ range: { from: '2027-07-01', to: '2027-08-01' }, problem: null });
  });

  it('accepts a single day', () => {
    expect(customRange('2027-07-04', '2027-07-04')).toEqual({ range: { from: '2027-07-04', to: '2027-07-05' }, problem: null });
  });

  it('explains missing days, a reversed range and a range that is too long', () => {
    expect(customRange('', '2027-07-04').problem).toMatch(/first and a last day/);
    expect(customRange('2027-07-05', '2027-07-04').problem).toMatch(/before the first day/);
    expect(customRange('2026-01-01', '2027-12-31').problem).toContain(String(MAX_CUSTOM_RANGE_DAYS));
  });
});

describe('describePeriod', () => {
  it('shows an inclusive range and drops the first year when it is the same', () => {
    expect(describePeriod('2027-07-01', '2027-08-01')).toBe('1 Jul – 31 Jul 2027');
  });

  it('keeps both years across a year boundary', () => {
    expect(describePeriod('2026-12-20', '2027-01-05')).toBe('20 Dec 2026 – 4 Jan 2027');
  });

  it('shows one date for a one-day period', () => {
    expect(describePeriod('2027-07-04', '2027-07-05')).toBe('4 Jul 2027');
  });
});

describe('helpers', () => {
  it('shifts dates over month and leap-year ends', () => {
    expect(shiftIso('2028-02-28', 1)).toBe('2028-02-29');
    expect(shiftIso('2027-03-01', -1)).toBe('2027-02-28');
  });

  it('knows its presets', () => {
    expect(isRangePreset('this_month')).toBe(true);
    expect(isRangePreset('custom')).toBe(true);
    expect(isRangePreset('last_90')).toBe(false);
    expect(REPORT_RANGE_OPTIONS).toHaveLength(12);
    expect(REPORT_RANGE_OPTIONS.map((option) => option.value)).toContain('last_quarter');
    expect(new Set(REPORT_RANGE_OPTIONS.map((option) => option.value)).size).toBe(12);
  });
});

describe('day, week, quarter and year presets (NOW is Thursday 15 Jul 2027)', () => {
  it('today is one day', () => {
    expect(rangeFromPreset('today', NOW)).toEqual({ from: '2027-07-15', to: '2027-07-16' });
  });

  it('this week runs Monday to Sunday and last week is the one before', () => {
    expect(rangeFromPreset('this_week', NOW)).toEqual({ from: '2027-07-12', to: '2027-07-19' });
    expect(rangeFromPreset('last_week', NOW)).toEqual({ from: '2027-07-05', to: '2027-07-12' });
  });

  it('puts Sunday at the end of its week, not the start of the next', () => {
    const sunday = new Date(2027, 6, 18, 9);
    expect(rangeFromPreset('this_week', sunday)).toEqual({ from: '2027-07-12', to: '2027-07-19' });
    const monday = new Date(2027, 6, 19, 9);
    expect(rangeFromPreset('this_week', monday)).toEqual({ from: '2027-07-19', to: '2027-07-26' });
    expect(rangeFromPreset('last_week', monday)).toEqual({ from: '2027-07-12', to: '2027-07-19' });
  });

  it('last 30 days ends today and is 30 days long', () => {
    const range = rangeFromPreset('last_30', NOW);
    expect(range).toEqual({ from: '2027-06-16', to: '2027-07-16' });
    expect(periodNights(range.from, range.to)).toBe(30);
  });

  it('this and last quarter are three calendar months', () => {
    expect(rangeFromPreset('this_quarter', NOW)).toEqual({ from: '2027-07-01', to: '2027-10-01' });
    expect(rangeFromPreset('last_quarter', NOW)).toEqual({ from: '2027-04-01', to: '2027-07-01' });
  });

  it('last quarter in the first quarter is the previous year\'s fourth', () => {
    const february = new Date(2027, 1, 10);
    expect(rangeFromPreset('this_quarter', february)).toEqual({ from: '2027-01-01', to: '2027-04-01' });
    expect(rangeFromPreset('last_quarter', february)).toEqual({ from: '2026-10-01', to: '2027-01-01' });
    expect(rangeFromPreset('this_quarter', new Date(2027, 11, 31))).toEqual({ from: '2027-10-01', to: '2028-01-01' });
  });

  it('last year is the whole previous year', () => {
    expect(rangeFromPreset('last_year', NOW)).toEqual({ from: '2026-01-01', to: '2027-01-01' });
  });

  it('describes a preset by the dates it covers, and nothing for custom', () => {
    expect(describePreset('today', NOW)).toBe('15 Jul 2027');
    expect(describePreset('this_week', NOW)).toBe('12 Jul – 18 Jul 2027');
    expect(describePreset('last_quarter', NOW)).toBe('1 Apr – 30 Jun 2027');
    expect(describePreset('last_year', NOW)).toBe('1 Jan – 31 Dec 2026');
    expect(describePreset('custom', NOW)).toBe('');
  });
});

describe('every period stays inside the API cap (400 nights, R2-03)', () => {
  it.each([2023, 2024, 2027, 2028])('no preset asks for more than 400 nights in %i, on any day of the year', (year) => {
    const presets = REPORT_RANGE_OPTIONS.filter((option) => option.value !== 'custom');
    for (let dayOfYear = 0; dayOfYear < 366; dayOfYear += 1) {
      const now = new Date(year, 0, 1 + dayOfYear);
      for (const option of presets) {
        if (option.value !== 'custom') {
          const { from, to } = rangeFromPreset(option.value, now);
          expect(periodNights(from, to)).toBeLessThanOrEqual(400);
        }
      }
    }
  });

  it('a custom period is capped at the same number', () => {
    expect(MAX_CUSTOM_RANGE_DAYS).toBe(400);
  });
});
