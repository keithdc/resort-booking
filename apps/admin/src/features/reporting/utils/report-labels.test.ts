/**
 * @file apps/admin/src/features/reporting/utils/report-labels.test.ts
 * @feature reporting
 */

import { describe, expect, it } from 'vitest';
import { staffReservation } from '@/test/fixtures';
import {
  BOOKING_FILTER_OPTIONS,
  bookingNights,
  bookingPaymentLabel,
  bookingPaymentStatusLabel,
  bookingStatusKey,
  bookingStatusLabel,
  isUnpaidAtHotel,
  paymentMethodLabel,
  unpaidArrivalHint,
} from './report-labels';

describe('paymentMethodLabel', () => {
  it('names each method and the unknown case', () => {
    expect(paymentMethodLabel('card')).toBe('Card / wallets');
    expect(paymentMethodLabel('bank_transfer')).toBe('Bank transfer');
    expect(paymentMethodLabel('pay_at_hotel')).toBe('Pay at hotel');
    expect(paymentMethodLabel('unknown')).toBe('Not recorded');
    expect(paymentMethodLabel(null)).toBe('Not recorded');
  });
});

describe('bookingPaymentLabel', () => {
  it('adds "Pending" only while a pay-at-hotel booking is unpaid', () => {
    expect(bookingPaymentLabel({ paymentMethod: 'pay_at_hotel', paymentStatus: 'pending' })).toBe('Pay at hotel · Pending');
    expect(bookingPaymentLabel({ paymentMethod: 'pay_at_hotel', paymentStatus: 'paid' })).toBe('Pay at hotel');
    expect(bookingPaymentLabel({ paymentMethod: 'card', paymentStatus: 'paid' })).toBe('Card / wallets');
  });
});

describe('bookingStatusKey', () => {
  it('maps the four states', () => {
    expect(bookingStatusKey(staffReservation({ status: 'confirmed' }))).toBe('confirmed');
    expect(bookingStatusKey(staffReservation({ kind: 'hold', status: 'active' }))).toBe('awaiting_payment');
    expect(bookingStatusKey(staffReservation({ kind: 'hold', status: 'expired' }))).toBe('expired');
    expect(bookingStatusKey(staffReservation({ status: 'cancelled' }))).toBe('cancelled');
  });

  it('counts a released hold as cancelled', () => {
    expect(bookingStatusKey(staffReservation({ kind: 'hold', status: 'released' }))).toBe('cancelled');
  });
});

describe('bookingStatusLabel', () => {
  it('uses plain words, including check-in and check-out', () => {
    expect(bookingStatusLabel(staffReservation())).toBe('Confirmed');
    expect(bookingStatusLabel(staffReservation({ arrivalStatus: 'checked_in' }))).toBe('Staying now');
    expect(bookingStatusLabel(staffReservation({ arrivalStatus: 'checked_out' }))).toBe('Checked out');
    expect(bookingStatusLabel(staffReservation({ kind: 'hold', status: 'active' }))).toBe('Awaiting payment');
    expect(bookingStatusLabel(staffReservation({ status: 'cancelled' }))).toBe('Cancelled');
    expect(bookingStatusLabel(staffReservation({ kind: 'hold', status: 'expired' }))).toBe('Expired');
  });
});

describe('bookingNights', () => {
  it('counts nights, across a month end', () => {
    expect(bookingNights({ checkIn: '2027-07-30', checkOut: '2027-08-02' })).toBe(3);
  });

  it('never goes negative', () => {
    expect(bookingNights({ checkIn: '2027-07-30', checkOut: '2027-07-29' })).toBe(0);
  });
});

describe('the unpaid-at-hotel filter and labels', () => {
  const pending = { paymentMethod: 'pay_at_hotel', paymentStatus: 'pending', paidCents: 0 } as const;

  it('puts "Unpaid at hotel" after the four states in the filter list', () => {
    expect(BOOKING_FILTER_OPTIONS.map((option) => option.value)).toEqual(['confirmed', 'awaiting_payment', 'cancelled', 'expired', 'unpaid_at_hotel']);
  });

  it('is unpaid at the hotel only for a confirmed booking nobody marked paid', () => {
    expect(isUnpaidAtHotel(staffReservation(pending))).toBe(true);
    expect(isUnpaidAtHotel(staffReservation({ ...pending, paymentStatus: 'paid' }))).toBe(false);
    expect(isUnpaidAtHotel(staffReservation({ ...pending, status: 'cancelled' }))).toBe(false);
    expect(isUnpaidAtHotel(staffReservation())).toBe(false);
  });

  it('gives each booking its payment status in words for the CSV', () => {
    expect(bookingPaymentStatusLabel(staffReservation(pending))).toBe('Pending');
    expect(bookingPaymentStatusLabel(staffReservation())).toBe('Paid');
    expect(bookingPaymentStatusLabel(staffReservation({ kind: 'hold', status: 'active' }))).toBe('Awaiting payment');
    expect(bookingPaymentStatusLabel(staffReservation({ kind: 'hold', status: 'expired' }))).toBe('');
    expect(bookingPaymentStatusLabel(staffReservation({ ...pending, status: 'cancelled' }))).toBe('');
  });

  it('says how soon an unpaid guest arrives: passed, today, within a week, and nothing beyond', () => {
    expect(unpaidArrivalHint('2027-07-14', '2027-07-15')).toBe('Check-in passed');
    expect(unpaidArrivalHint('2027-07-15', '2027-07-15')).toBe('Arrives today');
    expect(unpaidArrivalHint('2027-07-16', '2027-07-15')).toBe('Arrives in 1 day');
    expect(unpaidArrivalHint('2027-07-22', '2027-07-15')).toBe('Arrives in 7 days');
    expect(unpaidArrivalHint('2027-07-23', '2027-07-15')).toBeNull();
    expect(unpaidArrivalHint('not-a-date', '2027-07-15')).toBeNull();
  });
});
