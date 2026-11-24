/**
 * @file apps/admin/src/test/fixtures.ts
 * @shared Builders for staff data used by several tests
 */

import type {
  PeriodSummary,
  RebookQuote,
  StaffBookingChange,
  StaffCancellation,
  StaffRefund,
  StaffReport,
  StaffReservation,
} from '@resort-booking/shared-types';

/** A confirmed booking with nothing special recorded. Override only what a test cares about. */
export function staffReservation(overrides: Partial<StaffReservation> = {}): StaffReservation {
  return {
    id: 'r1',
    organizationId: 'o1',
    propertyId: 'p1',
    propertyName: 'Alpine Lake',
    houseId: 'h1',
    houseName: 'Lake Chalet',
    checkIn: '2027-07-10',
    checkOut: '2027-07-12',
    guestCount: 2,
    bookerName: 'Ada Lovelace',
    bookerEmail: 'ada@example.com',
    bookerPhone: '+33612345678',
    guestNote: '',
    paymentMethod: 'card',
    status: 'confirmed',
    kind: 'reservation',
    arrivalStatus: 'expected',
    rebookOfId: null,
    totalCents: 96000,
    currencyCode: 'EUR',
    requestNames: [],
    reference: 'BK-ABC1234567',
    paidCents: 96000,
    termsAcceptedAt: '2027-05-01T10:30:00.000Z',
    cancellation: null,
    replacedByReference: null,
    rebookOfReference: null,
    refunds: [],
    changes: [],
    ...overrides,
  };
}

export function staffRefund(overrides: Partial<StaffRefund> = {}): StaffRefund {
  return {
    id: 'f1',
    reservationId: 'r1',
    reference: 'BK-ABC1234567',
    propertyName: 'Alpine Lake',
    stayName: 'Lake Chalet',
    bookerName: 'Ada Lovelace',
    bookerEmail: 'ada@example.com',
    kind: 'cancellation',
    amountCents: 72000,
    percent: 75,
    currencyCode: 'EUR',
    status: 'pending',
    provider: 'manual',
    failureReason: null,
    reason: 'guest_request',
    initiatedBy: 'guest',
    resolutionNote: null,
    resolvedByName: null,
    createdAt: '2027-06-01T09:00:00.000Z',
    ...overrides,
  };
}

export function staffCancellation(overrides: Partial<StaffCancellation> = {}): StaffCancellation {
  return {
    initiatedBy: 'guest',
    reason: 'guest_request',
    note: null,
    staffName: null,
    cancelledAt: '2027-06-01T09:00:00.000Z',
    ...overrides,
  };
}

export function staffChange(overrides: Partial<StaffBookingChange> = {}): StaffBookingChange {
  return {
    id: 'c1',
    fromReference: 'BK-OLD0000000',
    toReference: 'BK-NEW0000000',
    oldCheckIn: '2027-07-10',
    oldCheckOut: '2027-07-12',
    newCheckIn: '2027-07-20',
    newCheckOut: '2027-07-23',
    oldTotalCents: 96000,
    newTotalCents: 140000,
    feeCents: 2000,
    payCents: 46000,
    refundCents: 0,
    initiatedBy: 'guest',
    staffName: null,
    note: null,
    createdAt: '2027-06-02T09:00:00.000Z',
    ...overrides,
  };
}

/** A usable quote where the guest owes money. Override the amounts for other cases. */
export function rebookQuote(overrides: Partial<RebookQuote> = {}): RebookQuote {
  return {
    reference: 'BK-ABC1234567',
    newCheckIn: '2027-07-20',
    newCheckOut: '2027-07-23',
    nights: 3,
    currencyCode: 'EUR',
    lines: [{ label: 'Standard rate', nights: 3, nightlyRateCents: 41600, subtotalCents: 124800 }],
    subtotalCents: 124800,
    discounts: [],
    discountCents: 0,
    newTotalCents: 124800,
    feeCents: 2000,
    paidCents: 96000,
    balanceCents: 30800,
    payCents: 30800,
    refundCents: 0,
    available: true,
    problem: null,
    promoCode: null,
    ...overrides,
  };
}

/** The previous period of a report: some earlier data so comparisons have something to compare with. */
export function periodSummary(overrides: Partial<PeriodSummary> = {}): PeriodSummary {
  return {
    from: '2027-06-01',
    to: '2027-07-01',
    reservationCount: 2,
    occupiedNights: 8,
    occupancyPercent: 20,
    averageNightlyCents: 10000,
    grossRevenueCents: 100000,
    refundedCents: 0,
    netRevenueCents: 100000,
    cancelledCount: 0,
    cancellationRatePercent: 0,
    ...overrides,
  };
}

/**
 * A July 2027 report with one property, two stays, three bookings and a bit of everything. Override
 * what a test cares about.
 */
export function staffReport(overrides: Partial<StaffReport> = {}): StaffReport {
  const booked = staffReservation({ id: 'b1', reference: 'BK-AAAA000001', totalCents: 96000 });
  const second = staffReservation({ id: 'b2', reference: 'BK-BBBB000002', houseId: 'h2', houseName: 'Old Barn', bookerName: 'Grace Hopper', bookerEmail: 'grace@example.com', paymentMethod: 'bank_transfer', totalCents: 24000, checkIn: '2027-07-20', checkOut: '2027-07-21' });
  const third = staffReservation({ id: 'b3', reference: 'BK-CCCC000003', bookerName: 'Alan Turing', bookerEmail: 'alan@example.com', checkIn: '2027-07-25', checkOut: '2027-07-26', totalCents: 12000 });
  const cancelled = staffReservation({ id: 'b4', reference: 'BK-DDDD000004', bookerName: 'Linus Pauling', bookerEmail: 'linus@example.com', status: 'cancelled', checkIn: '2027-07-05', checkOut: '2027-07-06', totalCents: 32000 });
  const unpaid = staffReservation({ id: 'b5', reference: 'BK-EEEE000005', bookerName: 'Marie Curie', bookerEmail: 'marie@example.com', kind: 'hold', status: 'active', checkIn: '2027-07-28', checkOut: '2027-07-30', totalCents: 20000 });
  return {
    from: '2027-07-01',
    to: '2027-08-01',
    asOfDate: '2027-07-15',
    propertyId: null,
    currencyCode: 'EUR',
    houseCount: 2,
    availableNights: 62,
    reservationCount: 3,
    occupiedNights: 4,
    revenueCents: 132000,
    averageNightlyCents: 33000,
    occupancyPercent: 6.5,
    upcomingStayCount: 2,
    inHouseStayCount: 0,
    guestCount: 6,
    propertyBookedCount: 1,
    pendingPaymentCount: 1,
    cancelledCount: 1,
    rebookCount: 0,
    expiredHoldCount: 0,
    pipeline: [cancelled, booked, second, third, unpaid],
    properties: [
      {
        propertyId: 'p1', propertyName: 'Alpine Lake', reservationCount: 3, occupiedNights: 4, revenueCents: 132000, currencyCode: 'EUR', houseCount: 2,
        houses: [
          { houseId: 'h1', houseName: 'Lake Chalet', reservationCount: 2, occupiedNights: 3, revenueCents: 108000 },
          { houseId: 'h2', houseName: 'Old Barn', reservationCount: 1, occupiedNights: 1, revenueCents: 24000 },
        ],
      },
    ],
    daily: [
      { date: '2027-07-10', revenueCents: 48000, occupiedNights: 1, stayCount: 1, pendingCount: 0, cancelledCount: 0 },
      { date: '2027-07-11', revenueCents: 48000, occupiedNights: 1, stayCount: 1, pendingCount: 0, cancelledCount: 0 },
      { date: '2027-07-20', revenueCents: 24000, occupiedNights: 1, stayCount: 1, pendingCount: 0, cancelledCount: 0 },
    ],
    paymentMethods: [
      { paymentMethod: 'card', reservationCount: 2, revenueCents: 108000 },
      { paymentMethod: 'bank_transfer', reservationCount: 1, revenueCents: 24000 },
    ],
    stays: [booked, second, third],
    grossRevenueCents: 164000,
    refundedCents: 8000,
    netRevenueCents: 156000,
    cancellationRatePercent: 25,
    cancellationReasons: [{ reason: 'guest_request', cancelledCount: 1, paidCents: 32000, refundedCents: 8000 }],
    refunds: [staffRefund({ amountCents: 8000, percent: 25, status: 'succeeded', reference: 'BK-DDDD000004' })],
    discountUsage: [{ discountId: 'd1', label: 'Long stay: 7+ nights', redemptionCount: 2, discountCents: 12000 }],
    attention: { unpaidHoldCount: 1, refundsToPayCount: 2, refundsToPayCents: 15000, arrivalsTodayCount: 0, arrivalsNext7DaysCount: 3 },
    previous: periodSummary(),
    ...overrides,
  };
}
