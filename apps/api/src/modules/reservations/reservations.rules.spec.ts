/**
 * @file apps/api/src/modules/reservations/reservations.rules.spec.ts
 * @feature reservations
 * @dependencies reservations.rules
 */

import type { StaffReservation } from '@resort-booking/shared-types';
import {
  calendarDayCounts,
  classifyCalendarLane,
  classifyPipelineRow,
  eachIsoDate,
  hasInvertedRefundLadder,
  isInHouseNow,
  isUpcomingArrival,
  overlapNights,
  parsePolicySnapshot,
  reportAsOfDate,
  sortCalendarDayStays,
  staffRangeProblem,
  stayOccupiesDate,
  uniquePropertyCount,
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

  it('accepts the new-property default (one 0-day, 0% catch-all row) and does not flag it as inverted', (): void => {
    const only = [{ minDaysBeforeCheckIn: 0, refundPercent: 0 }];

    expect(validateCancellationTiers(only)).toBeNull();
    expect(hasInvertedRefundLadder(only)).toBe(false);
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

describe('report pipeline buckets', (): void => {
  it('treats unpaid holds as pending payment', (): void => {
    expect(classifyPipelineRow('hold', 'active')).toBe('pending_payment');
  });

  it('groups cancelled stays and released holds together', (): void => {
    expect(classifyPipelineRow('reservation', 'cancelled')).toBe('cancelled');
    expect(classifyPipelineRow('hold', 'released')).toBe('cancelled');
  });

  it('counts unique destinations with confirmed stays', (): void => {
    const stays: StaffReservation[] = [
      stubStay('p1'),
      stubStay('p1'),
      stubStay('p2'),
    ];
    expect(uniquePropertyCount(stays)).toBe(2);
  });
});

describe('staff calendar lanes', (): void => {
  it('keeps confirmed stays, rebooks, and cancellations on separate counts', (): void => {
    const stays: StaffReservation[] = [
      { ...stubStay('p1'), id: 'b', checkIn: '2026-09-14', checkOut: '2026-09-16', rebookOfId: null },
      {
        ...stubStay('p1'),
        id: 'r',
        checkIn: '2026-09-14',
        checkOut: '2026-09-16',
        rebookOfId: 'old',
      },
      {
        ...stubStay('p1'),
        id: 'c',
        checkIn: '2026-09-14',
        checkOut: '2026-09-16',
        status: 'cancelled',
        rebookOfId: null,
      },
    ];
    expect(calendarDayCounts(stays, '2026-09-14')).toEqual({
      date: '2026-09-14',
      bookingCount: 1,
      rebookCount: 1,
      cancelledCount: 1,
      pendingCount: 0,
    });
  });

  it('does not treat a cancelled rebook as a live rebook', (): void => {
    const stay: StaffReservation = {
      ...stubStay('p1'),
      status: 'cancelled',
      rebookOfId: 'old',
      checkIn: '2026-09-14',
      checkOut: '2026-09-15',
    };
    expect(classifyCalendarLane(stay)).toBe('cancelled');
  });

  it('sorts live bookings ahead of cancelled rows', (): void => {
    const cancelled: StaffReservation = {
      ...stubStay('p1'),
      id: 'c',
      houseName: 'Alpha',
      status: 'cancelled',
    };
    const booked: StaffReservation = { ...stubStay('p1'), id: 'b', houseName: 'Zulu' };
    expect(sortCalendarDayStays([cancelled, booked]).map((row): string => row.id)).toEqual(['b', 'c']);
  });

  it('uses the Europe/Paris civil date for report as-of', (): void => {
    expect(reportAsOfDate(new Date('2026-09-15T22:00:00.000Z'))).toBe('2026-09-16');
    expect(reportAsOfDate(new Date('2026-09-15T21:00:00.000Z'))).toBe('2026-09-15');
  });

  it('drops completed stays from upcoming arrivals', (): void => {
    const asOf = '2026-09-16';
    const past: StaffReservation = {
      ...stubStay('p1'),
      checkIn: '2026-09-10',
      checkOut: '2026-09-14',
    };
    const arriving: StaffReservation = {
      ...stubStay('p1'),
      id: 'next',
      checkIn: '2026-09-18',
      checkOut: '2026-09-20',
    };
    const occupying: StaffReservation = {
      ...stubStay('p1'),
      id: 'now',
      checkIn: '2026-09-15',
      checkOut: '2026-09-18',
    };
    const checkedIn: StaffReservation = { ...arriving, id: 'in', arrivalStatus: 'checked_in' };
    expect(isUpcomingArrival(past, asOf)).toBe(false);
    expect(isUpcomingArrival(occupying, asOf)).toBe(false);
    expect(isUpcomingArrival(arriving, asOf)).toBe(true);
    expect(isUpcomingArrival(checkedIn, asOf)).toBe(false);
  });

  it('counts in-house from dates or staff check-in, not after check-out', (): void => {
    const asOf = '2026-09-16';
    const occupying: StaffReservation = {
      ...stubStay('p1'),
      checkIn: '2026-09-15',
      checkOut: '2026-09-18',
    };
    const departed: StaffReservation = { ...occupying, arrivalStatus: 'checked_out' };
    const stillHere: StaffReservation = {
      ...stubStay('p1'),
      id: 'late',
      checkIn: '2026-09-10',
      checkOut: '2026-09-12',
      arrivalStatus: 'checked_in',
    };
    expect(isInHouseNow(occupying, asOf)).toBe(true);
    expect(isInHouseNow(departed, asOf)).toBe(false);
    expect(isInHouseNow(stillHere, asOf)).toBe(true);
  });
});

function stubStay(propertyId: string): StaffReservation {
  return {
    id: propertyId,
    organizationId: 'org',
    propertyId,
    propertyName: 'Prop',
    houseId: 'h',
    houseName: 'House',
    checkIn: '2026-09-01',
    checkOut: '2026-09-03',
    guestCount: 2,
    bookerName: 'A',
    bookerEmail: 'a@example.com',
    bookerPhone: '+330',
    guestNote: '',
    paymentMethod: 'card',
    paymentStatus: 'paid',
    paidAt: null,
    createdByName: null, notesCount: 0, lastNoteAt: null,
    status: 'confirmed',
    kind: 'reservation',
    arrivalStatus: 'expected',
    rebookOfId: null,
    totalCents: 100,
    currencyCode: 'EUR',
    requestNames: [],
    reference: 'BK-0000000000',
    paidCents: 0,
    termsAcceptedAt: null,
    cancellation: null,
    replacedByReference: null,
    rebookOfReference: null,
    refunds: [],
    changes: [],
    extras: [],
  };
}

describe('parsePolicySnapshot', (): void => {
  const GOOD = {
    tiers: [
      { minDaysBeforeCheckIn: 7, refundPercent: 100 },
      { minDaysBeforeCheckIn: 0, refundPercent: 0 },
    ],
    rebookable: true,
    rebookFeeType: 'percent',
    rebookFeeValue: 10,
  };

  it('reads a complete saved policy', (): void => {
    expect(parsePolicySnapshot(GOOD)).toEqual(GOOD);
  });

  it('keeps an empty ladder, which is a real (if unhelpful) policy', (): void => {
    expect(parsePolicySnapshot({ ...GOOD, tiers: [] })?.tiers).toEqual([]);
  });

  it('drops unknown fields instead of carrying them', (): void => {
    const parsed = parsePolicySnapshot({ ...GOOD, extra: 'x', tiers: [{ minDaysBeforeCheckIn: 1, refundPercent: 5, id: 'secret' }] });

    expect(parsed?.tiers).toEqual([{ minDaysBeforeCheckIn: 1, refundPercent: 5 }]);
    expect(parsed).not.toHaveProperty('extra');
  });

  it.each([
    ['null', null],
    ['a string', 'nope'],
    ['an empty object', {}],
    ['tiers that are not a list', { ...GOOD, tiers: 'x' }],
    ['a tier that is not an object', { ...GOOD, tiers: [5] }],
    ['a tier with a text percentage', { ...GOOD, tiers: [{ minDaysBeforeCheckIn: 1, refundPercent: '50' }] }],
    ['a tier with no days', { ...GOOD, tiers: [{ refundPercent: 50 }] }],
    ['a missing rebookable flag', { ...GOOD, rebookable: undefined }],
    ['an unknown fee type', { ...GOOD, rebookFeeType: 'free' }],
    ['a text fee value', { ...GOOD, rebookFeeValue: '10' }],
  ])('returns null for %s so the caller falls back to the current policy', (_name, raw): void => {
    expect(parsePolicySnapshot(raw)).toBeNull();
  });
});


describe('staffRangeProblem', (): void => {
  it('is null for a normal month and for exactly 400 nights', (): void => {
    expect(staffRangeProblem('2027-07-01', '2027-08-01')).toBeNull();
    expect(staffRangeProblem('2027-01-01', '2028-02-05')).toBeNull();
  });

  it('says RANGE_TOO_LONG for 401 nights and for the whole calendar', (): void => {
    expect(staffRangeProblem('2027-01-01', '2028-02-06')?.code).toBe('RANGE_TOO_LONG');
    expect(staffRangeProblem('2000-01-01', '2100-12-31')?.code).toBe('RANGE_TOO_LONG');
  });

  it.each([
    ['0001-01-01', '9999-12-31'],
    ['1999-12-31', '2000-01-05'],
    ['2027-07-10', '2027-07-10'],
    ['2027-07-12', '2027-07-10'],
    ['2027-13-01', '2027-13-05'],
    ['2100-12-30', '2101-01-02'],
  ])('says INVALID_DATES for %s to %s', (from, to): void => {
    expect(staffRangeProblem(from, to)?.code).toBe('INVALID_DATES');
  });
});
