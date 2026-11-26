/**
 * @file apps/api/src/modules/bookings/bookings.rules.spec.ts
 * @feature bookings
 * @dependencies bookings.rules
 */

import type { CancellationPolicyTier } from '@resort-booking/shared-types';
import {
  allocateRefund,
  BOOKING_STARTED_MESSAGE,
  calculateRefund,
  checkCancellation,
  parseBookingReference,
  parseRefundablePayments,
  referenceIdRange,
  selectRefundTier,
  wholeDaysBetween,
  isCheckInTodayOrPast,
  SAME_DAY_ADMIN_ONLY_MESSAGE,
} from './bookings.rules';
import { isoDateInTimeZone } from '../../shared/dates/iso-date';

const LADDER: CancellationPolicyTier[] = [
  { minDaysBeforeCheckIn: 7, refundPercent: 100 },
  { minDaysBeforeCheckIn: 3, refundPercent: 75 },
  { minDaysBeforeCheckIn: 1, refundPercent: 25 },
  { minDaysBeforeCheckIn: 0, refundPercent: 0 },
];

describe('parseBookingReference', () => {
  it.each(['BK-1A2B3C4D5E', 'bk-1a2b3c4d5e', '1A2B3C4D5E', '  BK-1a2b3c4d5e  ', 'BK- 1A2B 3C4D 5E', 'bK1A2B3C4D5E'])(
    'reads %j',
    (input) => {
      expect(parseBookingReference(input)).toBe('1a2b3c4d5e');
    },
  );

  it.each(['', 'BK-', 'BK-1A2B3C4D5', 'BK-1A2B3C4D5EF', 'BK-ZZZZZZZZZZ', 'hello', 'BK-1A2B3C4D5E; DROP TABLE', '1a2b3c4d-5e6f'])(
    'rejects %j',
    (input) => {
      expect(parseBookingReference(input)).toBeNull();
    },
  );
});

describe('referenceIdRange', () => {
  it('spans every id that starts with the reference, as proper uuids', () => {
    expect(referenceIdRange('1a2b3c4d5e')).toEqual({
      low: '1a2b3c4d-5e00-0000-0000-000000000000',
      high: '1a2b3c4d-5eff-ffff-ffff-ffffffffffff',
    });
  });

  it('puts a real id inside its own range and a neighbour outside it', () => {
    const { low, high } = referenceIdRange('1a2b3c4d5e');
    const inside = '1a2b3c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d';
    expect(inside >= low && inside <= high).toBe(true);
    const outside = '1a2b3c4d-5f00-4a8b-9c0d-1e2f3a4b5c6d';
    expect(outside >= low && outside <= high).toBe(false);
  });
});

describe('wholeDaysBetween', () => {
  it('counts calendar days, negative going backwards', () => {
    expect(wholeDaysBetween('2027-06-01', '2027-06-08')).toBe(7);
    expect(wholeDaysBetween('2027-06-08', '2027-06-01')).toBe(-7);
    expect(wholeDaysBetween('2027-06-01', '2027-06-01')).toBe(0);
  });

  it('is not thrown by daylight-saving changes', () => {
    expect(wholeDaysBetween('2027-03-27', '2027-03-30')).toBe(3);
    expect(wholeDaysBetween('2027-10-29', '2027-11-01')).toBe(3);
  });

  it('is NaN for unreadable dates', () => {
    expect(wholeDaysBetween('soon', '2027-06-01')).toBeNaN();
  });
});

describe('selectRefundTier', () => {
  it('picks the greatest minimum that is at or below the days remaining', () => {
    expect(selectRefundTier(LADDER, 10)?.refundPercent).toBe(100);
    expect(selectRefundTier(LADDER, 7)?.refundPercent).toBe(100);
    expect(selectRefundTier(LADDER, 6)?.refundPercent).toBe(75);
    expect(selectRefundTier(LADDER, 3)?.refundPercent).toBe(75);
    expect(selectRefundTier(LADDER, 2)?.refundPercent).toBe(25);
    expect(selectRefundTier(LADDER, 1)?.refundPercent).toBe(25);
    expect(selectRefundTier(LADDER, 0)?.refundPercent).toBe(0);
  });

  it('gives the same answer for tiers in any order and does not reorder them', () => {
    const shuffled = [LADDER[3], LADDER[0], LADDER[2], LADDER[1]].filter((tier): tier is CancellationPolicyTier => tier !== undefined);
    const before = shuffled.map((tier) => tier.minDaysBeforeCheckIn);

    expect(selectRefundTier(shuffled, 4)?.refundPercent).toBe(75);
    expect(shuffled.map((tier) => tier.minDaysBeforeCheckIn)).toEqual(before);
  });

  it('is null when no tier reaches that far in (no catch-all) or there is no ladder', () => {
    expect(selectRefundTier([{ minDaysBeforeCheckIn: 7, refundPercent: 100 }], 3)).toBeNull();
    expect(selectRefundTier([], 10)).toBeNull();
  });
});

describe('calculateRefund', () => {
  it('refunds in full far enough ahead, at exactly the first tier boundary', () => {
    expect(calculateRefund(50000, '2027-06-08', '2027-06-01', LADDER)).toEqual({
      daysBeforeCheckIn: 7,
      tierMinDays: 7,
      percent: 100,
      refundCents: 50000,
    });
  });

  it('drops to the next tier one day later', () => {
    const result = calculateRefund(50000, '2027-06-07', '2027-06-01', LADDER);

    expect(result).toMatchObject({ daysBeforeCheckIn: 6, tierMinDays: 3, percent: 75, refundCents: 37500 });
  });

  it('refunds nothing on the day of check-in under the sample ladder', () => {
    expect(calculateRefund(50000, '2027-06-01', '2027-06-01', LADDER)).toMatchObject({ daysBeforeCheckIn: 0, percent: 0, refundCents: 0 });
  });

  it('rounds to whole cents', () => {
    expect(calculateRefund(33333, '2027-06-07', '2027-06-01', LADDER).refundCents).toBe(25000);
    expect(calculateRefund(10001, '2027-06-07', '2027-06-01', LADDER).refundCents).toBe(7501);
  });

  it('never refunds more than was paid or less than nothing', () => {
    const generous: CancellationPolicyTier[] = [{ minDaysBeforeCheckIn: 0, refundPercent: 250 }];
    const negative: CancellationPolicyTier[] = [{ minDaysBeforeCheckIn: 0, refundPercent: -20 }];

    expect(calculateRefund(10000, '2027-06-10', '2027-06-01', generous).refundCents).toBe(10000);
    expect(calculateRefund(10000, '2027-06-10', '2027-06-01', negative).refundCents).toBe(0);
  });

  it('refunds nothing for a booking that cost nothing or has an invalid amount', () => {
    expect(calculateRefund(0, '2027-06-10', '2027-06-01', LADDER).refundCents).toBe(0);
    expect(calculateRefund(-500, '2027-06-10', '2027-06-01', LADDER).refundCents).toBe(0);
    expect(calculateRefund(100.5, '2027-06-10', '2027-06-01', LADDER).refundCents).toBe(0);
  });

  it('refunds nothing, and says no tier applied, when the property has no ladder', () => {
    expect(calculateRefund(50000, '2027-06-10', '2027-06-01', [])).toEqual({
      daysBeforeCheckIn: 9,
      tierMinDays: null,
      percent: 0,
      refundCents: 0,
    });
  });

  it('refunds nothing for a check-in date that is not a real date', () => {
    expect(calculateRefund(50000, 'later', '2027-06-01', LADDER).refundCents).toBe(0);
  });
});

describe('checkCancellation', () => {
  it('allows cancelling up to the day before and on the check-in day itself', () => {
    expect(checkCancellation(50000, '2027-06-02', '2027-06-01', LADDER).allowed).toBe(true);
    expect(checkCancellation(50000, '2027-06-01', '2027-06-01', LADDER).allowed).toBe(true);
  });

  it('blocks a booking whose check-in date has passed and says what to do', () => {
    const check = checkCancellation(50000, '2027-05-31', '2027-06-01', LADDER);

    expect(check).toEqual({ allowed: false, reason: BOOKING_STARTED_MESSAGE });
    expect(BOOKING_STARTED_MESSAGE).toContain('contact the property');
  });

  it('blocks rather than guesses when the check-in date is unreadable', () => {
    expect(checkCancellation(50000, 'nope', '2027-06-01', LADDER).allowed).toBe(false);
  });

  it('carries the refund calculation when allowed', () => {
    const check = checkCancellation(50000, '2027-06-04', '2027-06-01', LADDER);

    expect(check.allowed).toBe(true);
    if (check.allowed) {
      expect(check.calculation).toMatchObject({ percent: 75, refundCents: 37500 });
    }
  });
});

describe('allocateRefund', () => {
  const NEW = { id: 'p2', provider: 'mock', providerRef: 'mock_pi_2', refundableCents: 2000 };
  const OLD = { id: 'p1', provider: 'mock', providerRef: 'mock_pi_1', refundableCents: 96000 };

  it('refunds from the newest payment first and moves on when it runs out', () => {
    expect(allocateRefund([NEW, OLD], 50000)).toEqual({
      chunks: [
        { paymentId: 'p2', providerRef: 'mock_pi_2', provider: 'mock', amountCents: 2000 },
        { paymentId: 'p1', providerRef: 'mock_pi_1', provider: 'mock', amountCents: 48000 },
      ],
      uncoveredCents: 0,
    });
  });

  it('uses one payment when it can cover the refund', () => {
    expect(allocateRefund([OLD], 96000).chunks).toEqual([{ paymentId: 'p1', providerRef: 'mock_pi_1', provider: 'mock', amountCents: 96000 }]);
  });

  it('reports what no payment could cover', () => {
    expect(allocateRefund([NEW], 5000)).toEqual({
      chunks: [{ paymentId: 'p2', providerRef: 'mock_pi_2', provider: 'mock', amountCents: 2000 }],
      uncoveredCents: 3000,
    });
  });

  it('covers nothing when there are no payments', () => {
    expect(allocateRefund([], 5000)).toEqual({ chunks: [], uncoveredCents: 5000 });
  });

  it('skips a payment that has nothing left to give back', () => {
    expect(allocateRefund([{ ...NEW, refundableCents: 0 }, OLD], 1000).chunks.map((chunk) => chunk.paymentId)).toEqual(['p1']);
  });

  it('asks the provider for nothing when the refund is zero', () => {
    expect(allocateRefund([OLD], 0)).toEqual({ chunks: [], uncoveredCents: 0 });
  });

  it('never takes a negative amount from a payment', () => {
    expect(allocateRefund([{ ...NEW, refundableCents: -500 }, OLD], 1000).chunks.map((chunk) => chunk.paymentId)).toEqual(['p1']);
  });
});

describe('parseRefundablePayments', () => {
  it('reads the aggregated payments', () => {
    expect(parseRefundablePayments([{ id: 'p1', provider: 'mock', providerRef: 'x', refundableCents: 100 }])).toEqual([
      { id: 'p1', provider: 'mock', providerRef: 'x', refundableCents: 100 },
    ]);
  });

  it('drops malformed entries and treats anything else as no payments', () => {
    expect(parseRefundablePayments([null, 'x', { id: 1 }, { id: 'p', provider: 'mock', providerRef: 'x', refundableCents: 'many' }])).toEqual([]);
    expect(parseRefundablePayments(null)).toEqual([]);
    expect(parseRefundablePayments({})).toEqual([]);
  });
});

describe('isCheckInTodayOrPast (the employee same-day lock)', () => {
  it('allows check-in tomorrow and later, refuses today and the past', () => {
    expect(isCheckInTodayOrPast('2027-07-02', '2027-07-01')).toBe(false);
    expect(isCheckInTodayOrPast('2027-07-01', '2027-07-01')).toBe(true);
    expect(isCheckInTodayOrPast('2027-06-30', '2027-07-01')).toBe(true);
    expect(isCheckInTodayOrPast('2026-01-01', '2027-07-01')).toBe(true);
  });

  it('counts across month and year ends like the refund ladder does', () => {
    expect(isCheckInTodayOrPast('2028-01-01', '2027-12-31')).toBe(false);
    expect(isCheckInTodayOrPast('2027-12-31', '2028-01-01')).toBe(true);
  });

  it('treats an unreadable date as too close (admin only)', () => {
    expect(isCheckInTodayOrPast('soon', '2027-07-01')).toBe(true);
    expect(isCheckInTodayOrPast('2027-07-02', '')).toBe(true);
  });

  it('uses the property day, not the UTC day, for a non-UTC property', () => {
    const instant = new Date('2027-07-01T21:30:00Z'); // already 2 July in Auckland, still 1 July in Paris and UTC
    expect(isCheckInTodayOrPast('2027-07-02', isoDateInTimeZone(instant, 'Pacific/Auckland'))).toBe(true);
    expect(isCheckInTodayOrPast('2027-07-02', isoDateInTimeZone(instant, 'Europe/Paris'))).toBe(false);
    expect(isCheckInTodayOrPast('2027-07-02', isoDateInTimeZone(new Date('2027-07-01T03:00:00Z'), 'America/Los_Angeles'))).toBe(false);
  });

  it('is not shifted by a daylight saving change', () => {
    // New York springs forward on 14 March 2027: the calendar day count is still whole days.
    const before = isoDateInTimeZone(new Date('2027-03-13T12:00:00Z'), 'America/New_York');
    const after = isoDateInTimeZone(new Date('2027-03-14T12:00:00Z'), 'America/New_York');
    expect(before).toBe('2027-03-13');
    expect(after).toBe('2027-03-14');
    expect(isCheckInTodayOrPast('2027-03-14', before)).toBe(false);
    expect(isCheckInTodayOrPast('2027-03-14', after)).toBe(true);
    expect(isCheckInTodayOrPast('2027-03-15', after)).toBe(false);
  });

  it('has the message the admin app shows', () => {
    expect(SAME_DAY_ADMIN_ONLY_MESSAGE).toBe('Check-in is today (or has passed). An admin has to cancel or change this booking.');
  });
});
