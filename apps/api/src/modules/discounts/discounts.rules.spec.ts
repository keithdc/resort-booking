/**
 * @file apps/api/src/modules/discounts/discounts.rules.spec.ts
 * @feature discounts
 * @dependencies discounts.rules
 */

import type { Discount, DiscountCondition, DiscountWrite } from '@resort-booking/shared-types';
import {
  applyDiscounts,
  conditionMatches,
  daysBetween,
  discountAmount,
  discountMatches,
  parseConditions,
  parseEffect,
  validateDiscountWrite,
  weekdayOf,
  type DiscountContext,
} from './discounts.rules';

const HOUSE = 'house-1';

function nightsFrom(start: string, count: number): string[] {
  const out: string[] = [];
  const date = new Date(`${start}T00:00:00Z`);
  for (let i = 0; i < count; i += 1) {
    out.push(date.toISOString().slice(0, 10));
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return out;
}

function ctx(overrides: Partial<DiscountContext> = {}): DiscountContext {
  const nights = nightsFrom('2027-07-10', 7);
  return { houseId: HOUSE, nights, checkIn: nights[0] ?? '', today: '2027-05-01', promoCode: null, ...overrides };
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

function write(overrides: Partial<DiscountWrite> = {}): DiscountWrite {
  return {
    label: 'Long stay',
    effect: { kind: 'percent', percent: 10 },
    conditions: [{ kind: 'min_nights', nights: 7 }],
    alwaysOn: false,
    houseIds: null,
    combinable: false,
    priority: 100,
    active: true,
    maxRedemptions: null,
    ...overrides,
  };
}

describe('date helpers', () => {
  it('counts whole days between dates, negative when earlier', () => {
    expect(daysBetween('2027-05-01', '2027-07-10')).toBe(70);
    expect(daysBetween('2027-07-10', '2027-07-09')).toBe(-1);
  });

  it('finds the weekday of a night without timezone drift', () => {
    expect(weekdayOf('2027-07-10')).toBe(6);
    expect(weekdayOf('2027-07-11')).toBe(0);
  });
});

describe('conditionMatches', () => {
  it('min_nights: long stay', () => {
    const c: DiscountCondition = { kind: 'min_nights', nights: 7 };
    expect(conditionMatches(c, ctx())).toBe(true);
    expect(conditionMatches(c, ctx({ nights: nightsFrom('2027-07-10', 6) }))).toBe(false);
  });

  it('booking_lead_days: early bird and last minute, inclusive at both ends', () => {
    const early: DiscountCondition = { kind: 'booking_lead_days', minDays: 70, maxDays: null };
    expect(conditionMatches(early, ctx())).toBe(true);
    expect(conditionMatches(early, ctx({ today: '2027-05-02' }))).toBe(false);
    const lastMinute: DiscountCondition = { kind: 'booking_lead_days', minDays: null, maxDays: 3 };
    expect(conditionMatches(lastMinute, ctx({ today: '2027-07-07' }))).toBe(true);
    expect(conditionMatches(lastMinute, ctx({ today: '2027-07-06' }))).toBe(false);
  });

  it('stay_dates: every night must be inside the window', () => {
    const c: DiscountCondition = { kind: 'stay_dates', startDate: '2027-07-10', endDate: '2027-07-16' };
    expect(conditionMatches(c, ctx())).toBe(true);
    expect(conditionMatches(c, ctx({ nights: nightsFrom('2027-07-10', 8) }))).toBe(false);
    expect(conditionMatches(c, ctx({ nights: nightsFrom('2027-07-09', 3) }))).toBe(false);
  });

  it('booking_window: the booking day must be inside the sale', () => {
    const c: DiscountCondition = { kind: 'booking_window', startDate: '2027-05-01', endDate: '2027-05-31' };
    expect(conditionMatches(c, ctx({ today: '2027-05-01' }))).toBe(true);
    expect(conditionMatches(c, ctx({ today: '2027-05-31' }))).toBe(true);
    expect(conditionMatches(c, ctx({ today: '2027-06-01' }))).toBe(false);
  });

  it('weekday: every night must be a listed day', () => {
    const sunToThu: DiscountCondition = { kind: 'weekday', days: [0, 1, 2, 3, 4] };
    expect(conditionMatches(sunToThu, ctx({ nights: ['2027-07-11', '2027-07-12'] }))).toBe(true);
    expect(conditionMatches(sunToThu, ctx({ nights: ['2027-07-15', '2027-07-16'] }))).toBe(false);
  });

  it('promo_code: matches the typed code ignoring case and spaces', () => {
    const c: DiscountCondition = { kind: 'promo_code', code: 'Welcome15' };
    expect(conditionMatches(c, ctx({ promoCode: ' welcome15 ' }))).toBe(true);
    expect(conditionMatches(c, ctx({ promoCode: 'welcome16' }))).toBe(false);
    expect(conditionMatches(c, ctx({ promoCode: null }))).toBe(false);
  });

  it('never matches date conditions for an empty stay', () => {
    expect(conditionMatches({ kind: 'stay_dates', startDate: '2027-01-01', endDate: '2027-12-31' }, ctx({ nights: [] }))).toBe(false);
    expect(conditionMatches({ kind: 'weekday', days: [0, 1, 2, 3, 4, 5, 6] }, ctx({ nights: [] }))).toBe(false);
  });
});

describe('discountMatches', () => {
  it('needs every condition to hold', () => {
    const d = discount({ conditions: [{ kind: 'min_nights', nights: 7 }, { kind: 'promo_code', code: 'ABC' }] });
    expect(discountMatches(d, ctx({ promoCode: 'abc' }))).toBe(true);
    expect(discountMatches(d, ctx())).toBe(false);
  });

  it('ignores inactive discounts', () => {
    expect(discountMatches(discount({ active: false }), ctx())).toBe(false);
  });

  it('respects the house scope', () => {
    expect(discountMatches(discount({ houseIds: ['other'] }), ctx())).toBe(false);
    expect(discountMatches(discount({ houseIds: [HOUSE] }), ctx())).toBe(true);
  });

  it('stops when the use limit is reached', () => {
    expect(discountMatches(discount({ maxRedemptions: 5, redemptions: 4 }), ctx())).toBe(true);
    expect(discountMatches(discount({ maxRedemptions: 5, redemptions: 5 }), ctx())).toBe(false);
  });

  it('applies an always-on discount to every stay, but an empty one by mistake to none', () => {
    expect(discountMatches(discount({ conditions: [], alwaysOn: true }), ctx())).toBe(true);
    expect(discountMatches(discount({ conditions: [], alwaysOn: false }), ctx())).toBe(false);
  });
});

describe('discountAmount', () => {
  it('rounds a percentage to whole cents', () => {
    expect(discountAmount({ kind: 'percent', percent: 10 }, 12345)).toBe(1235);
    expect(discountAmount({ kind: 'percent', percent: 33 }, 1000)).toBe(330);
  });

  it('never takes more than the amount, and never goes negative', () => {
    expect(discountAmount({ kind: 'fixed', amountCents: 5000 }, 3000)).toBe(3000);
    expect(discountAmount({ kind: 'percent', percent: 100 }, 3000)).toBe(3000);
    expect(discountAmount({ kind: 'percent', percent: 10 }, 0)).toBe(0);
    expect(discountAmount({ kind: 'fixed', amountCents: 500 }, -100)).toBe(0);
  });
});

describe('applyDiscounts', () => {
  it('gives no discount when nothing matches', () => {
    const result = applyDiscounts(100000, [discount({ conditions: [{ kind: 'min_nights', nights: 30 }] })], ctx());
    expect(result).toEqual({ lines: [], discountCents: 0, promoCode: null });
  });

  it('applies one matching discount as its own line', () => {
    const result = applyDiscounts(100000, [discount()], ctx());
    expect(result.lines).toEqual([{ discountId: 'd1', label: 'Long stay', amountCents: 10000 }]);
    expect(result.discountCents).toBe(10000);
  });

  it('gives the single best of several non-combinable discounts, never two', () => {
    const result = applyDiscounts(
      100000,
      [
        discount({ id: 'small', label: 'Small', effect: { kind: 'percent', percent: 5 } }),
        discount({ id: 'big', label: 'Big', effect: { kind: 'percent', percent: 20 } }),
        discount({ id: 'fixed', label: 'Fixed', effect: { kind: 'fixed', amountCents: 15000 } }),
      ],
      ctx(),
    );
    expect(result.lines.map((line) => line.discountId)).toEqual(['big']);
    expect(result.discountCents).toBe(20000);
  });

  it('stacks combinable discounts in priority order, each on what is left', () => {
    const result = applyDiscounts(
      100000,
      [
        discount({ id: 'b', label: 'Second', combinable: true, priority: 20, effect: { kind: 'percent', percent: 10 } }),
        discount({ id: 'a', label: 'First', combinable: true, priority: 10, effect: { kind: 'percent', percent: 10 } }),
      ],
      ctx(),
    );
    expect(result.lines).toEqual([
      { discountId: 'a', label: 'First', amountCents: 10000 },
      { discountId: 'b', label: 'Second', amountCents: 9000 },
    ]);
    expect(result.discountCents).toBe(19000);
  });

  it('gives the better of the best single or the combinable stack, never a mix', () => {
    const single = discount({ id: 's', label: 'Single', effect: { kind: 'percent', percent: 15 } });
    const stack = [
      discount({ id: 'c1', label: 'C1', combinable: true, priority: 1, effect: { kind: 'percent', percent: 10 } }),
      discount({ id: 'c2', label: 'C2', combinable: true, priority: 2, effect: { kind: 'percent', percent: 10 } }),
    ];
    expect(applyDiscounts(100000, [single, ...stack], ctx()).lines.map((line) => line.discountId)).toEqual(['c1', 'c2']);

    const bigSingle = discount({ id: 's', label: 'Single', effect: { kind: 'percent', percent: 30 } });
    expect(applyDiscounts(100000, [bigSingle, ...stack], ctx()).lines.map((line) => line.discountId)).toEqual(['s']);
  });

  it('prefers the single discount on a tie', () => {
    const single = discount({ id: 's', effect: { kind: 'percent', percent: 10 } });
    const combinable = discount({ id: 'c', combinable: true, effect: { kind: 'percent', percent: 10 } });
    expect(applyDiscounts(100000, [single, combinable], ctx()).lines.map((line) => line.discountId)).toEqual(['s']);
  });

  it('never takes the total below zero when fixed discounts stack past the subtotal', () => {
    const result = applyDiscounts(
      10000,
      [
        discount({ id: 'a', combinable: true, priority: 1, effect: { kind: 'fixed', amountCents: 8000 } }),
        discount({ id: 'b', combinable: true, priority: 2, effect: { kind: 'fixed', amountCents: 8000 } }),
      ],
      ctx(),
    );
    expect(result.discountCents).toBe(10000);
    expect(result.lines.map((line) => line.amountCents)).toEqual([8000, 2000]);
  });

  it('drops zero-value lines', () => {
    expect(applyDiscounts(0, [discount()], ctx()).lines).toEqual([]);
  });

  it('keeps line amounts adding up to the discount total', () => {
    const result = applyDiscounts(
      33333,
      [
        discount({ id: 'a', combinable: true, priority: 1, effect: { kind: 'percent', percent: 7 } }),
        discount({ id: 'b', combinable: true, priority: 2, effect: { kind: 'percent', percent: 13 } }),
      ],
      ctx(),
    );
    expect(result.lines.reduce((total, line) => total + line.amountCents, 0)).toBe(result.discountCents);
  });

  describe('promo code messages', () => {
    const promo = discount({
      id: 'promo',
      label: 'Welcome',
      effect: { kind: 'percent', percent: 15 },
      conditions: [{ kind: 'promo_code', code: 'WELCOME15' }],
    });

    it('reports nothing when no code was typed', () => {
      expect(applyDiscounts(100000, [promo], ctx()).promoCode).toBeNull();
      expect(applyDiscounts(100000, [promo], ctx({ promoCode: '   ' })).promoCode).toBeNull();
    });

    it('applies a valid code', () => {
      const result = applyDiscounts(100000, [promo], ctx({ promoCode: 'welcome15' }));
      expect(result.discountCents).toBe(15000);
      expect(result.promoCode).toEqual({ code: 'welcome15', applied: true, message: 'Code WELCOME15 applied' });
    });

    it('says an unknown code is not valid, and still prices the stay', () => {
      const result = applyDiscounts(100000, [promo], ctx({ promoCode: 'nope' }));
      expect(result.promoCode).toEqual({ code: 'nope', applied: false, message: 'That code is not valid' });
      expect(result.discountCents).toBe(0);
    });

    it('treats a switched-off code as not valid', () => {
      const off = { ...promo, active: false };
      expect(applyDiscounts(100000, [off], ctx({ promoCode: 'WELCOME15' })).promoCode?.message).toBe('That code is not valid');
    });

    it('explains when the code exists but does not fit these dates', () => {
      const dated = discount({
        ...promo,
        conditions: [{ kind: 'promo_code', code: 'WELCOME15' }, { kind: 'stay_dates', startDate: '2027-09-01', endDate: '2027-09-30' }],
      });
      expect(applyDiscounts(100000, [dated], ctx({ promoCode: 'WELCOME15' })).promoCode?.message).toBe(
        'This code does not apply to these dates',
      );
    });

    it('explains when a better offer already beat the code', () => {
      const better = discount({ id: 'better', label: 'Better', effect: { kind: 'percent', percent: 30 } });
      const result = applyDiscounts(100000, [better, promo], ctx({ promoCode: 'WELCOME15' }));
      expect(result.promoCode).toEqual({
        code: 'WELCOME15',
        applied: false,
        message: 'A better offer is already applied to this stay',
      });
      expect(result.lines.map((line) => line.discountId)).toEqual(['better']);
    });

    it('treats a used-up code as not applying', () => {
      const usedUp = { ...promo, maxRedemptions: 1, redemptions: 1 };
      expect(applyDiscounts(100000, [usedUp], ctx({ promoCode: 'WELCOME15' })).promoCode?.applied).toBe(false);
    });
  });
});

describe('validateDiscountWrite', () => {
  it('accepts a good discount', () => {
    expect(validateDiscountWrite(write())).toBeNull();
  });

  it('accepts an explicit always-on discount', () => {
    expect(validateDiscountWrite(write({ conditions: [], alwaysOn: true }))).toBeNull();
  });

  it('rejects a blank or oversized name', () => {
    expect(validateDiscountWrite(write({ label: '  ' }))).not.toBeNull();
    expect(validateDiscountWrite(write({ label: 'x'.repeat(81) }))).not.toBeNull();
  });

  it.each([0, 101, 12.5, -5])('rejects a percentage of %s', (percent) => {
    expect(validateDiscountWrite(write({ effect: { kind: 'percent', percent } }))).not.toBeNull();
  });

  it('accepts 1 and 100 percent but not a zero or fractional fixed amount', () => {
    expect(validateDiscountWrite(write({ effect: { kind: 'percent', percent: 1 } }))).toBeNull();
    expect(validateDiscountWrite(write({ effect: { kind: 'percent', percent: 100 } }))).toBeNull();
    expect(validateDiscountWrite(write({ effect: { kind: 'fixed', amountCents: 0 } }))).not.toBeNull();
    expect(validateDiscountWrite(write({ effect: { kind: 'fixed', amountCents: 10.5 } }))).not.toBeNull();
  });

  it('refuses no conditions unless always on, and conditions together with always on', () => {
    expect(validateDiscountWrite(write({ conditions: [], alwaysOn: false }))).toContain('at least one condition');
    expect(validateDiscountWrite(write({ alwaysOn: true }))).toContain('always-on');
  });

  it('refuses two promo codes on one discount', () => {
    const two: DiscountCondition[] = [{ kind: 'promo_code', code: 'AAA' }, { kind: 'promo_code', code: 'BBB' }];
    expect(validateDiscountWrite(write({ conditions: two }))).toContain('only one promo code');
  });

  it.each<[string, DiscountCondition]>([
    ['zero minimum nights', { kind: 'min_nights', nights: 0 }],
    ['lead days with neither end', { kind: 'booking_lead_days', minDays: null, maxDays: null }],
    ['lead days with max below min', { kind: 'booking_lead_days', minDays: 10, maxDays: 5 }],
    ['negative lead days', { kind: 'booking_lead_days', minDays: -1, maxDays: null }],
    ['stay dates ending before they start', { kind: 'stay_dates', startDate: '2027-07-10', endDate: '2027-07-01' }],
    ['an impossible booking window date', { kind: 'booking_window', startDate: '2027-02-30', endDate: '2027-03-05' }],
    ['no weekdays', { kind: 'weekday', days: [] }],
    ['an out-of-range weekday', { kind: 'weekday', days: [7] }],
    ['duplicate weekdays', { kind: 'weekday', days: [1, 1] }],
    ['a promo code that is too short', { kind: 'promo_code', code: 'AB' }],
    ['a promo code with spaces', { kind: 'promo_code', code: 'HELLO THERE' }],
  ])('rejects %s', (_name, condition) => {
    expect(validateDiscountWrite(write({ conditions: [condition] }))).not.toBeNull();
  });

  it('accepts one-sided lead days and a valid promo code', () => {
    expect(validateDiscountWrite(write({ conditions: [{ kind: 'booking_lead_days', minDays: 60, maxDays: null }] }))).toBeNull();
    expect(validateDiscountWrite(write({ conditions: [{ kind: 'promo_code', code: 'SUMMER-27' }] }))).toBeNull();
  });

  it('rejects an empty house list (use null for every house)', () => {
    expect(validateDiscountWrite(write({ houseIds: [] }))).toContain('at least one house');
    expect(validateDiscountWrite(write({ houseIds: null }))).toBeNull();
  });

  it('rejects a bad priority and a bad use limit', () => {
    expect(validateDiscountWrite(write({ priority: -1 }))).not.toBeNull();
    expect(validateDiscountWrite(write({ priority: 1001 }))).not.toBeNull();
    expect(validateDiscountWrite(write({ maxRedemptions: 0 }))).not.toBeNull();
    expect(validateDiscountWrite(write({ maxRedemptions: 50 }))).toBeNull();
  });
});

describe('parseEffect', () => {
  it('parses percent and fixed effects', () => {
    expect(parseEffect({ kind: 'percent', percent: 10 })).toEqual({ kind: 'percent', percent: 10 });
    expect(parseEffect({ kind: 'fixed', amountCents: 2500 })).toEqual({ kind: 'fixed', amountCents: 2500 });
  });

  it('drops unknown fields and rejects anything malformed', () => {
    expect(parseEffect({ kind: 'percent', percent: 10, sneaky: true })).toEqual({ kind: 'percent', percent: 10 });
    expect(parseEffect({ kind: 'percent', percent: '10' })).toBeNull();
    expect(parseEffect({ kind: 'fixed' })).toBeNull();
    expect(parseEffect({ kind: 'free' })).toBeNull();
    expect(parseEffect(null)).toBeNull();
    expect(parseEffect('percent')).toBeNull();
  });
});

describe('parseConditions', () => {
  it('parses every condition kind', () => {
    const raw: unknown = [
      { kind: 'min_nights', nights: 7 },
      { kind: 'booking_lead_days', minDays: 60 },
      { kind: 'stay_dates', startDate: '2027-07-01', endDate: '2027-07-31' },
      { kind: 'booking_window', startDate: '2027-05-01', endDate: '2027-05-31' },
      { kind: 'weekday', days: [0, 1] },
      { kind: 'promo_code', code: 'ABC' },
    ];
    expect(parseConditions(raw)).toEqual([
      { kind: 'min_nights', nights: 7 },
      { kind: 'booking_lead_days', minDays: 60, maxDays: null },
      { kind: 'stay_dates', startDate: '2027-07-01', endDate: '2027-07-31' },
      { kind: 'booking_window', startDate: '2027-05-01', endDate: '2027-05-31' },
      { kind: 'weekday', days: [0, 1] },
      { kind: 'promo_code', code: 'ABC' },
    ]);
  });

  it('returns null for anything malformed', () => {
    expect(parseConditions('nope')).toBeNull();
    expect(parseConditions([{ kind: 'mystery' }])).toBeNull();
    expect(parseConditions([{ kind: 'min_nights', nights: '7' }])).toBeNull();
    expect(parseConditions([{ kind: 'weekday', days: ['mon'] }])).toBeNull();
    expect(parseConditions([{ kind: 'booking_lead_days', minDays: 'x' }])).toBeNull();
    expect(parseConditions([null])).toBeNull();
    expect(parseConditions([{ nights: 7 }])).toBeNull();
  });

  it('accepts an empty list', () => {
    expect(parseConditions([])).toEqual([]);
  });
});
