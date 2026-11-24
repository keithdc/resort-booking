/**
 * @file apps/api/src/modules/inventory/inventory.rules.spec.ts
 * @feature inventory
 * @dependencies inventory.rules
 */

import {
  holdTtlSeconds,
  isCheckInBeforeToday,
  nightsBetween,
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

  it('rejects malformed ISO dates and impossible calendar days', (): void => {
    expect(nightsBetween('20-09-2026', '2026-09-22')).toBeNull();
    expect(nightsBetween('2026-02-30', '2026-03-02')).toBeNull();
    expect(nightsBetween('', '2026-09-22')).toBeNull();
  });

  it('counts a month-end crossing', (): void => {
    expect(nightsBetween('2026-09-30', '2026-10-02')).toBe(2);
  });
});
