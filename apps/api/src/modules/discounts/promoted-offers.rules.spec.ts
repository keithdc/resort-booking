/**
 * @file apps/api/src/modules/discounts/promoted-offers.rules.spec.ts
 * @feature discounts
 */

import type { Discount, DiscountCondition, HouseSummary } from '@resort-booking/shared-types';
import {
  buildPromotedOffers,
  describeConditions,
  formatOfferDate,
  formatOfferMoney,
  promoCodeOf,
  offerHeadline,
} from './promoted-offers.rules';

const TODAY = '2027-05-01';

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
    promoted: true,
    redemptions: 0,
    ...overrides,
  };
}

function house(id: string, currencyCode = 'EUR'): HouseSummary {
  return {
    id,
    organizationId: 'o1',
    propertyId: 'p1',
    propertySlug: 'alpine-lake',
    propertyName: 'Alpine Lake',
    propertyCity: 'Annecy',
    propertyCountryCode: 'FR',
    propertyTimezone: 'Europe/Paris',
    propertyAddressLine: '1 Rue',
    propertyPostalCode: '74000',
    slug: `slug-${id}`,
    name: `Stay ${id}`,
    description: '',
    capacity: 4,
    published: true,
    nightlyRateCents: 10000,
    currencyCode,
    coverPhotoUrl: null,
    mapLatitude: 0,
    mapLongitude: 0,
  };
}

describe('formatting', () => {
  it('formats dates without a leading zero', () => {
    expect(formatOfferDate('2026-12-03')).toBe('3 Dec 2026');
    expect(formatOfferDate('2027-01-31')).toBe('31 Jan 2027');
  });

  it('formats whole amounts without decimals and others with two', () => {
    expect(formatOfferMoney(5000, 'EUR').replace(/\s/g, ' ')).toBe('50 €');
    expect(formatOfferMoney(5050, 'EUR').replace(/\s/g, ' ')).toBe('50,50 €');
  });
});

describe('promoCodeOf', () => {
  it('finds the code among other conditions, or null', () => {
    expect(promoCodeOf([{ kind: 'min_nights', nights: 2 }, { kind: 'promo_code', code: 'ABC' }])).toBe('ABC');
    expect(promoCodeOf([{ kind: 'min_nights', nights: 2 }])).toBeNull();
    expect(promoCodeOf([])).toBeNull();
  });
});

describe('describeConditions', () => {
  it.each<[string, DiscountCondition[], string]>([
    ['no conditions', [], ''],
    ['a minimum stay', [{ kind: 'min_nights', nights: 7 }], 'when you stay 7 or more nights'],
    ['a one-night minimum, which every stay meets', [{ kind: 'min_nights', nights: 1 }], ''],
    ['stay dates', [{ kind: 'stay_dates', startDate: '2027-07-01', endDate: '2027-08-31' }], 'when you stay between 1 Jul 2027 and 31 Aug 2027'],
    ['weekdays', [{ kind: 'weekday', days: [5, 6, 0] }], 'when you stay only on Sunday, Friday and Saturday nights'],
    ['one weekday', [{ kind: 'weekday', days: [2] }], 'when you stay only on Tuesday nights'],
    ['every weekday, which says nothing', [{ kind: 'weekday', days: [0, 1, 2, 3, 4, 5, 6] }], ''],
    ['early bird', [{ kind: 'booking_lead_days', minDays: 30, maxDays: null }], 'when you book at least 30 days before arrival'],
    ['early bird of one day', [{ kind: 'booking_lead_days', minDays: 1, maxDays: null }], 'when you book at least 1 day before arrival'],
    ['last minute', [{ kind: 'booking_lead_days', minDays: null, maxDays: 3 }], 'when you book within 3 days of arrival'],
    ['a lead range', [{ kind: 'booking_lead_days', minDays: 7, maxDays: 14 }], 'when you book 7 to 14 days before arrival'],
    ['lead from zero with a limit', [{ kind: 'booking_lead_days', minDays: 0, maxDays: 1 }], 'when you book within 1 day of arrival'],
    ['a sale window', [{ kind: 'booking_window', startDate: '2027-04-01', endDate: '2027-05-31' }], 'when you book by 31 May 2027'],
    [
      'a stay and a booking condition together',
      [{ kind: 'min_nights', nights: 7 }, { kind: 'booking_window', startDate: '2027-04-01', endDate: '2027-05-31' }],
      'when you stay 7 or more nights and book by 31 May 2027',
    ],
    [
      'several stay conditions',
      [{ kind: 'min_nights', nights: 3 }, { kind: 'stay_dates', startDate: '2027-07-01', endDate: '2027-07-31' }],
      'when you stay 3 or more nights and between 1 Jul 2027 and 31 Jul 2027',
    ],
  ])('describes %s', (_name, conditions, expected) => {
    expect(describeConditions(conditions)).toBe(expected);
  });
});

describe('offerHeadline', () => {
  it('says what the guest saves and when', () => {
    expect(offerHeadline(discount(), 'EUR')).toBe('Save 10% when you stay 7 or more nights');
  });

  it('says only the saving for an always-on offer', () => {
    expect(offerHeadline(discount({ conditions: [], alwaysOn: true, effect: { kind: 'percent', percent: 5 } }), 'EUR')).toBe('Save 5%');
  });

  it('says "Use code" for a code discount, in capitals, with the amount off', () => {
    const welcome = discount({ conditions: [{ kind: 'promo_code', code: 'welcome10' }] });
    expect(offerHeadline(welcome, 'EUR')).toBe('Use code WELCOME10 for 10% off');
  });

  it('keeps the other conditions of a code discount', () => {
    const welcome = discount({ conditions: [{ kind: 'promo_code', code: 'WELCOME10' }, { kind: 'min_nights', nights: 7 }] });
    expect(offerHeadline(welcome, 'EUR')).toBe('Use code WELCOME10 for 10% off when you stay 7 or more nights');
  });

  it('formats a fixed code amount', () => {
    const welcome = discount({ effect: { kind: 'fixed', amountCents: 2000 }, conditions: [{ kind: 'promo_code', code: 'WELCOME20' }] });
    expect(offerHeadline(welcome, 'EUR').replace(/\s/g, ' ')).toBe('Use code WELCOME20 for 20 € off');
  });

  it('formats a fixed amount in the currency', () => {
    expect(offerHeadline(discount({ effect: { kind: 'fixed', amountCents: 5000 } }), 'EUR').replace(/\s/g, ' ')).toBe(
      'Save 50 € when you stay 7 or more nights',
    );
  });
});

describe('buildPromotedOffers', () => {
  const houses = [house('h1'), house('h2')];

  it('builds an offer from an advertised discount', () => {
    expect(buildPromotedOffers([discount()], houses, TODAY)).toEqual([
      {
        id: 'd1',
        name: 'Long stay',
        kind: 'percent',
        value: 10,
        currencyCode: null,
        minNights: 7,
        nightsOnly: true,
        promoCode: null,
        houseIds: null,
        validFrom: null,
        validTo: null,
        headline: 'Save 10% when you stay 7 or more nights',
      },
    ]);
  });

  it('never exposes priority or stacking rules', () => {
    const [offer] = buildPromotedOffers([discount()], houses, TODAY);
    expect(Object.keys(offer ?? {}).sort()).toEqual([
      'currencyCode', 'headline', 'houseIds', 'id', 'kind', 'minNights', 'name', 'nightsOnly', 'promoCode', 'validFrom', 'validTo', 'value',
    ]);
  });

  it('skips a discount that is not advertised', () => {
    expect(buildPromotedOffers([discount({ promoted: false })], houses, TODAY)).toEqual([]);
  });

  it('shows the code of an advertised code discount', () => {
    const welcome = discount({ id: 'w', label: 'Welcome', conditions: [{ kind: 'promo_code', code: 'welcome10' }] });
    expect(buildPromotedOffers([welcome], houses, TODAY)).toEqual([
      expect.objectContaining({ id: 'w', promoCode: 'WELCOME10', minNights: null, nightsOnly: false, headline: 'Use code WELCOME10 for 10% off' }),
    ]);
  });

  it('NEVER exposes the code of a discount that is not advertised, anywhere in the output', () => {
    const secret = discount({ promoted: false, conditions: [{ kind: 'promo_code', code: 'SECRET50' }] });
    const mixed = discount({ id: 'd2', promoted: false, conditions: [{ kind: 'min_nights', nights: 3 }, { kind: 'promo_code', code: 'HIDDEN20' }] });
    const advertised = discount({ id: 'd3', conditions: [{ kind: 'promo_code', code: 'PUBLIC10' }] });

    const output = JSON.stringify(buildPromotedOffers([secret, mixed, advertised], houses, TODAY));

    expect(output).toContain('PUBLIC10');
    expect(output).not.toMatch(/SECRET50|HIDDEN20/i);
  });

  it('counts a minimum stay next to a code as the only condition, so "add nights" can name the code', () => {
    const offer = buildPromotedOffers(
      [discount({ conditions: [{ kind: 'min_nights', nights: 5 }, { kind: 'promo_code', code: 'LONG10' }] })],
      houses,
      TODAY,
    )[0];
    expect(offer).toMatchObject({ minNights: 5, nightsOnly: true, promoCode: 'LONG10' });
  });

  it('skips a switched-off discount', () => {
    expect(buildPromotedOffers([discount({ active: false })], houses, TODAY)).toEqual([]);
  });

  it('skips a discount that has been used up', () => {
    expect(buildPromotedOffers([discount({ maxRedemptions: 5, redemptions: 5 })], houses, TODAY)).toEqual([]);
    expect(buildPromotedOffers([discount({ maxRedemptions: 5, redemptions: 4 })], houses, TODAY)).toHaveLength(1);
  });

  it('stops promoting a promo-code coupon once its uses are gone', () => {
    const coupon = (redemptions: number): Discount =>
      discount({ promoted: true, maxRedemptions: 10, redemptions, conditions: [{ kind: 'promo_code', code: 'WELCOME15' }] });
    expect(buildPromotedOffers([coupon(9)], houses, TODAY)).toHaveLength(1);
    expect(buildPromotedOffers([coupon(10)], houses, TODAY)).toEqual([]);
  });

  it('skips a booking window that has closed or not opened yet, and keeps one that is open today', () => {
    const window = (startDate: string, endDate: string): Discount =>
      discount({ conditions: [{ kind: 'booking_window', startDate, endDate }] });
    expect(buildPromotedOffers([window('2027-01-01', '2027-04-30')], houses, TODAY)).toEqual([]);
    expect(buildPromotedOffers([window('2027-05-02', '2027-06-30')], houses, TODAY)).toEqual([]);
    expect(buildPromotedOffers([window('2027-05-01', '2027-05-01')], houses, TODAY)).toHaveLength(1);
  });

  it('reports the booking window as validFrom and validTo, overlapping several windows', () => {
    const offers = buildPromotedOffers(
      [
        discount({
          conditions: [
            { kind: 'booking_window', startDate: '2027-04-01', endDate: '2027-06-30' },
            { kind: 'booking_window', startDate: '2027-04-15', endDate: '2027-05-31' },
          ],
        }),
      ],
      houses,
      TODAY,
    );
    expect(offers[0]).toMatchObject({ validFrom: '2027-04-15', validTo: '2027-05-31', nightsOnly: false, minNights: null });
  });

  it('skips stay dates that are already over, and keeps ones still ahead', () => {
    const stay = (endDate: string): Discount => discount({ conditions: [{ kind: 'stay_dates', startDate: '2027-01-01', endDate }] });
    expect(buildPromotedOffers([stay('2027-04-30')], houses, TODAY)).toEqual([]);
    expect(buildPromotedOffers([stay('2027-05-01')], houses, TODAY)).toHaveLength(1);
  });

  it('skips a discount with no conditions that is not marked always-on', () => {
    expect(buildPromotedOffers([discount({ conditions: [], alwaysOn: false })], houses, TODAY)).toEqual([]);
  });

  it('keeps the whole-property scope as null and limits others to stays that are published', () => {
    const scoped = discount({ houseIds: ['h2', 'unpublished'] });
    expect(buildPromotedOffers([scoped], houses, TODAY)[0]?.houseIds).toEqual(['h2']);
  });

  it('skips a discount whose stays are all unpublished', () => {
    expect(buildPromotedOffers([discount({ houseIds: ['gone'] })], houses, TODAY)).toEqual([]);
  });

  it('skips everything when the property has no published stays', () => {
    expect(buildPromotedOffers([discount()], [], TODAY)).toEqual([]);
  });

  it('takes the highest minimum stay and flags offers with other conditions', () => {
    const offers = buildPromotedOffers(
      [discount({ conditions: [{ kind: 'min_nights', nights: 3 }, { kind: 'min_nights', nights: 5 }] }),
       discount({ id: 'd2', conditions: [{ kind: 'min_nights', nights: 4 }, { kind: 'weekday', days: [5, 6] }] })],
      houses,
      TODAY,
    );
    expect(offers[0]).toMatchObject({ minNights: 5, nightsOnly: false });
    expect(offers[1]).toMatchObject({ minNights: 4, nightsOnly: false });
  });

  it('gives a fixed offer its currency and its amount in cents', () => {
    const [offer] = buildPromotedOffers([discount({ effect: { kind: 'fixed', amountCents: 5000 } })], [house('h1', 'USD')], TODAY);
    expect(offer).toMatchObject({ kind: 'fixed', value: 5000, currencyCode: 'USD' });
  });

  it('keeps the order it was given (priority order from the query)', () => {
    const offers = buildPromotedOffers([discount({ id: 'a' }), discount({ id: 'b' })], houses, TODAY);
    expect(offers.map((offer) => offer.id)).toEqual(['a', 'b']);
  });
});
