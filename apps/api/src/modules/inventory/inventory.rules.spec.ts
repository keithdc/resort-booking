/**
 * @file apps/api/src/modules/inventory/inventory.rules.spec.ts
 * @feature inventory
 * @dependencies inventory.rules
 */

import {
  holdTtlSeconds,
  isPriceSnapshot,
  isCheckInBeforeToday,
  maskEmail,
  maskPhone,
  nightsBetween,
  referenceFor,
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

  it('derives a short readable booking reference from the stay id', () => {
    expect(referenceFor('1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d')).toBe('BK-1A2B3C4D5E');
  });

  it('gives different stays different references', () => {
    expect(referenceFor('11111111-1111-4111-8111-111111111111')).not.toBe(referenceFor('22222222-2222-4222-8222-222222222222'));
  });
});

describe('isPriceSnapshot with discount percents', () => {
  const base = { lines: [], subtotalCents: 98000, discountCents: 9800, totalCents: 88200, currencyCode: 'EUR', promoCode: null };

  it('accepts a snapshot whose discount lines carry a percent, and keeps it', () => {
    const snapshot: unknown = { ...base, discounts: [{ discountId: 'd', label: 'Long stay', amountCents: 9800, percent: 10 }] };

    expect(isPriceSnapshot(snapshot)).toBe(true);
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });

  it('still accepts an older snapshot without a percent', () => {
    expect(isPriceSnapshot({ ...base, discounts: [{ discountId: 'd', label: 'Long stay', amountCents: 9800 }] })).toBe(true);
  });
});

describe('masking contact details for the hold link', () => {
  it('keeps the first letter and the domain of an email', () => {
    expect(maskEmail('ada@example.com')).toBe('a**@example.com');
    expect(maskEmail('a@example.com')).toBe('a@example.com');
    expect(maskEmail('very.long.name@example.com')).toBe('v******@example.com');
  });

  it('hides an email with no @ or no name part', () => {
    expect(maskEmail('nonsense')).toBe('***');
    expect(maskEmail('@example.com')).toBe('***');
    expect(maskEmail('')).toBe('***');
  });

  it('shows only the last three digits of a phone number', () => {
    expect(maskPhone('+33612345678')).toBe('+••••• 678');
    expect(maskPhone('+1 (415) 555-0132')).toBe('+••••• 132');
    expect(maskPhone('0612345678')).toBe('••••• 678');
  });

  it('hides a number that is too short to mask meaningfully', () => {
    expect(maskPhone('12345')).toBe('•••');
    expect(maskPhone('')).toBe('•••');
  });
});
