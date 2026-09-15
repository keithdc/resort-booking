/**
 * @file apps/web/src/shared/utils/today-iso.test.ts
 * @shared Guest date helpers
 */

import { describe, expect, it } from 'vitest';
import { addDaysIsoDate, clampStayNights, nightsBetweenIso } from './today-iso';

describe('today-iso', (): void => {
  it('adds nights across a month boundary', (): void => {
    expect(addDaysIsoDate('2026-09-30', 2)).toBe('2026-10-02');
  });

  it('returns the original string when the date is unreadable', (): void => {
    expect(addDaysIsoDate('not-a-date', 2)).toBe('not-a-date');
  });

  it('treats inverted checkout as one night for the guest form only', (): void => {
    expect(nightsBetweenIso('2026-09-22', '2026-09-20')).toBe(1);
    expect(nightsBetweenIso('bad', 'also-bad')).toBe(1);
  });

  it('clamps nights to 1–30', (): void => {
    expect(clampStayNights(Number.NaN)).toBe(1);
    expect(clampStayNights(0)).toBe(1);
    expect(clampStayNights(-4)).toBe(1);
    expect(clampStayNights(1.2)).toBe(1);
    expect(clampStayNights(30)).toBe(30);
    expect(clampStayNights(31)).toBe(30);
  });
});
