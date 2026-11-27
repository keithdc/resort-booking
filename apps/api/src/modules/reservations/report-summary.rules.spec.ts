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
  summariseBookingSources,
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
    paymentStatus: 'paid',
    bookingSource: 'website',
    paidAt: null,
    createdByName: null, notesCount: 0, lastNoteAt: null,
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
    extras: [],
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
    expect(totals).toEqual({ occupiedNights: 4, revenueCents: 20000 + 20000, guestCount: 6, unpaidAtHotelCount: 0, unpaidAtHotelCents: 0 });
  });

  it('is all zero without bookings', () => {
    expect(confirmedTotals([], '2027-07-01', '2027-08-01')).toEqual({ occupiedNights: 0, revenueCents: 0, guestCount: 0, unpaidAtHotelCount: 0, unpaidAtHotelCents: 0 });
  });

  it('counts a pay-at-hotel booking nobody has marked paid apart, for the nights inside the range only', () => {
    const unpaid: StaffReservation = { ...stay('2027-06-29', '2027-07-03', 40000, 4), paymentMethod: 'pay_at_hotel', paymentStatus: 'pending', paidCents: 0 };
    const paidAtHotel: StaffReservation = { ...stay('2027-07-10', '2027-07-12', 20000, 2), paymentMethod: 'pay_at_hotel', paymentStatus: 'paid' };
    const totals = confirmedTotals([unpaid, paidAtHotel], '2027-07-01', '2027-08-01');
    expect(totals.revenueCents).toBe(20000 + 20000);
    expect(totals.unpaidAtHotelCount).toBe(1);
    expect(totals.unpaidAtHotelCents).toBe(20000);
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
    totals: { occupiedNights: 10, revenueCents: 100000, guestCount: 6, unpaidAtHotelCount: 0, unpaidAtHotelCents: 0 },
    cancellations: { cancelledCount: 1, paidCents: 30000, refundedCents: 10000 },
  };

  it('counts kept cancellation money in gross and takes refunds off for net', () => {
    const summary = buildPeriodSummary(base);
    expect(summary.grossRevenueCents).toBe(130000);
    expect(summary.refundedCents).toBe(10000);
    expect(summary.netRevenueCents).toBe(120000);
  });

  it('keeps booked-but-unpaid money out of gross and net, and reports it as still to collect', () => {
    const summary = buildPeriodSummary({ ...base, totals: { ...base.totals, unpaidAtHotelCount: 1, unpaidAtHotelCents: 40000 } });
    expect(summary.unpaidAtHotelCents).toBe(40000);
    expect(summary.grossRevenueCents).toBe(100000 - 40000 + 30000);
    expect(summary.netRevenueCents).toBe(100000 - 40000 + 30000 - 10000);
    // The average night is still what the nights were booked at, paid or not.
    expect(summary.averageNightlyCents).toBe(10000);
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
      totals: { occupiedNights: 0, revenueCents: 0, guestCount: 0, unpaidAtHotelCount: 0, unpaidAtHotelCents: 0 },
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

describe('summariseBookingSources', () => {
  const from = '2027-07-01';
  const to = '2027-08-01';
  const from_ = (source: StaffReservation['bookingSource'], checkIn: string, checkOut: string, total: number): StaffReservation => ({ ...stay(checkIn, checkOut, total), bookingSource: source });

  it('counts bookings, nights in the period and what those nights are worth, per source, biggest first', () => {
    const slices = summariseBookingSources(
      [from_('website', '2027-07-10', '2027-07-12', 20000), from_('airbnb', '2027-07-20', '2027-07-23', 30000), from_('website', '2027-07-25', '2027-07-26', 10000)],
      from,
      to,
    );

    expect(slices).toEqual([
      { source: 'website', reservationCount: 2, occupiedNights: 3, revenueCents: 30000, sharePercent: 67 },
      { source: 'airbnb', reservationCount: 1, occupiedNights: 3, revenueCents: 30000, sharePercent: 33 },
    ]);
  });

  it('counts only the nights that fall inside the period (a stay across the edge is split)', () => {
    const [slice] = summariseBookingSources([from_('walk_in', '2027-07-30', '2027-08-03', 40000)], from, to);

    expect(slice).toMatchObject({ source: 'walk_in', reservationCount: 1, occupiedNights: 2, revenueCents: 20000, sharePercent: 100 });
  });

  it('keeps the shares at exactly 100 and leaves out sources with no booking', () => {
    const thirds = summariseBookingSources(
      [from_('website', '2027-07-01', '2027-07-02', 100), from_('airbnb', '2027-07-03', '2027-07-04', 100), from_('phone_email', '2027-07-05', '2027-07-06', 100)],
      from,
      to,
    );

    expect(thirds.map((slice) => slice.source)).toEqual(['website', 'airbnb', 'phone_email']);
    expect(thirds.reduce((sum, slice) => sum + slice.sharePercent, 0)).toBe(100);
  });

  it('is empty for a period with no booking, and with only one source it is that source at 100 percent', () => {
    expect(summariseBookingSources([], from, to)).toEqual([]);
    expect(summariseBookingSources([from_('website', '2027-07-10', '2027-07-12', 20000)], from, to)).toEqual([
      { source: 'website', reservationCount: 1, occupiedNights: 2, revenueCents: 20000, sharePercent: 100 },
    ]);
  });
});
