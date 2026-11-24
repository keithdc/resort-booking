/**
 * @file apps/admin/src/features/reservations/utils/dates.test.ts
 * @feature reservations
 */

import { describe, expect, it } from 'vitest';
import { addDaysIso, clampNights, nightsBetween, todayLocalIso } from './dates';

describe('addDaysIso', () => {
  it('adds days across month and year ends', () => {
    expect(addDaysIso('2027-01-31', 1)).toBe('2027-02-01');
    expect(addDaysIso('2027-12-30', 3)).toBe('2028-01-02');
  });

  it('handles a leap day', () => {
    expect(addDaysIso('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('returns unreadable input unchanged', () => {
    expect(addDaysIso('soon', 2)).toBe('soon');
  });
});

describe('nightsBetween', () => {
  it('counts nights', () => {
    expect(nightsBetween('2027-07-10', '2027-07-13')).toBe(3);
  });

  it('counts an inverted, equal or unreadable range as one night', () => {
    expect(nightsBetween('2027-07-13', '2027-07-10')).toBe(1);
    expect(nightsBetween('2027-07-10', '2027-07-10')).toBe(1);
    expect(nightsBetween('x', 'y')).toBe(1);
  });
});

describe('clampNights', () => {
  it('keeps whole numbers from 1 to 60 and fixes the rest', () => {
    expect(clampNights(3)).toBe(3);
    expect(clampNights(0)).toBe(1);
    expect(clampNights(-4)).toBe(1);
    expect(clampNights(2.5)).toBe(1);
    expect(clampNights(Number.NaN)).toBe(1);
    expect(clampNights(61)).toBe(60);
  });
});

describe('todayLocalIso', () => {
  it('pads month and day', () => {
    expect(todayLocalIso(new Date(2027, 0, 5))).toBe('2027-01-05');
    expect(todayLocalIso(new Date(2027, 10, 24))).toBe('2027-11-24');
  });
});
