/**
 * @file apps/admin/src/features/reporting/utils/report-labels.test.ts
 * @feature reporting
 */

import { describe, expect, it } from 'vitest';
import { staffReservation } from '@/test/fixtures';
import { bookingNights, bookingStatusKey, bookingStatusLabel, paymentMethodLabel } from './report-labels';

describe('paymentMethodLabel', () => {
  it('names each method and the unknown case', () => {
    expect(paymentMethodLabel('card')).toBe('Card / wallets');
    expect(paymentMethodLabel('bank_transfer')).toBe('Bank transfer');
    expect(paymentMethodLabel('unknown')).toBe('Not recorded');
    expect(paymentMethodLabel(null)).toBe('Not recorded');
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
