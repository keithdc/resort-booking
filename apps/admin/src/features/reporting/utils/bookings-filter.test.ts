/**
 * @file apps/admin/src/features/reporting/utils/bookings-filter.test.ts
 * @feature reporting
 */

import { describe, expect, it } from 'vitest';
import { staffRefund, staffReservation } from '@/test/fixtures';
import { countByStatus, filterBookings, withReportRefunds } from './bookings-filter';

const ROWS = [
  staffReservation({ id: '1', bookerName: 'Ada Lovelace', reference: 'BK-AAAA000001' }),
  staffReservation({ id: '2', bookerName: 'Grace Hopper', bookerEmail: 'grace@example.com', status: 'cancelled', reference: 'BK-BBBB000002' }),
  staffReservation({ id: '3', bookerName: 'Alan Turing', bookerEmail: 'alan@example.com', kind: 'hold', status: 'active', houseName: 'Old Barn', reference: 'BK-CCCC000003' }),
  staffReservation({ id: '4', bookerName: 'Linus', bookerEmail: 'linus@example.com', kind: 'hold', status: 'expired', reference: 'BK-DDDD000004' }),
];

const ids = (rows: { id: string }[]): string[] => rows.map((row) => row.id);

describe('filterBookings', () => {
  it('returns everything for no status and no search', () => {
    expect(ids(filterBookings(ROWS, null, ''))).toEqual(['1', '2', '3', '4']);
  });

  it('filters by status', () => {
    expect(ids(filterBookings(ROWS, 'confirmed', ''))).toEqual(['1']);
    expect(ids(filterBookings(ROWS, 'awaiting_payment', ''))).toEqual(['3']);
    expect(ids(filterBookings(ROWS, 'cancelled', ''))).toEqual(['2']);
    expect(ids(filterBookings(ROWS, 'expired', ''))).toEqual(['4']);
  });

  it('searches guest, email, reference, stay and property, ignoring case and spaces around', () => {
    expect(ids(filterBookings(ROWS, null, '  ada '))).toEqual(['1']);
    expect(ids(filterBookings(ROWS, null, 'GRACE@'))).toEqual(['2']);
    expect(ids(filterBookings(ROWS, null, 'bk-cccc'))).toEqual(['3']);
    expect(ids(filterBookings(ROWS, null, 'old barn'))).toEqual(['3']);
    expect(ids(filterBookings(ROWS, null, 'alpine'))).toEqual(['1', '2', '3', '4']);
  });

  it('filters the pay-at-hotel bookings nobody has marked paid, soonest check-in first', () => {
    const rows = [
      staffReservation({ id: 'late', paymentMethod: 'pay_at_hotel', paymentStatus: 'pending', paidCents: 0, checkIn: '2027-08-20', checkOut: '2027-08-22', reference: 'BK-LATE000001' }),
      staffReservation({ id: 'paid', paymentMethod: 'pay_at_hotel', paymentStatus: 'paid', checkIn: '2027-07-01', checkOut: '2027-07-02' }),
      staffReservation({ id: 'soon', paymentMethod: 'pay_at_hotel', paymentStatus: 'pending', paidCents: 0, checkIn: '2027-07-03', checkOut: '2027-07-05', reference: 'BK-SOON000002' }),
      staffReservation({ id: 'cancelled', paymentMethod: 'pay_at_hotel', paymentStatus: 'pending', paidCents: 0, status: 'cancelled', checkIn: '2027-07-02', checkOut: '2027-07-03' }),
      staffReservation({ id: 'online', checkIn: '2027-07-02', checkOut: '2027-07-03' }),
    ];

    expect(ids(filterBookings(rows, 'unpaid_at_hotel', ''))).toEqual(['soon', 'late']);
    expect(ids(filterBookings(rows, 'unpaid_at_hotel', 'late'))).toEqual(['late']);
    // Any other filter keeps the order it was given.
    expect(ids(filterBookings(rows, 'confirmed', ''))).toEqual(['late', 'paid', 'soon', 'online']);
  });

  it('combines the status and the search', () => {
    expect(ids(filterBookings(ROWS, 'cancelled', 'ada'))).toEqual([]);
    expect(ids(filterBookings(ROWS, 'cancelled', 'grace'))).toEqual(['2']);
  });

  it('is empty when nothing matches', () => {
    expect(filterBookings(ROWS, null, 'zzz')).toEqual([]);
  });
});

describe('countByStatus', () => {
  it('counts each status', () => {
    expect(countByStatus(ROWS)).toEqual({ confirmed: 1, awaiting_payment: 1, cancelled: 1, expired: 1, unpaid_at_hotel: 0 });
    expect(countByStatus([])).toEqual({ confirmed: 0, awaiting_payment: 0, cancelled: 0, expired: 0, unpaid_at_hotel: 0 });
  });

  it('counts an unpaid pay-at-hotel booking as confirmed and as unpaid at the hotel', () => {
    const rows = [staffReservation({ id: 'u', paymentMethod: 'pay_at_hotel', paymentStatus: 'pending', paidCents: 0 }), staffReservation({ id: 'p' })];

    expect(countByStatus(rows)).toMatchObject({ confirmed: 2, unpaid_at_hotel: 1 });
  });
});

describe('withReportRefunds', () => {
  it('attaches only the refunds of that booking', () => {
    const refunds = [staffRefund({ id: 'f1', reservationId: '2' }), staffRefund({ id: 'f2', reservationId: '3' })];

    expect(withReportRefunds(ROWS[1]!, refunds).refunds.map((refund) => refund.id)).toEqual(['f1']);
    expect(withReportRefunds(ROWS[0]!, refunds).refunds).toEqual([]);
  });

  it('does not change the original row', () => {
    const row = ROWS[1]!;
    withReportRefunds(row, [staffRefund({ reservationId: '2' })]);
    expect(row.refunds).toEqual([]);
  });
});
