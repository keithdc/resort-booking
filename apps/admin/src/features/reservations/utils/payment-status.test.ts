/**
 * @file apps/admin/src/features/reservations/utils/payment-status.test.ts
 * @feature reservations
 */

import { describe, expect, it } from 'vitest';
import { staffReservation } from '@/test/fixtures';
import { bookingExtraText, canMarkPaid, MARK_PAID_NEEDS_ACCESS_MESSAGE, paymentChipStyle, paymentMethodText } from './payment-status';

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

describe('bookingExtraText', () => {
  const money = (cents: number): string => `€${String(cents / 100)}`;
  const base = { id: 'e', extraServiceId: null, name: 'Breakfast basket', quantity: 2, unitPriceCents: 1800, currencyCode: 'EUR' } as const;

  it('shows an instant extra with what it adds to the total', () => {
    expect(bookingExtraText({ ...base, kind: 'instant', lineCents: 3600, status: 'confirmed' }, money)).toBe('Breakfast basket × 2 · €36');
    expect(bookingExtraText({ ...base, kind: 'instant', unitPriceCents: 0, lineCents: 0, status: 'confirmed' }, money)).toBe('Breakfast basket × 2 · Free');
  });

  it('says a request is waiting for the property and charges nothing, or that it was declined', () => {
    expect(bookingExtraText({ ...base, name: 'Extra pillows', kind: 'on_request', unitPriceCents: 0, lineCents: 0, status: 'pending' }, money)).toContain('waiting for the property to confirm, nothing charged');
    expect(bookingExtraText({ ...base, name: 'Extra pillows', kind: 'on_request', unitPriceCents: 0, lineCents: 0, status: 'declined' }, money)).toBe('Extra pillows × 2 · Declined');
  });
});

describe('MARK_PAID_NEEDS_ACCESS_MESSAGE', () => {
  it('tells an employee who to ask and where an admin can give refund access', () => {
    expect(MARK_PAID_NEEDS_ACCESS_MESSAGE).toContain('Ask an admin');
    expect(MARK_PAID_NEEDS_ACCESS_MESSAGE).toContain('refund access on the Team page');
  });
});

describe('a booking made on another site', () => {
  it('is quiet in lists and says "Paid on the other site" on the booking card; it is never markable as paid', () => {
    const stay = { paymentMethod: 'paid_by_channel' as const, paymentStatus: 'paid' as const };

    expect(paymentChipStyle(stay)).toBeNull();
    expect(paymentChipStyle(stay, true)).toEqual({ label: 'Paid on the other site', tone: 'success' });
    expect(paymentMethodText('paid_by_channel')).toBe('Paid on the other website');
  });
});
