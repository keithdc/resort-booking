/**
 * @file apps/web/src/features/houses/utils/map-pins.test.ts
 * @feature houses
 */

import type { HouseSearchResult, HouseSummary, Quote } from '@resort-booking/shared-types';
import { describe, expect, it } from 'vitest';
import { groupByLocation, pinKeyForHouse, toPinViews } from './map-pins';

const STAY = { checkIn: '2027-07-10', checkOut: '2027-07-12', nights: '2', guestCount: '2', propertySlug: '' };

function result(id: string, name: string, totalCents: number, latitude: number, longitude: number, propertySlug = 'alpine-lake'): HouseSearchResult {
  const house: HouseSummary = {
    id,
    organizationId: 'o',
    propertyId: 'p',
    propertySlug,
    propertyName: 'Alpine Lake',
    propertyCity: 'Annecy',
    propertyCountryCode: 'FR',
    propertyTimezone: 'Europe/Paris',
    propertyAddressLine: '1 Rue',
    propertyPostalCode: '74000',
    slug: id,
    name,
    description: '',
    capacity: 4,
    published: true,
    nightlyRateCents: 10000,
    currencyCode: 'EUR',
    coverPhotoUrl: null,
    mapLatitude: latitude,
    mapLongitude: longitude,
  };
  const quote: Quote = {
    houseId: id,
    checkIn: '2027-07-10',
    checkOut: '2027-07-12',
    guestCount: 2,
    nights: 2,
    nightlyRateCents: 10000,
    lines: [],
    subtotalCents: totalCents,
    discounts: [],
    discountCents: 0,
    totalCents,
    currencyCode: 'EUR',
    available: true,
    promoCode: null,
  };
  return { house, quote };
}

describe('groupByLocation', () => {
  it('puts stays that share a place on one pin instead of stacking pins', () => {
    const pins = groupByLocation([
      result('a', 'Lake Chalet', 64000, 45.899, 6.129),
      result('b', 'Spruce Studio', 28000, 45.899, 6.129),
    ]);

    expect(pins).toHaveLength(1);
    expect(pins[0]?.results.map((r) => r.house.id)).toEqual(['a', 'b']);
  });

  it('keeps different places on different pins', () => {
    const pins = groupByLocation([
      result('a', 'Lake Chalet', 64000, 45.899, 6.129),
      result('b', 'Dune House', 48000, 43.4832, -1.5586),
    ]);

    expect(pins).toHaveLength(2);
  });

  it('treats coordinates equal to five decimals as the same place', () => {
    const pins = groupByLocation([
      result('a', 'A', 1000, 45.8990001, 6.1290001),
      result('b', 'B', 2000, 45.8990004, 6.1290004),
    ]);

    expect(pins).toHaveLength(1);
  });

  it('leaves out stays with unusable coordinates, but keeps real zero coordinates', () => {
    const pins = groupByLocation([
      result('nan', 'No pin', 1000, Number.NaN, 6.1),
      result('far', 'Off the map', 1000, 95, 6.1),
      result('zero', 'Null island', 1000, 0, 0),
    ]);

    expect(pins.map((pin) => pin.results[0]?.house.id)).toEqual(['zero']);
  });

  it('returns nothing for no results', () => {
    expect(groupByLocation([])).toEqual([]);
  });
});

describe('pinKeyForHouse', () => {
  const pins = groupByLocation([result('a', 'A', 1, 45.8, 6.1), result('b', 'B', 1, 43.4, -1.5)]);

  it('finds the pin a stay sits on', () => {
    expect(pinKeyForHouse(pins, 'b')).toBe('43.40000,-1.50000');
  });

  it('is null for a stay that has no pin', () => {
    expect(pinKeyForHouse(pins, 'missing')).toBeNull();
  });
});

describe('toPinViews', () => {
  const plain = (text: string): string => text.replace(/\s/g, ' ');

  it('gives every stay at a place its own price, cheapest first', () => {
    const [view] = toPinViews(
      groupByLocation([result('a', 'Lake Chalet', 64000, 45.8, 6.1), result('b', 'Spruce Studio', 28000, 45.8, 6.1)]),
      STAY,
    );

    expect(view?.stays.map((stay) => [stay.name, plain(stay.priceLabel)])).toEqual([
      ['Spruce Studio', '280,00 €'],
      ['Lake Chalet', '640,00 €'],
    ]);
  });

  it('shows a lone stay with its price', () => {
    const [view] = toPinViews(groupByLocation([result('a', 'Lake Chalet', 64000, 45.8, 6.1)]), STAY);

    expect(view?.stays).toHaveLength(1);
    expect(plain(view?.stays[0]?.priceLabel ?? '')).toBe('640,00 €');
  });

  it('links each stay with the guest\'s dates so the booking page opens pre-filled', () => {
    const [view] = toPinViews(groupByLocation([result('lake-chalet', 'Lake Chalet', 64000, 45.8, 6.1)]), STAY);

    expect(view?.stays[0]?.href).toBe(
      '/properties/alpine-lake/stays/lake-chalet?checkIn=2027-07-10&checkOut=2027-07-12&nights=2&guestCount=2',
    );
  });

  it('does not reorder the results it was given', () => {
    const pins = groupByLocation([result('a', 'A', 9000, 45.8, 6.1), result('b', 'B', 1000, 45.8, 6.1)]);

    toPinViews(pins, STAY);

    expect(pins[0]?.results.map((r) => r.house.id)).toEqual(['a', 'b']);
  });
});
