/**
 * @file apps/web/src/features/bookings/utils/rebook-labels.test.ts
 * @feature bookings
 */

import { describe, expect, it } from 'vitest';
import { balanceKind, balanceStatement, confirmLabel } from './rebook-labels';

const plain = (text: string): string => text.replace(/\s/g, ' ');
const pay = { payCents: 12000, refundCents: 0, currencyCode: 'EUR' };
const refund = { payCents: 0, refundCents: 8000, currencyCode: 'EUR' };
const even = { payCents: 0, refundCents: 0, currencyCode: 'EUR' };

describe('balanceKind', () => {
  it('says which way the money moves', () => {
    expect(balanceKind(pay)).toBe('pay');
    expect(balanceKind(refund)).toBe('refund');
    expect(balanceKind(even)).toBe('even');
  });

  it('treats a single cent as a real payment or refund', () => {
    expect(balanceKind({ payCents: 1, refundCents: 0 })).toBe('pay');
    expect(balanceKind({ payCents: 0, refundCents: 1 })).toBe('refund');
  });
});

describe('balanceStatement', () => {
  it('says what the guest pays, gets back, or neither', () => {
    expect(plain(balanceStatement(pay))).toBe('You pay 120,00 € more');
    expect(plain(balanceStatement(refund))).toBe('You get 80,00 € back');
    expect(balanceStatement(even)).toBe('Nothing more to pay and nothing to refund');
  });
});

describe('confirmLabel', () => {
  it('puts the exact amount on the button', () => {
    expect(plain(confirmLabel(pay))).toBe('Pay 120,00 € and change my dates');
    expect(plain(confirmLabel(refund))).toBe('Change my dates and get 80,00 € back');
    expect(confirmLabel(even)).toBe('Change my dates');
  });
});
