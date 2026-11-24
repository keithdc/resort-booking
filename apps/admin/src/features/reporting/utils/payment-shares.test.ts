/**
 * @file apps/admin/src/features/reporting/utils/payment-shares.test.ts
 * @feature reporting
 */

import { describe, expect, it } from 'vitest';
import { buildPaymentShares } from './payment-shares';

describe('buildPaymentShares', () => {
  it('gives each method its share of the money, biggest first', () => {
    const shares = buildPaymentShares([
      { paymentMethod: 'bank_transfer', reservationCount: 1, revenueCents: 25000 },
      { paymentMethod: 'card', reservationCount: 3, revenueCents: 75000 },
    ]);

    expect(shares.map((share) => [share.label, share.bookings, share.sharePercent])).toEqual([
      ['Card / wallets', 3, 75],
      ['Bank transfer', 1, 25],
    ]);
  });

  it('is empty without payments and safe when the money adds to zero', () => {
    expect(buildPaymentShares([])).toEqual([]);
    expect(buildPaymentShares([{ paymentMethod: 'card', reservationCount: 1, revenueCents: 0 }])[0]?.sharePercent).toBe(0);
  });

  it('does not change its input and names the unknown method', () => {
    const input = [
      { paymentMethod: 'unknown' as const, reservationCount: 1, revenueCents: 1 },
      { paymentMethod: 'card' as const, reservationCount: 1, revenueCents: 2 },
    ];
    const shares = buildPaymentShares(input);

    expect(input[0]?.paymentMethod).toBe('unknown');
    expect(shares[1]?.label).toBe('Not recorded');
  });
});
