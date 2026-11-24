/**
 * @file apps/api/src/modules/reservations/report-summary.rules.spec.ts
 * @feature reservations
 */

import type { CancellationReasonRow, StaffReservation } from '@resort-booking/shared-types';
import {
  buildPeriodSummary,
  cancellationRatePercent,
  cancellationTotals,
  confirmedTotals,
  occupancyPercent,
  previousRange,
  rangedRevenueCents,
} from './report-summary.rules';

function stay(checkIn: string, checkOut: string, totalCents: number, guestCount = 2): StaffReservation {
  return {
    id: 'r1',
    organizationId: 'org',
    propertyId: 'p1',
    propertyName: 'Alpine Lake',
    houseId: 'h1',
    houseName: 'Lake Chalet',
    checkIn,
    checkOut,
    guestCount,
    bookerName: 'Ada',
    bookerEmail: 'ada@example.com',
    bookerPhone: '+33612345678',
    guestNote: '',
    paymentMethod: 'card',
    status: 'confirmed',
    kind: 'reservation',
    arrivalStatus: 'expected',
    rebookOfId: null,
    totalCents,
    currencyCode: 'EUR',
    requestNames: [],
    reference: 'BK-ABC1234567',
    paidCents: totalCents,
    termsAcceptedAt: null,
    cancellation: null,
    replacedByReference: null,
    rebookOfReference: null,
    refunds: [],
    changes: [],
  };
}

describe('previousRange', () => {
  it('is the equal-length window right before the range', () => {
    expect(previousRange('2027-07-01', '2027-07-31')).toEqual({ from: '2027-06-01', to: '2027-07-01' });
  });

  it('crosses a year boundary', () => {
    expect(previousRange('2027-01-01', '2027-01-08')).toEqual({ from: '2026-12-25', to: '2027-01-01' });
  });

  it('handles a leap February', () => {
    expect(previousRange('2028-03-01', '2028-04-01')).toEqual({ from: '2028-01-30', to: '2028-03-01' });
  });

  it('is null for an empty or inverted range', () => {
    expect(previousRange('2027-07-01', '2027-07-01')).toBeNull();
    expect(previousRange('2027-07-05', '2027-07-01')).toBeNull();
  });
});

describe('rangedRevenueCents and confirmedTotals', () => {
  it('prices only the nights inside the range at the rounded nightly rate', () => {
    // 4 nights for 400,00: 100,00 a night, 2 of them inside the range.
    expect(rangedRevenueCents(stay('2027-07-09', '2027-07-13', 40000), '2027-07-11', '2027-07-20')).toBe(20000);
  });

  it('rounds the nightly rate like the report always did', () => {
    expect(rangedRevenueCents(stay('2027-07-10', '2027-07-13', 10000), '2027-07-01', '2027-08-01')).toBe(3333 * 3);
  });

  it('adds nights, revenue and guests over bookings and ignores nights outside the range', () => {
    const totals = confirmedTotals(
      [stay('2027-07-10', '2027-07-12', 20000, 2), stay('2027-06-29', '2027-07-03', 40000, 4)],
      '2027-07-01',
      '2027-08-01',
    );
    expect(totals).toEqual({ occupiedNights: 4, revenueCents: 20000 + 20000, guestCount: 6 });
  });

  it('is all zero without bookings', () => {
    expect(confirmedTotals([], '2027-07-01', '2027-08-01')).toEqual({ occupiedNights: 0, revenueCents: 0, guestCount: 0 });
  });
});

describe('cancellationTotals and rates', () => {
  const rows: CancellationReasonRow[] = [
    { reason: 'guest_request', cancelledCount: 2, paidCents: 20000, refundedCents: 5000 },
    { reason: 'property_cancelled', cancelledCount: 1, paidCents: 10000, refundedCents: 10000 },
  ];

  it('adds the reasons up', () => {
    expect(cancellationTotals(rows)).toEqual({ cancelledCount: 3, paidCents: 30000, refundedCents: 15000 });
    expect(cancellationTotals([])).toEqual({ cancelledCount: 0, paidCents: 0, refundedCents: 0 });
  });

  it('rates cancelled against confirmed plus cancelled, to one decimal', () => {
    expect(cancellationRatePercent(9, 1)).toBe(10);
    expect(cancellationRatePercent(2, 1)).toBe(33.3);
    expect(cancellationRatePercent(0, 0)).toBe(0);
    expect(cancellationRatePercent(0, 3)).toBe(100);
  });

  it('computes occupancy to one decimal and never divides by zero', () => {
    expect(occupancyPercent(124, 200)).toBe(62);
    expect(occupancyPercent(1, 3)).toBe(33.3);
    expect(occupancyPercent(5, 0)).toBe(0);
  });
});

describe('buildPeriodSummary', () => {
  const base = {
    from: '2027-07-01',
    to: '2027-07-11',
    houseCount: 2,
    reservationCount: 3,
    totals: { occupiedNights: 10, revenueCents: 100000, guestCount: 6 },
    cancellations: { cancelledCount: 1, paidCents: 30000, refundedCents: 10000 },
  };

  it('counts kept cancellation money in gross and takes refunds off for net', () => {
    const summary = buildPeriodSummary(base);
    expect(summary.grossRevenueCents).toBe(130000);
    expect(summary.refundedCents).toBe(10000);
    expect(summary.netRevenueCents).toBe(120000);
  });

  it('computes occupancy, average night and cancellation rate', () => {
    const summary = buildPeriodSummary(base);
    expect(summary.occupancyPercent).toBe(50); // 10 of 2 stays x 10 nights
    expect(summary.averageNightlyCents).toBe(10000);
    expect(summary.cancelledCount).toBe(1);
    expect(summary.cancellationRatePercent).toBe(25); // 1 of 3 + 1
  });

  it('is all zero for an empty period', () => {
    const summary = buildPeriodSummary({
      ...base,
      reservationCount: 0,
      totals: { occupiedNights: 0, revenueCents: 0, guestCount: 0 },
      cancellations: { cancelledCount: 0, paidCents: 0, refundedCents: 0 },
    });
    expect(summary).toMatchObject({
      grossRevenueCents: 0,
      netRevenueCents: 0,
      averageNightlyCents: 0,
      occupancyPercent: 0,
      cancellationRatePercent: 0,
    });
  });

  it('can be negative net when refunds exceed what is kept in the period', () => {
    const summary = buildPeriodSummary({ ...base, cancellations: { cancelledCount: 1, paidCents: 0, refundedCents: 5000 } });
    expect(summary.netRevenueCents).toBe(100000 - 5000);
  });
});
