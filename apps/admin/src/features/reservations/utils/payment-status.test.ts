/**
 * @file apps/admin/src/features/reservations/utils/payment-status.test.ts
 * @feature reservations
 */

import { describe, expect, it } from 'vitest';
import { staffReservation } from '@/test/fixtures';
import { canMarkPaid, paymentChipStyle, paymentMethodText } from './payment-status';

const pending = { paymentMethod: 'pay_at_hotel', paymentStatus: 'pending' } as const;

describe('paymentChipStyle', () => {
  it('warns "Pay at hotel · Pending" until it is marked paid, then says "Paid at hotel"', () => {
    expect(paymentChipStyle(pending)).toEqual({ label: 'Pay at hotel · Pending', tone: 'warning' });
    expect(paymentChipStyle({ paymentMethod: 'pay_at_hotel', paymentStatus: 'paid' })).toEqual({ label: 'Paid at hotel', tone: 'success' });
  });

  it('keeps online bookings quiet unless a plain "Paid" is asked for', () => {
    expect(paymentChipStyle({ paymentMethod: 'card', paymentStatus: 'paid' })).toBeNull();
    expect(paymentChipStyle({ paymentMethod: 'card', paymentStatus: 'paid' }, true)).toEqual({ label: 'Paid', tone: 'success' });
    expect(paymentChipStyle({ paymentMethod: null, paymentStatus: 'paid' }, true)).toEqual({ label: 'Paid', tone: 'success' });
  });
});

describe('paymentMethodText', () => {
  it('names every method', () => {
    expect(paymentMethodText('pay_at_hotel')).toBe('Pay at hotel');
    expect(paymentMethodText('bank_transfer')).toBe('Bank transfer');
    expect(paymentMethodText('card')).toBe('Card / Apple Pay / Google Pay');
    expect(paymentMethodText(null)).toBe('Not recorded');
  });
});

describe('canMarkPaid', () => {
  it('is only for a confirmed, pending pay-at-hotel booking', () => {
    expect(canMarkPaid(staffReservation(pending))).toBe(true);
    expect(canMarkPaid(staffReservation({ ...pending, paymentStatus: 'paid' }))).toBe(false);
    expect(canMarkPaid(staffReservation({ ...pending, status: 'cancelled' }))).toBe(false);
    expect(canMarkPaid(staffReservation({ ...pending, kind: 'hold', status: 'active' }))).toBe(false);
    expect(canMarkPaid(staffReservation({ paymentMethod: 'card', paymentStatus: 'pending' }))).toBe(false);
  });
});
