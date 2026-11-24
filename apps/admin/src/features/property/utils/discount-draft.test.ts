/**
 * @file apps/admin/src/features/property/utils/discount-draft.test.ts
 * @feature property
 */

import type { Discount, HouseSummary } from '@resort-booking/shared-types';
import { describe, expect, it } from 'vitest';
import {
  draftFromDiscount,
  draftToWrite,
  EMPTY_DISCOUNT_DRAFT,
  summarizeCondition,
  summarizeConditions,
  summarizeEffect,
  summarizeScope,
  summarizeUses,
  validateDraft,
  type DiscountDraft,
} from './discount-draft';

function draft(overrides: Partial<DiscountDraft> = {}): DiscountDraft {
  return { ...EMPTY_DISCOUNT_DRAFT, label: 'Long stay', value: '10', minNightsOn: true, minNights: '7', ...overrides };
}

function discount(overrides: Partial<Discount> = {}): Discount {
  return {
    id: 'd1',
    propertyId: 'p1',
    label: 'Long stay',
    effect: { kind: 'percent', percent: 10 },
    conditions: [{ kind: 'min_nights', nights: 7 }],
    alwaysOn: false,
    houseIds: null,
    combinable: false,
    priority: 100,
    active: true,
    maxRedemptions: null,
    redemptions: 0,
    ...overrides,
  };
}

function house(id: string, name: string): HouseSummary {
  return {
    id,
    organizationId: 'o',
    propertyId: 'p1',
    propertySlug: 'p',
    propertyName: 'P',
    propertyCity: '',
    propertyCountryCode: 'FR',
    propertyTimezone: 'Europe/Paris',
    propertyAddressLine: '',
    propertyPostalCode: '',
    slug: id,
    name,
    description: '',
    capacity: 4,
    published: true,
    nightlyRateCents: 10000,
    currencyCode: 'EUR',
    coverPhotoUrl: null,
  };
}

describe('draftToWrite', () => {
  it('builds a percent discount on every house with one condition', () => {
    expect(draftToWrite(draft())).toEqual({
      label: 'Long stay',
      effect: { kind: 'percent', percent: 10 },
      conditions: [{ kind: 'min_nights', nights: 7 }],
      alwaysOn: false,
      houseIds: null,
      combinable: false,
      priority: 100,
      active: true,
      maxRedemptions: null,
    });
  });

  it('converts a fixed euro amount to cents, accepting a comma', () => {
    expect(draftToWrite(draft({ effectKind: 'fixed', value: '20,50' })).effect).toEqual({ kind: 'fixed', amountCents: 2050 });
  });

  it('builds each condition kind', () => {
    const write = draftToWrite(
      draft({
        leadOn: true,
        leadMin: '60',
        leadMax: '',
        stayOn: true,
        stayStart: '2027-07-01',
        stayEnd: '2027-07-31',
        windowOn: true,
        windowStart: '2027-05-01',
        windowEnd: '2027-05-31',
        weekdayOn: true,
        weekdays: [4, 0, 1],
        promoOn: true,
        promoCode: ' WELCOME15 ',
      }),
    );
    expect(write.conditions).toEqual([
      { kind: 'min_nights', nights: 7 },
      { kind: 'booking_lead_days', minDays: 60, maxDays: null },
      { kind: 'stay_dates', startDate: '2027-07-01', endDate: '2027-07-31' },
      { kind: 'booking_window', startDate: '2027-05-01', endDate: '2027-05-31' },
      { kind: 'weekday', days: [0, 1, 4] },
      { kind: 'promo_code', code: 'WELCOME15' },
    ]);
  });

  it('sends no conditions when always on, even if some were ticked', () => {
    const write = draftToWrite(draft({ alwaysOn: true }));
    expect(write.conditions).toEqual([]);
    expect(write.alwaysOn).toBe(true);
  });

  it('sends chosen houses, the use limit, and combinable/priority/active', () => {
    const write = draftToWrite(
      draft({ scope: 'chosen', houseIds: ['h1', 'h2'], limitOn: true, maxRedemptions: '50', combinable: true, priority: '10', active: false }),
    );
    expect(write).toMatchObject({ houseIds: ['h1', 'h2'], maxRedemptions: 50, combinable: true, priority: 10, active: false });
  });

  it('ignores the use limit text when the limit is off', () => {
    expect(draftToWrite(draft({ limitOn: false, maxRedemptions: '9' })).maxRedemptions).toBeNull();
  });
});

describe('draftFromDiscount', () => {
  it('round-trips every kind of discount', () => {
    const original = discount({
      effect: { kind: 'fixed', amountCents: 2050 },
      conditions: [
        { kind: 'min_nights', nights: 7 },
        { kind: 'booking_lead_days', minDays: 14, maxDays: 30 },
        { kind: 'stay_dates', startDate: '2027-07-01', endDate: '2027-07-31' },
        { kind: 'booking_window', startDate: '2027-05-01', endDate: '2027-05-31' },
        { kind: 'weekday', days: [0, 1] },
        { kind: 'promo_code', code: 'ABC' },
      ],
      houseIds: ['h1'],
      combinable: true,
      priority: 5,
      active: false,
      maxRedemptions: 20,
    });
    expect(draftToWrite(draftFromDiscount(original))).toEqual({
      label: original.label,
      effect: original.effect,
      conditions: original.conditions,
      alwaysOn: original.alwaysOn,
      houseIds: original.houseIds,
      combinable: original.combinable,
      priority: original.priority,
      active: original.active,
      maxRedemptions: original.maxRedemptions,
    });
  });

  it('round-trips an always-on discount on all houses', () => {
    const original = discount({ conditions: [], alwaysOn: true });
    const filled = draftFromDiscount(original);
    expect(filled.alwaysOn).toBe(true);
    expect(filled.scope).toBe('all');
    expect(draftToWrite(filled).conditions).toEqual([]);
  });

  it('shows a fixed amount in euros', () => {
    expect(draftFromDiscount(discount({ effect: { kind: 'fixed', amountCents: 2000 } })).value).toBe('20');
  });
});

describe('validateDraft', () => {
  it('accepts a good draft', () => {
    expect(validateDraft(draft())).toEqual({});
  });

  it('accepts an always-on draft with no conditions', () => {
    expect(validateDraft(draft({ alwaysOn: true, minNightsOn: false }))).toEqual({});
  });

  it('needs a name, and not an oversized one', () => {
    expect(validateDraft(draft({ label: '  ' })).label).toBeDefined();
    expect(validateDraft(draft({ label: 'x'.repeat(81) })).label).toBeDefined();
    expect(validateDraft(draft({ label: 'x'.repeat(80) })).label).toBeUndefined();
  });

  it.each(['', '0', '101', '12.5', '-5', 'ten'])('rejects a percentage of %j', (value) => {
    expect(validateDraft(draft({ value })).value).toBeDefined();
  });

  it('accepts 1 and 100 percent', () => {
    expect(validateDraft(draft({ value: '1' })).value).toBeUndefined();
    expect(validateDraft(draft({ value: '100' })).value).toBeUndefined();
  });

  it('needs a fixed amount above zero', () => {
    expect(validateDraft(draft({ effectKind: 'fixed', value: '0' })).value).toBeDefined();
    expect(validateDraft(draft({ effectKind: 'fixed', value: '' })).value).toBeDefined();
    expect(validateDraft(draft({ effectKind: 'fixed', value: '-3' })).value).toBeDefined();
    expect(validateDraft(draft({ effectKind: 'fixed', value: '0,01' })).value).toBeUndefined();
  });

  it('needs at least one house when houses are chosen', () => {
    expect(validateDraft(draft({ scope: 'chosen', houseIds: [] })).houses).toBeDefined();
    expect(validateDraft(draft({ scope: 'chosen', houseIds: ['h1'] })).houses).toBeUndefined();
  });

  it('needs a condition unless always on', () => {
    expect(validateDraft(draft({ minNightsOn: false })).conditions).toBeDefined();
    expect(validateDraft(draft({ minNightsOn: false, alwaysOn: true })).conditions).toBeUndefined();
  });

  it('checks minimum nights', () => {
    expect(validateDraft(draft({ minNights: '0' })).minNights).toBeDefined();
    expect(validateDraft(draft({ minNights: '' })).minNights).toBeDefined();
    expect(validateDraft(draft({ minNights: '2.5' })).minNights).toBeDefined();
  });

  it('checks days-ahead: needs one end, whole numbers, and max not below min', () => {
    const lead = (leadMin: string, leadMax: string): string | undefined =>
      validateDraft(draft({ minNightsOn: false, leadOn: true, leadMin, leadMax })).lead;
    expect(lead('', '')).toBeDefined();
    expect(lead('-1', '')).toBeDefined();
    expect(lead('1.5', '')).toBeDefined();
    expect(lead('10', '5')).toBeDefined();
    expect(lead('60', '')).toBeUndefined();
    expect(lead('', '3')).toBeUndefined();
    expect(lead('5', '5')).toBeUndefined();
  });

  it('checks the stay window and the sale window: both dates, end not before start', () => {
    const stay = (stayStart: string, stayEnd: string): string | undefined =>
      validateDraft(draft({ minNightsOn: false, stayOn: true, stayStart, stayEnd })).stay;
    expect(stay('', '2027-07-01')).toBeDefined();
    expect(stay('2027-07-10', '2027-07-01')).toBeDefined();
    expect(stay('2027-07-01', '2027-07-01')).toBeUndefined();
    const sale = (windowStart: string, windowEnd: string): string | undefined =>
      validateDraft(draft({ minNightsOn: false, windowOn: true, windowStart, windowEnd })).window;
    expect(sale('2027-05-31', '2027-05-01')).toBeDefined();
    expect(sale('2027-05-01', '2027-05-31')).toBeUndefined();
  });

  it('allows past dates, because staff may correct history', () => {
    expect(validateDraft(draft({ minNightsOn: false, stayOn: true, stayStart: '2019-01-01', stayEnd: '2019-01-05' })).stay).toBeUndefined();
  });

  it('needs at least one weekday', () => {
    expect(validateDraft(draft({ minNightsOn: false, weekdayOn: true, weekdays: [] })).weekdays).toBeDefined();
    expect(validateDraft(draft({ minNightsOn: false, weekdayOn: true, weekdays: [1] })).weekdays).toBeUndefined();
  });

  it.each(['AB', 'HELLO THERE', '', 'x'.repeat(31), 'café'])('rejects the promo code %j', (promoCode) => {
    expect(validateDraft(draft({ minNightsOn: false, promoOn: true, promoCode })).promo).toBeDefined();
  });

  it('accepts promo codes with dashes and underscores', () => {
    expect(validateDraft(draft({ minNightsOn: false, promoOn: true, promoCode: 'SUMMER_27-a' })).promo).toBeUndefined();
  });

  it('checks priority and the use limit', () => {
    expect(validateDraft(draft({ priority: '-1' })).priority).toBeDefined();
    expect(validateDraft(draft({ priority: '1001' })).priority).toBeDefined();
    expect(validateDraft(draft({ priority: '' })).priority).toBeDefined();
    expect(validateDraft(draft({ limitOn: true, maxRedemptions: '0' })).limit).toBeDefined();
    expect(validateDraft(draft({ limitOn: true, maxRedemptions: '' })).limit).toBeDefined();
    expect(validateDraft(draft({ limitOn: true, maxRedemptions: '50' })).limit).toBeUndefined();
    expect(validateDraft(draft({ limitOn: false, maxRedemptions: 'junk' })).limit).toBeUndefined();
  });

  it('ignores conditions that are ticked off, and all conditions when always on', () => {
    expect(validateDraft(draft({ leadOn: false, leadMin: 'junk' })).lead).toBeUndefined();
    expect(validateDraft(draft({ alwaysOn: true, minNights: '0' })).minNights).toBeUndefined();
  });
});

describe('summaries', () => {
  it('shows a percent and a fixed effect', () => {
    expect(summarizeEffect({ kind: 'percent', percent: 10 }, 'EUR')).toBe('10%');
    expect(summarizeEffect({ kind: 'fixed', amountCents: 2000 }, 'EUR').replace(/\s/g, ' ')).toBe('20,00 €');
  });

  it('describes each condition in plain words', () => {
    expect(summarizeCondition({ kind: 'min_nights', nights: 7 })).toBe('7+ nights');
    expect(summarizeCondition({ kind: 'min_nights', nights: 1 })).toBe('1+ night');
    expect(summarizeCondition({ kind: 'booking_lead_days', minDays: 60, maxDays: null })).toBe('booked 60+ days ahead');
    expect(summarizeCondition({ kind: 'booking_lead_days', minDays: null, maxDays: 3 })).toBe('booked up to 3 days ahead');
    expect(summarizeCondition({ kind: 'booking_lead_days', minDays: null, maxDays: 1 })).toBe('booked up to 1 day ahead');
    expect(summarizeCondition({ kind: 'booking_lead_days', minDays: 14, maxDays: 30 })).toBe('booked 14 to 30 days ahead');
    expect(summarizeCondition({ kind: 'stay_dates', startDate: '2027-07-01', endDate: '2027-08-31' })).toBe('stays 1 Jul 2027 to 31 Aug 2027');
    expect(summarizeCondition({ kind: 'booking_window', startDate: '2027-05-01', endDate: '2027-05-31' })).toBe('booked 1 May 2027 to 31 May 2027');
    expect(summarizeCondition({ kind: 'promo_code', code: 'WELCOME15' })).toBe('code WELCOME15');
  });

  it('lists weekdays in week order', () => {
    expect(summarizeCondition({ kind: 'weekday', days: [1, 0] })).toBe('Sun, Mon only');
    expect(summarizeCondition({ kind: 'weekday', days: [6] })).toBe('Sat only');
  });

  it('joins several conditions and handles always-on and none', () => {
    expect(
      summarizeConditions({ alwaysOn: false, conditions: [{ kind: 'min_nights', nights: 7 }, { kind: 'promo_code', code: 'ABC' }] }),
    ).toBe('7+ nights; code ABC');
    expect(summarizeConditions({ alwaysOn: true, conditions: [] })).toBe('Every stay');
    expect(summarizeConditions({ alwaysOn: false, conditions: [] })).toBe('No conditions');
  });

  it('names the scope', () => {
    const houses = [house('h1', 'Dune'), house('h2', 'Cedar')];
    expect(summarizeScope(null, houses)).toBe('All houses');
    expect(summarizeScope(['h2', 'h1'], houses)).toBe('Dune, Cedar');
    expect(summarizeScope(['gone'], houses)).toBe('No houses');
  });

  it('describes uses', () => {
    expect(summarizeUses(3, 10)).toBe('3 of 10 used');
    expect(summarizeUses(0, null)).toBe('Unlimited');
    expect(summarizeUses(4, null)).toBe('4 used');
  });
});
