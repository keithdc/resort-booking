/**
 * @file apps/admin/src/features/reservations/utils/reservation-defaults.test.ts
 * @feature reservations
 */

import { describe, expect, it } from 'vitest';
import { staffReservation } from '../../../test/fixtures';
import { withReportDefaults, withReservationDefaults, type RawStaffReservation } from './reservation-defaults';

/** What an older API sends: a reservation without any of the newer fields. */
function oldApiReservation(): RawStaffReservation {
  const full = staffReservation();
  return {
    id: full.id,
    organizationId: full.organizationId,
    propertyId: full.propertyId,
    propertyName: full.propertyName,
    houseId: full.houseId,
    houseName: full.houseName,
    checkIn: full.checkIn,
    checkOut: full.checkOut,
    guestCount: full.guestCount,
    bookerName: full.bookerName,
    bookerEmail: full.bookerEmail,
    bookerPhone: full.bookerPhone,
    guestNote: full.guestNote,
    paymentMethod: full.paymentMethod,
    status: full.status,
    kind: full.kind,
    arrivalStatus: full.arrivalStatus,
    rebookOfId: full.rebookOfId,
    totalCents: full.totalCents,
    currencyCode: full.currencyCode,
    requestNames: full.requestNames,
  };
}

describe('withReservationDefaults', () => {
  it('fills every missing newer field, so a screen reading them cannot crash', () => {
    const filled = withReservationDefaults(oldApiReservation());

    expect(filled.cancellation).toBeNull();
    expect(filled.refunds).toEqual([]);
    expect(filled.changes).toEqual([]);
    expect(filled.extras).toEqual([]);
    expect(filled.reference).toBe('');
    expect(filled.paidCents).toBe(0);
    // An API from before pay at hotel: every booking it knows was paid online.
    expect(filled.paymentStatus).toBe('paid');
    expect(filled.paidAt).toBeNull();
    expect(filled.createdByName).toBeNull();
    expect(filled.termsAcceptedAt).toBeNull();
    expect(filled.replacedByReference).toBeNull();
    expect(filled.rebookOfReference).toBeNull();
  });

  it('changes nothing for a current API that sends every field', () => {
    const current = staffReservation({
      reference: 'BK-ABC1234567',
      paidCents: 18000,
      cancellation: { initiatedBy: 'staff', reason: 'goodwill', note: 'ok', staffName: 'Sam', cancelledAt: '2027-01-01T10:00:00Z' },
    });

    expect(withReservationDefaults(current)).toEqual(current);
  });

  it('keeps a pending pay-at-hotel booking pending', () => {
    const filled = withReservationDefaults({ ...oldApiReservation(), paymentMethod: 'pay_at_hotel', paymentStatus: 'pending', createdByName: 'Eve' });

    expect(filled).toMatchObject({ paymentStatus: 'pending', createdByName: 'Eve' });
  });

  it('keeps the booking facts it was given', () => {
    const raw = oldApiReservation();

    const filled = withReservationDefaults(raw);

    expect(filled.id).toBe(raw.id);
    expect(filled.checkIn).toBe(raw.checkIn);
    expect(filled.bookerName).toBe(raw.bookerName);
  });

  it('keeps a real zero paid and a real empty list instead of replacing them', () => {
    const filled = withReservationDefaults({ ...oldApiReservation(), paidCents: 0, refunds: [] });

    expect(filled.paidCents).toBe(0);
    expect(filled.refunds).toEqual([]);
  });
});

describe('withReportDefaults', () => {
  it('fills the reservations inside a report too', () => {
    const report = {
      from: '2027-01-01',
      to: '2027-01-31',
      asOfDate: '2027-01-15',
      propertyId: null,
      currencyCode: 'EUR',
      houseCount: 1,
      availableNights: 31,
      reservationCount: 1,
      occupiedNights: 2,
      revenueCents: 100,
      averageNightlyCents: 50,
      occupancyPercent: 6,
      upcomingStayCount: 0,
      inHouseStayCount: 0,
      guestCount: 2,
      propertyBookedCount: 1,
      pendingPaymentCount: 0,
      cancelledCount: 0,
      rebookCount: 0,
      expiredHoldCount: 0,
      properties: [],
      daily: [],
      paymentMethods: [],
    };

    const filled = withReportDefaults({ ...report, pipeline: [oldApiReservation()], stays: [oldApiReservation()] });

    expect(filled.pipeline[0]?.cancellation).toBeNull();
    expect(filled.stays[0]?.refunds).toEqual([]);
    expect(filled.revenueCents).toBe(100);
  });

  it('fills what an API from before pay at hotel does not send: nothing unpaid, nothing to collect', () => {
    const base = {
      from: '2027-01-01', to: '2027-01-31', asOfDate: '2027-01-15', propertyId: null, currencyCode: 'EUR', houseCount: 1, availableNights: 31,
      reservationCount: 1, occupiedNights: 2, revenueCents: 100, averageNightlyCents: 50, occupancyPercent: 6, upcomingStayCount: 0,
      inHouseStayCount: 0, guestCount: 2, propertyBookedCount: 1, pendingPaymentCount: 0, cancelledCount: 0, rebookCount: 0, expiredHoldCount: 0,
      properties: [], daily: [], paymentMethods: [], pipeline: [], stays: [],
    };

    const filled = withReportDefaults(base);

    expect(filled.unpaidAtHotelCount).toBe(0);
    expect(filled.unpaidAtHotelCents).toBe(0);
    expect(filled.attention).toMatchObject({ unpaidAtHotelCount: 0, unpaidAtHotelCents: 0, unpaidAtHotelArrivalsNext7DaysCount: 0, unpaidAtHotelPastCount: 0 });
    expect(filled.previous.unpaidAtHotelCents).toBe(0);
  });

  it('adds the unpaid-at-hotel fields to an attention block that has only the older ones, and keeps the numbers it has', () => {
    const base = {
      from: '2027-01-01', to: '2027-01-31', asOfDate: '2027-01-15', propertyId: null, currencyCode: 'EUR', houseCount: 1, availableNights: 31,
      reservationCount: 1, occupiedNights: 2, revenueCents: 100, averageNightlyCents: 50, occupancyPercent: 6, upcomingStayCount: 0,
      inHouseStayCount: 0, guestCount: 2, propertyBookedCount: 1, pendingPaymentCount: 0, cancelledCount: 0, rebookCount: 0, expiredHoldCount: 0,
      properties: [], daily: [], paymentMethods: [], pipeline: [], stays: [],
      attention: { unpaidHoldCount: 2, refundsToPayCount: 1, refundsToPayCents: 500, arrivalsTodayCount: 1, arrivalsNext7DaysCount: 3 },
    };

    const filled = withReportDefaults(base);

    expect(filled.attention).toEqual({
      unpaidHoldCount: 2, refundsToPayCount: 1, refundsToPayCents: 500, arrivalsTodayCount: 1, arrivalsNext7DaysCount: 3,
      unpaidAtHotelCount: 0, unpaidAtHotelCents: 0, unpaidAtHotelArrivalsNext7DaysCount: 0, unpaidAtHotelPastCount: 0,
    });
  });
});
