/**
 * @file apps/api/src/modules/inventory/inventory.rules.spec.ts
 * @feature inventory
 * @dependencies inventory.rules
 */

import {
  holdTtlSeconds,
  isCheckInBeforeToday,
  nightsBetween,
  quoteTotalCents,
} from './inventory.rules';

describe('inventory.rules', () => {
  it('counts nights as exclusive checkout', (): void => {
    expect(nightsBetween('2026-09-20', '2026-09-22')).toBe(2);
  });

  it('rejects inverted or same-day ranges', (): void => {
    expect(nightsBetween('2026-09-22', '2026-09-20')).toBeNull();
    expect(nightsBetween('2026-09-20', '2026-09-20')).toBeNull();
  });

  it('uses 15 minutes for card and 48 hours for bank transfer', (): void => {
    expect(holdTtlSeconds('card')).toBe(900);
    expect(holdTtlSeconds('bank_transfer')).toBe(172800);
  });

  it('flags a guest check-in in the past', (): void => {
    expect(isCheckInBeforeToday('2026-09-14', '2026-09-15')).toBe(true);
    expect(isCheckInBeforeToday('2026-09-15', '2026-09-15')).toBe(false);
  });

  it('multiplies nights by the house rate', (): void => {
    expect(quoteTotalCents(3, 18000)).toBe(54000);
  });
});
