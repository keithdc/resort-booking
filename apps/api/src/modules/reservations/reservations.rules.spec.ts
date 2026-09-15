/**
 * @file apps/api/src/modules/reservations/reservations.rules.spec.ts
 * @feature reservations
 * @dependencies reservations.rules
 */

import {
  eachIsoDate,
  hasInvertedRefundLadder,
  overlapNights,
  stayOccupiesDate,
  validateCancellationTiers,
} from './reservations.rules';

describe('reservations.rules', (): void => {
  it('treats checkout as exclusive', (): void => {
    expect(stayOccupiesDate('2026-09-20', '2026-09-23', '2026-09-20')).toBe(true);
    expect(stayOccupiesDate('2026-09-20', '2026-09-23', '2026-09-22')).toBe(true);
    expect(stayOccupiesDate('2026-09-20', '2026-09-23', '2026-09-23')).toBe(false);
  });

  it('lists each night in a range', (): void => {
    expect(eachIsoDate('2026-09-20', '2026-09-23')).toEqual([
      '2026-09-20',
      '2026-09-21',
      '2026-09-22',
    ]);
  });

  it('counts overlapping nights for reports', (): void => {
    expect(overlapNights('2026-09-10', '2026-09-20', '2026-09-15', '2026-09-18')).toBe(3);
  });

  it('requires a unique 0-day catch-all tier', (): void => {
    expect(validateCancellationTiers([{ minDaysBeforeCheckIn: 7, refundPercent: 100 }])).not.toBeNull();
    expect(
      validateCancellationTiers([
        { minDaysBeforeCheckIn: 7, refundPercent: 100 },
        { minDaysBeforeCheckIn: 0, refundPercent: 0 },
      ]),
    ).toBeNull();
  });

  it('flags inverted refund ladders without blocking save', (): void => {
    expect(
      hasInvertedRefundLadder([
        { minDaysBeforeCheckIn: 7, refundPercent: 0 },
        { minDaysBeforeCheckIn: 0, refundPercent: 100 },
      ]),
    ).toBe(true);
  });

  it('accepts a stepped ladder that refunds less as check-in nears', (): void => {
    expect(
      hasInvertedRefundLadder([
        { minDaysBeforeCheckIn: 7, refundPercent: 100 },
        { minDaysBeforeCheckIn: 3, refundPercent: 75 },
        { minDaysBeforeCheckIn: 0, refundPercent: 0 },
      ]),
    ).toBe(false);
  });

  it('rejects empty, duplicate, and out-of-range cancellation tiers', (): void => {
    expect(validateCancellationTiers([])).toBe('At least one cancellation tier is required');
    expect(
      validateCancellationTiers([
        { minDaysBeforeCheckIn: 0, refundPercent: 0 },
        { minDaysBeforeCheckIn: 0, refundPercent: 50 },
      ]),
    ).toBe('Each days-before-check-in value must be unique on a property');
    expect(validateCancellationTiers([{ minDaysBeforeCheckIn: 0, refundPercent: 101 }])).toBe(
      'Refund percent must be an integer from 0 to 100',
    );
    expect(validateCancellationTiers([{ minDaysBeforeCheckIn: -1, refundPercent: 0 }])).toBe(
      'Days before check-in must be a whole number of 0 or more',
    );
  });

  it('returns zero overlap when ranges do not meet', (): void => {
    expect(overlapNights('2026-09-01', '2026-09-05', '2026-09-10', '2026-09-20')).toBe(0);
    expect(overlapNights('2026-09-01', '2026-09-05', '2026-09-05', '2026-09-10')).toBe(0);
  });

  it('returns no dates for an inverted eachIsoDate range', (): void => {
    expect(eachIsoDate('2026-09-23', '2026-09-20')).toEqual([]);
  });

  it('does not occupy the night before check-in', (): void => {
    expect(stayOccupiesDate('2026-09-20', '2026-09-23', '2026-09-19')).toBe(false);
  });
});
