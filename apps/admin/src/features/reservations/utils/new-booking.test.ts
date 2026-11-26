/**
 * @file apps/admin/src/features/reservations/utils/new-booking.test.ts
 * @feature reservations
 */

import { describe, expect, it } from 'vitest';
import type { ExtraService } from '@resort-booking/shared-types';
import { extraChoices, extraPriceText, NEW_BOOKING_PAYMENT_OPTIONS, stayFromDraft, stayProblem, wholeNumberInRange } from './new-booking';

const HOUSE = { id: 'h1', capacity: 4, name: 'Lake Chalet' };
const DRAFT = { houseId: 'h1', checkIn: '2027-07-10', nights: '3', guests: '2' };
const TODAY = '2027-07-01';

describe('wholeNumberInRange', () => {
  it('accepts whole numbers in range and refuses everything else', () => {
    expect(wholeNumberInRange('3', 1, 4)).toBe(3);
    expect(wholeNumberInRange(' 4 ', 1, 4)).toBe(4);
    for (const bad of ['0', '5', '', '1.5', '-1', '1e1', 'two', '1234']) {
      expect(wholeNumberInRange(bad, 1, 4)).toBeNull();
    }
  });
});

describe('stayFromDraft', () => {
  it('works out the check-out and a numeric party', () => {
    expect(stayFromDraft(DRAFT, HOUSE, TODAY)).toEqual({ houseId: 'h1', checkIn: '2027-07-10', checkOut: '2027-07-13', guestCount: 2 });
  });

  it('allows check-in today and refuses the past, a missing stay and too many guests or nights', () => {
    expect(stayFromDraft({ ...DRAFT, checkIn: TODAY }, HOUSE, TODAY)).not.toBeNull();
    expect(stayFromDraft({ ...DRAFT, checkIn: '2027-06-30' }, HOUSE, TODAY)).toBeNull();
    expect(stayFromDraft(DRAFT, null, TODAY)).toBeNull();
    expect(stayFromDraft({ ...DRAFT, houseId: 'other' }, HOUSE, TODAY)).toBeNull();
    expect(stayFromDraft({ ...DRAFT, guests: '5' }, HOUSE, TODAY)).toBeNull();
    expect(stayFromDraft({ ...DRAFT, nights: '61' }, HOUSE, TODAY)).toBeNull();
    expect(stayFromDraft({ ...DRAFT, checkIn: '' }, HOUSE, TODAY)).toBeNull();
  });
});

describe('stayProblem', () => {
  it('says what is missing, in order', () => {
    expect(stayProblem(DRAFT, null, TODAY)).toBe('Choose a property and a stay.');
    expect(stayProblem({ ...DRAFT, checkIn: '' }, HOUSE, TODAY)).toBe('Choose the check-in date.');
    expect(stayProblem({ ...DRAFT, checkIn: '2027-06-01' }, HOUSE, TODAY)).toBe('Check-in cannot be in the past.');
    expect(stayProblem({ ...DRAFT, nights: '0' }, HOUSE, TODAY)).toContain('Nights must be');
    expect(stayProblem({ ...DRAFT, guests: '9' }, HOUSE, TODAY)).toContain('sleeps up to 4');
    expect(stayProblem(DRAFT, HOUSE, TODAY)).toBeNull();
  });
});

describe('payment options', () => {
  it('opens only pay at hotel; the credit card option says it is coming soon', () => {
    expect(NEW_BOOKING_PAYMENT_OPTIONS.filter((option) => option.enabled).map((option) => option.value)).toEqual(['pay_at_hotel']);
    expect(NEW_BOOKING_PAYMENT_OPTIONS.find((option) => option.value === 'card_link')).toMatchObject({ label: 'Credit card', help: 'Payment link: coming soon' });
  });
});

describe('extraChoices', () => {
  const extra = (id: string, overrides: Partial<ExtraService> = {}): ExtraService => ({
    id, organizationId: 'o', propertyId: 'p', name: id, description: '', kind: 'instant', priceCents: 100, currencyCode: 'EUR', published: true, ...overrides,
  });
  const OFFERED = [extra('a'), extra('b'), extra('c')];

  it('keeps ticked extras in the property\'s order, with whole quantities of 1 or more', () => {
    expect(extraChoices({ b: 2, a: 1 }, OFFERED)).toEqual([{ extraId: 'a', quantity: 1 }, { extraId: 'b', quantity: 2 }]);
  });

  it('leaves out unticked ones, nonsense quantities, and extras the property does not offer', () => {
    expect(extraChoices({ a: 0, b: -3, c: Number.NaN, gone: 4 }, OFFERED)).toEqual([]);
    expect(extraChoices({ a: 2.9 }, OFFERED)).toEqual([{ extraId: 'a', quantity: 2 }]);
  });

  it('never asks for more than 20 of one', () => {
    expect(extraChoices({ a: 99 }, OFFERED)).toEqual([{ extraId: 'a', quantity: 20 }]);
  });
});

describe('extraPriceText', () => {
  const money = (cents: number): string => `€${String(cents / 100)}`;

  it('shows the price of an instant extra, "Free" at nothing, and says a request charges nothing now', () => {
    expect(extraPriceText({ kind: 'instant', priceCents: 1800 }, money)).toBe('€18');
    expect(extraPriceText({ kind: 'instant', priceCents: 0 }, money)).toBe('Free');
    expect(extraPriceText({ kind: 'on_request', priceCents: 0 }, money)).toBe('On request · nothing charged now');
    expect(extraPriceText({ kind: 'on_request', priceCents: 2500 }, money)).toBe('On request · listed at €25, nothing charged now');
  });
});
