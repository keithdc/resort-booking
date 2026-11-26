/**
 * @file apps/api/src/shared/roles/redact-report.spec.ts
 * @shared What an employee may see of the owner report
 */

import type { StaffReport, StaffReservation } from '@resort-booking/shared-types';
import { keepReportForAdmin, redactReportForEmployee } from './redact-report';

function booking(): StaffReservation {
  return {
    id: 'b1',
    organizationId: 'o1',
    propertyId: 'p1',
    propertyName: 'Alpine Lake',
    houseId: 'h1',
    houseName: 'Lake Chalet',
    checkIn: '2026-12-01',
    checkOut: '2026-12-03',
    guestCount: 2,
    bookerName: 'Ada',
    bookerEmail: 'ada@example.com',
    bookerPhone: '+33123456789',
    guestNote: '',
    paymentMethod: 'card',
    paymentStatus: 'paid',
    paidAt: null,
    createdByName: null, notesCount: 0, lastNoteAt: null,
    status: 'confirmed',
    kind: 'reservation',
    arrivalStatus: 'expected',
    rebookOfId: null,
    totalCents: 64000,
    currencyCode: 'EUR',
    requestNames: [],
    reference: 'BK-1',
    paidCents: 64000,
    termsAcceptedAt: null,
    cancellation: null,
    replacedByReference: null,
    rebookOfReference: null,
    refunds: [
      {
        id: 'r1',
        reservationId: 'b1',
        reference: 'BK-1',
        propertyName: 'Alpine Lake',
        stayName: 'Lake Chalet',
        bookerName: 'Ada',
        bookerEmail: 'ada@example.com',
        kind: 'cancellation',
        amountCents: 8000,
        percent: 25,
        currencyCode: 'EUR',
        status: 'succeeded',
        provider: 'mock',
        failureReason: null,
        reason: 'guest_request',
        initiatedBy: 'guest',
        resolutionNote: null,
        resolvedByName: null,
        createdAt: '2026-11-24T19:21:14.000Z',
      },
    ],
    changes: [],
    extras: [],
  };
}

function report(): StaffReport {
  const row = booking();
  return {
    from: '2026-12-01',
    to: '2027-01-01',
    asOfDate: '2026-11-26',
    propertyId: null,
    currencyCode: 'EUR',
    houseCount: 3,
    availableNights: 93,
    reservationCount: 4,
    occupiedNights: 12,
    revenueCents: 128000,
    unpaidAtHotelCount: 2,
    unpaidAtHotelCents: 52000,
    averageNightlyCents: 10666,
    occupancyPercent: 13,
    upcomingStayCount: 2,
    inHouseStayCount: 1,
    guestCount: 9,
    propertyBookedCount: 1,
    pendingPaymentCount: 1,
    cancelledCount: 1,
    rebookCount: 0,
    expiredHoldCount: 2,
    pipeline: [row],
    properties: [
      {
        propertyId: 'p1',
        propertyName: 'Alpine Lake',
        reservationCount: 4,
        occupiedNights: 12,
        revenueCents: 128000,
        currencyCode: 'EUR',
        houseCount: 1,
        houses: [{ houseId: 'h1', houseName: 'Lake Chalet', reservationCount: 4, occupiedNights: 12, revenueCents: 128000 }],
      },
    ],
    daily: [{ date: '2026-12-01', revenueCents: 32000, occupiedNights: 1, stayCount: 1, pendingCount: 0, cancelledCount: 0 }],
    paymentMethods: [{ paymentMethod: 'card', reservationCount: 4, revenueCents: 128000 }],
    stays: [row],
    grossRevenueCents: 136000,
    refundedCents: 8000,
    netRevenueCents: 128000,
    cancellationRatePercent: 20,
    cancellationReasons: [{ reason: 'guest_request', cancelledCount: 1, paidCents: 32000, refundedCents: 8000 }],
    refunds: row.refunds,
    discountUsage: [{ discountId: 'd1', label: 'Long stay', redemptionCount: 2, discountCents: 9800 }],
    attention: { unpaidHoldCount: 1, refundsToPayCount: 1, refundsToPayCents: 8000, arrivalsTodayCount: 1, arrivalsNext7DaysCount: 2, unpaidAtHotelCount: 2, unpaidAtHotelCents: 52000, unpaidAtHotelArrivalsNext7DaysCount: 1, unpaidAtHotelPastCount: 1 },
    previous: {
      from: '2026-11-01',
      to: '2026-12-01',
      reservationCount: 3,
      occupiedNights: 9,
      occupancyPercent: 10,
      averageNightlyCents: 9000,
      grossRevenueCents: 90000,
      refundedCents: 0,
      netRevenueCents: 90000,
      cancelledCount: 0,
      cancellationRatePercent: 0,
      unpaidAtHotelCents: 0,
    },
  };
}

/** Every key whose name says it is money, anywhere in the object. */
function moneyValues(value: unknown, path = ''): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => moneyValues(item, `${path}[${String(index)}]`));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, child]) => {
      const here = `${path}.${key}`;
      if (/Cents$/.test(key) && typeof child === 'number' && child !== 0) {
        return [here];
      }
      return moneyValues(child, here);
    });
  }
  return [];
}

describe('redactReportForEmployee', () => {
  it('leaves no money figure anywhere in the report', () => {
    const redacted = redactReportForEmployee(report());

    expect(moneyValues(redacted)).toEqual([]);
    expect(redacted.refunds).toEqual([]);
  });

  it('keeps everything about activity: nights, occupancy, counts, arrivals, names', () => {
    const redacted = redactReportForEmployee(report());

    expect(redacted).toMatchObject({
      reservationCount: 4,
      occupiedNights: 12,
      occupancyPercent: 13,
      cancelledCount: 1,
      guestCount: 9,
      cancellationRatePercent: 20,
      attention: { unpaidHoldCount: 1, refundsToPayCount: 1, arrivalsTodayCount: 1, arrivalsNext7DaysCount: 2 },
      previous: { reservationCount: 3, occupancyPercent: 10 },
    });
    expect(redacted.pipeline[0]).toMatchObject({ bookerName: 'Ada', reference: 'BK-1', houseName: 'Lake Chalet' });
    expect(redacted.properties[0]?.houses[0]).toMatchObject({ houseName: 'Lake Chalet', reservationCount: 4 });
    expect(redacted.daily[0]).toMatchObject({ occupiedNights: 1, stayCount: 1 });
  });

  it('says the money was withheld, and does not change the report it was given', () => {
    const original = report();
    const before = JSON.stringify(original);

    const redacted = redactReportForEmployee(original);

    expect(redacted.moneyHidden).toBe(true);
    expect(JSON.stringify(original)).toBe(before);
  });
});

describe('keepReportForAdmin', () => {
  it('gives the admin every figure, marked as not hidden', () => {
    const original = report();

    const kept = keepReportForAdmin(original);

    expect(kept.moneyHidden).toBe(false);
    expect(kept.revenueCents).toBe(128000);
    expect(kept.refunds).toHaveLength(1);
    expect(moneyValues(kept).length).toBeGreaterThan(5);
  });
});
