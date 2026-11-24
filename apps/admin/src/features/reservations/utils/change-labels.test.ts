/**
 * @file apps/admin/src/features/reservations/utils/change-labels.test.ts
 * @feature reservations
 */

import { describe, expect, it } from 'vitest';
import { confirmChangeLabel, outsidePaymentLabel, staffBalanceKind, staffBalanceStatement } from './change-labels';

const plain = (text: string): string => text.replace(/\s/g, ' ');
const pay = { payCents: 30800, refundCents: 0, currencyCode: 'EUR' };
const refund = { payCents: 0, refundCents: 12000, currencyCode: 'EUR' };
const even = { payCents: 0, refundCents: 0, currencyCode: 'EUR' };

describe('staffBalanceKind', () => {
  it('says which way the money moves', () => {
    expect(staffBalanceKind(pay)).toBe('pay');
    expect(staffBalanceKind(refund)).toBe('refund');
    expect(staffBalanceKind(even)).toBe('even');
  });

  it('treats one cent as real', () => {
    expect(staffBalanceKind({ payCents: 1, refundCents: 0 })).toBe('pay');
    expect(staffBalanceKind({ payCents: 0, refundCents: 1 })).toBe('refund');
  });
});

describe('staffBalanceStatement', () => {
  it('speaks about the guest, in euros', () => {
    expect(plain(staffBalanceStatement(pay))).toBe('The guest owes 308,00 € more');
    expect(plain(staffBalanceStatement(refund))).toBe('The guest gets 120,00 € back');
    expect(staffBalanceStatement(even)).toBe('Nothing more to pay and nothing to refund');
  });
});

describe('outsidePaymentLabel', () => {
  it('names the exact amount', () => {
    expect(plain(outsidePaymentLabel(pay))).toBe('The guest has paid the difference of 308,00 € outside the system (cash or bank)');
  });
});

describe('confirmChangeLabel', () => {
  it('states the exact outcome on the button', () => {
    expect(plain(confirmChangeLabel(pay))).toBe('Change dates (guest paid 308,00 €)');
    expect(plain(confirmChangeLabel(refund))).toBe('Change dates and refund 120,00 €');
    expect(confirmChangeLabel(even)).toBe('Change dates');
  });
});
