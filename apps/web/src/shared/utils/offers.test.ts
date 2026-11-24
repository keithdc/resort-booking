// @vitest-environment jsdom
/**
 * @file apps/web/src/shared/utils/offers.test.ts
 * @shared Offer display helpers
 */

import { describe, expect, it } from 'vitest';
import { makeOffer } from '@/features/property/test-fixtures';
import { nightsHint, offersForHouse, parsePromoParam } from './offers';

describe('offersForHouse', () => {
  it('keeps whole-property offers and offers that list the stay', () => {
    const all = makeOffer({ id: 'all', houseIds: null });
    const mine = makeOffer({ id: 'mine', houseIds: ['h1', 'h2'] });
    const other = makeOffer({ id: 'other', houseIds: ['h3'] });

    expect(offersForHouse([all, mine, other], 'h1').map((offer) => offer.id)).toEqual(['all', 'mine']);
    expect(offersForHouse([all, mine, other], 'h3').map((offer) => offer.id)).toEqual(['all', 'other']);
    expect(offersForHouse([], 'h1')).toEqual([]);
  });
});

describe('nightsHint', () => {
  const long = makeOffer({ minNights: 7, value: 10 });

  it('says how many nights are missing', () => {
    expect(nightsHint([long], 4)).toBe('Add 3 more nights to save 10%');
  });

  it('uses the singular for one night', () => {
    expect(nightsHint([long], 6)).toBe('Add 1 more night to save 10%');
  });

  it('says nothing once the guest has enough nights (the quote shows the real discount)', () => {
    expect(nightsHint([long], 7)).toBeNull();
    expect(nightsHint([long], 12)).toBeNull();
  });

  it('says nothing for an offer without a minimum stay', () => {
    expect(nightsHint([makeOffer({ minNights: null, nightsOnly: false })], 1)).toBeNull();
  });

  it('says nothing when more nights alone would not earn the saving', () => {
    expect(nightsHint([makeOffer({ nightsOnly: false })], 2)).toBeNull();
  });

  it('shows the headline only for a fixed amount: no hint', () => {
    expect(nightsHint([makeOffer({ kind: 'fixed', value: 5000, currencyCode: 'EUR' })], 2)).toBeNull();
  });

  it('names the code when the offer needs one', () => {
    expect(nightsHint([makeOffer({ promoCode: 'LONG10' })], 5)).toBe('Add 2 more nights to save 10% with code LONG10');
  });

  it('picks the nearest offer, then the bigger saving', () => {
    const near = makeOffer({ id: 'near', minNights: 5, value: 5 });
    const far = makeOffer({ id: 'far', minNights: 14, value: 20 });
    const sameGapBigger = makeOffer({ id: 'big', minNights: 5, value: 8 });

    expect(nightsHint([far, near], 3)).toBe('Add 2 more nights to save 5%');
    expect(nightsHint([near, sameGapBigger], 3)).toBe('Add 2 more nights to save 8%');
  });

  it('is null with no offers', () => {
    expect(nightsHint([], 3)).toBeNull();
  });
});

describe('parsePromoParam', () => {
  it.each([
    ['WELCOME10', 'WELCOME10'],
    ['  welcome-10_x ', 'welcome-10_x'],
    [['SPRING', 'OTHER'], 'SPRING'],
    [undefined, ''],
    ['', ''],
    ['   ', ''],
    ['has space', ''],
    ['<script>', ''],
    ['A'.repeat(41), ''],
    [[], ''],
  ])('reads %j as %j', (raw, expected) => {
    expect(parsePromoParam(raw)).toBe(expected);
  });
});
