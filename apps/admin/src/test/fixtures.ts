/**
 * @file apps/admin/src/test/fixtures.ts
 * @shared Builders for staff data used by several tests
 */

import type {
  RebookQuote,
  StaffBookingChange,
  StaffCancellation,
  StaffRefund,
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
