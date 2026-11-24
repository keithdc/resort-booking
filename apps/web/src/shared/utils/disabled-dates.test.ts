/**
 * @file apps/web/src/shared/utils/disabled-dates.test.ts
 * @shared Picker helpers over API ranges
 */

import { describe, expect, it } from 'vitest';
import { isCheckInDisabled, isDayUnavailable, maxNightsFor } from './disabled-dates';

const RANGES = [{ startDate: '2027-06-10', endDate: '2027-06-14' }];

describe('isDayUnavailable', (): void => {
  it('disables every occupied night', (): void => {
    expect(isDayUnavailable(RANGES, '2027-06-10')).toBe(true);
    expect(isDayUnavailable(RANGES, '2027-06-13')).toBe(true);
  });

  it('keeps the check-out day and the days around the stay pickable', (): void => {
    expect(isDayUnavailable(RANGES, '2027-06-14')).toBe(false);
    expect(isDayUnavailable(RANGES, '2027-06-09')).toBe(false);
  });

  it('disables nothing when the API sent no ranges', (): void => {
    expect(isDayUnavailable([], '2027-06-10')).toBe(false);
  });

  it('checks every range', (): void => {
    const many = [...RANGES, { startDate: '2027-07-01', endDate: '2027-07-03' }];
    expect(isDayUnavailable(many, '2027-07-02')).toBe(true);
    expect(isDayUnavailable(many, '2027-06-20')).toBe(false);
  });
});

describe('isCheckInDisabled', (): void => {
  it('disables past days but not today', (): void => {
    expect(isCheckInDisabled([], '2027-06-09', '2027-06-10')).toBe(true);
    expect(isCheckInDisabled([], '2027-06-10', '2027-06-10')).toBe(false);
  });

  it('disables booked days even when they are in the future', (): void => {
    expect(isCheckInDisabled(RANGES, '2027-06-11', '2027-06-01')).toBe(true);
    expect(isCheckInDisabled(RANGES, '2027-06-14', '2027-06-01')).toBe(false);
  });
});

describe('maxNightsFor', (): void => {
  it('counts nights up to the latest check-out', (): void => {
    expect(maxNightsFor('2027-06-05', '2027-06-10')).toBe(5);
  });

  it('returns null when the API sent no limit', (): void => {
    expect(maxNightsFor('2027-06-05', null)).toBeNull();
  });

  it('returns 0 when the limit is not after the check-in or a date is unreadable', (): void => {
    expect(maxNightsFor('2027-06-10', '2027-06-10')).toBe(0);
    expect(maxNightsFor('bad', '2027-06-10')).toBe(0);
  });

  it('counts across a daylight-saving change as whole nights', (): void => {
    expect(maxNightsFor('2027-03-27', '2027-03-30')).toBe(3);
  });
});
