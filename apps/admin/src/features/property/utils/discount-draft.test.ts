/**
 * @file apps/admin/src/features/property/utils/discount-draft.test.ts
 * @feature property
 */

import type { Discount, HouseSummary } from '@resort-booking/shared-types';
import { describe, expect, it } from 'vitest';
import {
  AUTOMATIC_NOTE,
  COUPON_STACK_LABEL,
  describeRunWindow,
  discountStatus,
  draftFromDiscount,
  draftToWrite,
  EMPTY_DISCOUNT_DRAFT,
  formatDateRange,
  hasRunWindow,
  isCouponDraft,
  isUsedUp,
  LIMIT_LABEL,
  RUN_WINDOW_HELP,
  RUN_WINDOW_TITLE,
  STAY_DATES_HELP,
  STAY_DATES_LABEL,
  summarizeCondition,
  summarizeConditions,
  summarizeEffect,
  summarizeScope,
  summarizeStacking,
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
    promoted: false,
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
    mapLatitude: 45.9,
    mapLongitude: 6.1,
  };
}

describe('a new discount draft', () => {
  it('starts combinable, so a code stacks with a long-stay discount', () => {
    expect(EMPTY_DISCOUNT_DRAFT.combinable).toBe(true);
  });

  it('keeps an existing coupon as it was when editing', () => {
    const coupon = { conditions: [{ kind: 'promo_code' as const, code: 'ABC' }] };
    expect(draftFromDiscount(discount({ ...coupon, combinable: false })).combinable).toBe(false);
    expect(draftFromDiscount(discount({ ...coupon, combinable: true })).combinable).toBe(true);
  });

  it('gives an automatic discount the stacking default, so ticking a promo code later starts with "stack"', () => {
    expect(draftFromDiscount(discount({ combinable: false })).combinable).toBe(true);
  });

  it('carries the saved priority through without showing it', () => {
    expect(draftFromDiscount(discount({ priority: 7 })).priority).toBe('7');
  });
});

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
      promoted: false,
    });
  });

  it('saves an automatic discount as not combinable: it never stacks, so the flag is irrelevant', () => {
    expect(draftToWrite(draft({ combinable: true })).combinable).toBe(false);
  });

  it('saves a coupon with the stacking choice the person made', () => {
    expect(draftToWrite(draft({ minNightsOn: false, promoOn: true, promoCode: 'ABC', combinable: true })).combinable).toBe(true);
    expect(draftToWrite(draft({ minNightsOn: false, promoOn: true, promoCode: 'ABC', combinable: false })).combinable).toBe(false);
  });

  it('sends the carried priority, and the default when it is not a usable number', () => {
    expect(draftToWrite(draft({ priority: '7' })).priority).toBe(7);
    expect(draftToWrite(draft({ priority: '' })).priority).toBe(100);
    expect(draftToWrite(draft({ priority: 'junk' })).priority).toBe(100);
    expect(draftToWrite(draft({ priority: '5000' })).priority).toBe(100);
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

  it('sends a run window as the booking_window condition, and no window when both dates are empty', () => {
    expect(draftToWrite(draft({ windowStart: '2026-12-01', windowEnd: '2026-12-31' })).conditions).toContainEqual({
      kind: 'booking_window',
      startDate: '2026-12-01',
      endDate: '2026-12-31',
    });
    expect(draftToWrite(draft()).conditions.some((condition) => condition.kind === 'booking_window')).toBe(false);
  });

  it('keeps "always on" for the dates alone: a run window with no other condition is a window-only discount', () => {
    const write = draftToWrite(draft({ alwaysOn: true, minNightsOn: true, windowStart: '2026-12-01', windowEnd: '2026-12-31' }));
    expect(write.alwaysOn).toBe(false);
    expect(write.conditions).toEqual([{ kind: 'booking_window', startDate: '2026-12-01', endDate: '2026-12-31' }]);
    expect(validateDraft(draft({ alwaysOn: true, windowStart: '2026-12-01', windowEnd: '2026-12-31' }))).toEqual({});
  });

  it('sends chosen houses, the use limit and active', () => {
    const write = draftToWrite(draft({ scope: 'chosen', houseIds: ['h1', 'h2'], limitOn: true, maxRedemptions: '50', active: false }));
    expect(write).toMatchObject({ houseIds: ['h1', 'h2'], maxRedemptions: 50, active: false });
  });

  it('ignores the use limit text when the limit is off', () => {
    expect(draftToWrite(draft({ limitOn: false, maxRedemptions: '9' })).maxRedemptions).toBeNull();
  });
});

describe('promoted (show on the website)', () => {
  it('is off unless chosen', () => {
    expect(EMPTY_DISCOUNT_DRAFT.promoted).toBe(false);
    expect(draftToWrite(draft()).promoted).toBe(false);
  });

  it('is sent when chosen on a code-free discount', () => {
    expect(draftToWrite(draft({ promoted: true })).promoted).toBe(true);
  });

  it('is allowed with a promo code: staff choose to show the code', () => {
    expect(draftToWrite(draft({ promoted: true, promoOn: true, promoCode: 'SPRING10' })).promoted).toBe(true);
    expect(draftToWrite(draft({ promoted: false, promoOn: true, promoCode: 'SPRING10' })).promoted).toBe(false);
  });

  it('fills the switch from a saved discount', () => {
    expect(draftFromDiscount(discount({ promoted: true })).promoted).toBe(true);
    expect(draftFromDiscount(discount({ promoted: false })).promoted).toBe(false);
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
      promoted: original.promoted,
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

  it('checks the stay dates and the run window: both dates, end not before start', () => {
    const stay = (stayStart: string, stayEnd: string): string | undefined =>
      validateDraft(draft({ minNightsOn: false, stayOn: true, stayStart, stayEnd })).stay;
    expect(stay('', '2027-07-01')).toBeDefined();
    expect(stay('2027-07-10', '2027-07-01')).toBeDefined();
    expect(stay('2027-07-01', '2027-07-01')).toBeUndefined();
    const sale = (windowStart: string, windowEnd: string): string | undefined =>
      validateDraft(draft({ minNightsOn: false, windowStart, windowEnd })).window;
    expect(sale('2027-05-31', '2027-05-01')).toBeDefined();
    expect(sale('2027-05-01', '2027-05-31')).toBeUndefined();
  });

  it('asks for both run dates as soon as one is filled, and none is fine (runs until switched off)', () => {
    const run = (windowStart: string, windowEnd: string): string | undefined => validateDraft(draft({ windowStart, windowEnd })).window;
    expect(run('', '')).toBeUndefined();
    expect(run('2026-12-01', '')).toBe('Choose both dates');
    expect(run('', '2026-12-31')).toBe('Choose both dates');
    expect(hasRunWindow(draft({ windowStart: '2026-12-01' }))).toBe(true);
    expect(hasRunWindow(draft())).toBe(false);
  });

  it('checks the run window even when the discount is always on', () => {
    expect(validateDraft(draft({ alwaysOn: true, windowStart: '2026-12-31', windowEnd: '2026-12-01' })).window).toBeDefined();
  });

  it('counts a run window as a condition', () => {
    expect(validateDraft(draft({ minNightsOn: false, windowStart: '2026-12-01', windowEnd: '2026-12-31' })).conditions).toBeUndefined();
    expect(validateDraft(draft({ minNightsOn: false })).conditions).toBeDefined();
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

  it('does not ask for a priority any more, whatever the carried value', () => {
    expect(validateDraft(draft({ priority: '-1' }))).toEqual({});
    expect(validateDraft(draft({ priority: '' }))).toEqual({});
  });

  it('checks the use limit', () => {
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
    expect(summarizeCondition({ kind: 'booking_lead_days', minDays: 60, maxDays: null })).toBe('Book 60+ days ahead');
    expect(summarizeCondition({ kind: 'booking_lead_days', minDays: null, maxDays: 3 })).toBe('Book up to 3 days ahead');
    expect(summarizeCondition({ kind: 'booking_lead_days', minDays: null, maxDays: 1 })).toBe('Book up to 1 day ahead');
    expect(summarizeCondition({ kind: 'booking_lead_days', minDays: 14, maxDays: 30 })).toBe('Book 14 to 30 days ahead');
    expect(summarizeCondition({ kind: 'booking_lead_days', minDays: null, maxDays: null })).toBe('Book any time');
    expect(summarizeCondition({ kind: 'stay_dates', startDate: '2027-07-01', endDate: '2027-08-31' })).toBe('Stays 1 Jul – 31 Aug 2027');
    expect(summarizeCondition({ kind: 'booking_window', startDate: '2027-05-01', endDate: '2027-05-31' })).toBe('Book 1 May – 31 May 2027');
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
    expect(summarizeConditions({ alwaysOn: true, conditions: [] })).toBe('Every booking');
    expect(summarizeConditions({ alwaysOn: false, conditions: [] })).toBe('No conditions');
  });

  it('names the scope', () => {
    const houses = [house('h1', 'Dune'), house('h2', 'Cedar')];
    expect(summarizeScope(null, houses)).toBe('All stays');
    expect(summarizeScope(['h2', 'h1'], houses)).toBe('Dune, Cedar');
    expect(summarizeScope(['gone'], houses)).toBe('No stays');
  });

  it('describes uses', () => {
    expect(summarizeUses(3, 10)).toBe('3 of 10 used');
    expect(summarizeUses(0, null)).toBe('Unlimited');
    expect(summarizeUses(4, null)).toBe('4 used');
  });
});

describe('coupons, automatic discounts and limits in words', () => {
  it('knows a coupon is a ticked promo code, not an always-on discount', () => {
    expect(isCouponDraft({ promoOn: true, alwaysOn: false })).toBe(true);
    expect(isCouponDraft({ promoOn: true, alwaysOn: true })).toBe(false);
    expect(isCouponDraft({ promoOn: false, alwaysOn: false })).toBe(false);
  });

  it('explains stacking in the dialog texts', () => {
    expect(AUTOMATIC_NOTE).toBe('Automatic discounts do not stack with each other: the guest gets the best one.');
    expect(COUPON_STACK_LABEL).toBe('Can be used together with an automatic discount');
    expect(LIMIT_LABEL).toBe('Limit how many bookings can use it');
  });

  it('summarizes how each kind combines', () => {
    expect(summarizeStacking(discount())).toBe('Automatic: the best one applies');
    const coupon = { conditions: [{ kind: 'promo_code' as const, code: 'ABC' }] };
    expect(summarizeStacking(discount({ ...coupon, combinable: true }))).toBe('Coupon: stacks after the automatic discount');
    expect(summarizeStacking(discount({ ...coupon, combinable: false }))).toBe('Coupon: replaces the automatic discount when better');
  });

  it('says when a discount is used up', () => {
    expect(isUsedUp(10, 10)).toBe(true);
    expect(isUsedUp(11, 10)).toBe(true);
    expect(isUsedUp(9, 10)).toBe(false);
    expect(isUsedUp(500, null)).toBe(false);
  });
});

describe('formatDateRange', () => {
  it('shows the year once when both dates share it, and twice when they do not', () => {
    expect(formatDateRange('2026-12-01', '2026-12-31')).toBe('1 Dec – 31 Dec 2026');
    expect(formatDateRange('2026-12-15', '2027-01-15')).toBe('15 Dec 2026 – 15 Jan 2027');
  });
});

describe('draft <-> booking window (How long does it run?)', () => {
  it('fills the run dates from a saved booking_window and nothing else', () => {
    const filled = draftFromDiscount(
      discount({ conditions: [{ kind: 'min_nights', nights: 8 }, { kind: 'booking_window', startDate: '2026-12-01', endDate: '2026-12-31' }] }),
    );
    expect(filled.windowStart).toBe('2026-12-01');
    expect(filled.windowEnd).toBe('2026-12-31');
    expect(filled.minNightsOn).toBe(true);
    expect(filled.stayOn).toBe(false);
  });

  it('leaves the run dates empty (open-ended) when there is no booking_window', () => {
    const filled = draftFromDiscount(discount());
    expect(filled.windowStart).toBe('');
    expect(filled.windowEnd).toBe('');
  });

  it('round-trips a window and stay dates as two different conditions', () => {
    const original = discount({
      conditions: [
        { kind: 'stay_dates', startDate: '2027-07-01', endDate: '2027-07-31' },
        { kind: 'booking_window', startDate: '2026-12-01', endDate: '2026-12-31' },
      ],
    });
    expect(draftToWrite(draftFromDiscount(original)).conditions).toEqual(original.conditions);
  });

  it('names the two date concepts so they cannot be confused', () => {
    expect(RUN_WINDOW_TITLE).toBe('How long does it run?');
    expect(RUN_WINDOW_HELP).toBe('Guests can use it only when they book between these dates. Leave blank to run until you switch it off.');
    expect(STAY_DATES_LABEL).toBe('Only for stays between these dates (the whole stay must fall inside)');
    expect(STAY_DATES_HELP).toContain("'How long does it run?'");
  });
});

describe('discountStatus', () => {
  const live: Pick<Discount, 'active' | 'redemptions' | 'maxRedemptions' | 'conditions'> = {
    active: true,
    redemptions: 0,
    maxRedemptions: null,
    conditions: [{ kind: 'min_nights', nights: 7 }],
  };
  const window = (startDate: string, endDate: string): Pick<Discount, 'conditions'> => ({
    conditions: [{ kind: 'booking_window', startDate, endDate }],
  });
  const TODAY = '2026-11-25';

  it('is Live when nothing holds it back', () => {
    expect(discountStatus(live, TODAY)).toEqual({ kind: 'live', label: 'Live' });
  });

  it('is Off when switched off, whatever else is true', () => {
    expect(discountStatus({ ...live, active: false, redemptions: 5, maxRedemptions: 5, ...window('2026-01-01', '2026-01-31') }, TODAY).kind).toBe('off');
  });

  it('is Used up when the limit is reached, before Ended or Starts', () => {
    expect(discountStatus({ ...live, redemptions: 5, maxRedemptions: 5, ...window('2026-01-01', '2026-01-31') }, TODAY)).toEqual({ kind: 'used_up', label: 'Used up' });
    expect(discountStatus({ ...live, redemptions: 4, maxRedemptions: 5 }, TODAY).kind).toBe('live');
  });

  it('is Ended when the window is over, before Starts', () => {
    expect(discountStatus({ ...live, ...window('2026-10-01', '2026-11-24') }, TODAY)).toEqual({ kind: 'ended', label: 'Ended' });
  });

  it('is Ended when every qualifying stay date has passed', () => {
    expect(discountStatus({ ...live, conditions: [{ kind: 'stay_dates', startDate: '2026-07-01', endDate: '2026-07-31' }] }, TODAY).kind).toBe('ended');
    expect(discountStatus({ ...live, conditions: [{ kind: 'stay_dates', startDate: '2026-11-01', endDate: TODAY }] }, TODAY).kind).toBe('live');
  });

  it('says when it starts, with the year only when it is not this year', () => {
    expect(discountStatus({ ...live, ...window('2026-12-01', '2026-12-31') }, TODAY)).toEqual({ kind: 'starts', label: 'Starts 1 Dec' });
    expect(discountStatus({ ...live, ...window('2027-01-05', '2027-01-31') }, TODAY).label).toBe('Starts 5 Jan 2027');
  });

  it('counts the first and last day of the window as Live', () => {
    expect(discountStatus({ ...live, ...window(TODAY, '2026-12-31') }, TODAY).kind).toBe('live');
    expect(discountStatus({ ...live, ...window('2026-11-01', TODAY) }, TODAY).kind).toBe('live');
    expect(discountStatus({ ...live, ...window('2026-11-01', '2026-11-24') }, TODAY).kind).toBe('ended');
    expect(discountStatus({ ...live, ...window('2026-11-26', '2026-12-31') }, TODAY).kind).toBe('starts');
  });
});

describe('describeRunWindow', () => {
  const TODAY = '2026-11-25';

  it('says nothing until both run dates are valid', () => {
    expect(describeRunWindow(draft(), TODAY)).toEqual({ summary: null, stayNote: null, notice: null });
    expect(describeRunWindow(draft({ windowStart: '2026-12-01' }), TODAY).summary).toBeNull();
    expect(describeRunWindow(draft({ windowStart: '2026-12-31', windowEnd: '2026-12-01' }), TODAY).summary).toBeNull();
  });

  it('explains who gets the discount, in plain English', () => {
    expect(describeRunWindow(draft({ windowStart: '2026-12-01', windowEnd: '2026-12-31' }), TODAY).summary).toBe(
      'Guests who book from 1 Dec 2026 to 31 Dec 2026 get this discount.',
    );
  });

  it('adds the stay-dates line when stay dates are set', () => {
    const notes = describeRunWindow(
      draft({ windowStart: '2026-12-01', windowEnd: '2026-12-31', stayOn: true, stayStart: '2027-07-01', stayEnd: '2027-08-31' }),
      TODAY,
    );
    expect(notes.stayNote).toBe('Only for stays between 1 Jul 2027 and 31 Aug 2027.');
  });

  it('warns calmly that a window in the future has not started', () => {
    expect(describeRunWindow(draft({ windowStart: '2026-12-01', windowEnd: '2026-12-31' }), TODAY).notice).toEqual({
      severity: 'info',
      text: 'Starts in 6 days: until then guests do not see or get this discount.',
    });
    expect(describeRunWindow(draft({ windowStart: '2026-11-26', windowEnd: '2026-12-31' }), TODAY).notice?.text).toContain('Starts in 1 day:');
  });

  it('has no notice when the window is open today, and warns when it is over', () => {
    expect(describeRunWindow(draft({ windowStart: TODAY, windowEnd: '2026-12-31' }), TODAY).notice).toBeNull();
    expect(describeRunWindow(draft({ windowStart: '2026-10-01', windowEnd: '2026-11-24' }), TODAY).notice).toEqual({
      severity: 'warning',
      text: 'This window has already ended: guests no longer get this discount.',
    });
  });
});
