/**
 * @file apps/web/src/features/property/utils/property-stay-search.test.ts
 * @feature property
 */

import { describe, expect, it } from 'vitest';
import { makeHouse, makeResult } from '../test-fixtures';
import {
  arrangeStays,
  describeAvailability,
  parsePropertyStaySearch,
  propertyAvailabilityHref,
} from './property-stay-search';

const TODAY = '2099-01-01';

describe('parsePropertyStaySearch', () => {
  it('is no search without a check-in', () => {
    expect(parsePropertyStaySearch({}, 'alpine-lake', TODAY)).toEqual({ kind: 'none' });
    expect(parsePropertyStaySearch({ checkIn: '' }, 'alpine-lake', TODAY)).toEqual({ kind: 'none' });
    expect(parsePropertyStaySearch({ guestCount: '4' }, 'alpine-lake', TODAY)).toEqual({ kind: 'none' });
  });

  it('reads a full query', () => {
    expect(
      parsePropertyStaySearch(
        { checkIn: '2099-07-10', checkOut: '2099-07-12', nights: '2', guestCount: '3' },
        'alpine-lake',
        TODAY,
      ),
    ).toEqual({
      kind: 'search',
      guests: 3,
      stay: { checkIn: '2099-07-10', checkOut: '2099-07-12', nights: '2', guestCount: '3', propertySlug: 'alpine-lake' },
    });
  });

  it('derives check-out from nights, and nights from check-out', () => {
    const byNights = parsePropertyStaySearch({ checkIn: '2099-07-10', nights: '3' }, 'a', TODAY);
    const byCheckOut = parsePropertyStaySearch({ checkIn: '2099-07-10', checkOut: '2099-07-14' }, 'a', TODAY);

    expect(byNights.kind === 'search' && byNights.stay.checkOut).toBe('2099-07-13');
    expect(byCheckOut.kind === 'search' && byCheckOut.stay.nights).toBe('4');
  });

  it('defaults to one night and two guests', () => {
    const search = parsePropertyStaySearch({ checkIn: '2099-07-10' }, 'a', TODAY);

    expect(search.kind === 'search' && [search.stay.nights, search.stay.checkOut, search.guests]).toEqual(['1', '2099-07-11', 2]);
  });

  it('accepts today as a check-in', () => {
    expect(parsePropertyStaySearch({ checkIn: TODAY }, 'a', TODAY).kind).toBe('search');
  });

  it('flags a past check-in', () => {
    expect(parsePropertyStaySearch({ checkIn: '2098-12-31' }, 'a', TODAY)).toEqual({ kind: 'invalid', reason: 'past' });
  });

  it('flags a check-in that is not a real date', () => {
    expect(parsePropertyStaySearch({ checkIn: 'soon' }, 'a', TODAY)).toEqual({ kind: 'invalid', reason: 'date' });
    expect(parsePropertyStaySearch({ checkIn: '2099-02-30' }, 'a', TODAY)).toEqual({ kind: 'invalid', reason: 'date' });
  });

  it('ignores a junk check-out and falls back to nights', () => {
    const search = parsePropertyStaySearch({ checkIn: '2099-07-10', checkOut: 'x', nights: '2' }, 'a', TODAY);

    expect(search.kind === 'search' && search.stay.checkOut).toBe('2099-07-12');
  });

  it('clamps nights to 1..30', () => {
    const many = parsePropertyStaySearch({ checkIn: '2099-07-10', nights: '99' }, 'a', TODAY);
    const none = parsePropertyStaySearch({ checkIn: '2099-07-10', nights: '0' }, 'a', TODAY);

    expect(many.kind === 'search' && many.stay.nights).toBe('30');
    expect(none.kind === 'search' && none.stay.nights).toBe('1');
  });

  it('falls back to 2 guests for junk, zero or too many', () => {
    for (const guestCount of ['abc', '0', '-3', '500']) {
      const search = parsePropertyStaySearch({ checkIn: '2099-07-10', guestCount }, 'a', TODAY);
      expect(search.kind === 'search' && search.guests).toBe(2);
    }
  });

  it('takes the first value when a parameter is repeated', () => {
    const search = parsePropertyStaySearch({ checkIn: ['2099-07-10', '2099-08-01'] }, 'a', TODAY);

    expect(search.kind === 'search' && search.stay.checkIn).toBe('2099-07-10');
  });
});

describe('arrangeStays', () => {
  const lake = makeHouse('lake', 'Lake');
  const spruce = makeHouse('spruce', 'Spruce');
  const dune = makeHouse('dune', 'Dune');

  it('keeps order and marks everything unknown without a search result', () => {
    const entries = arrangeStays([lake, spruce], null);

    expect(entries.map((entry) => [entry.house.id, entry.availability, entry.quote])).toEqual([
      ['lake', 'unknown', null],
      ['spruce', 'unknown', null],
    ]);
  });

  it('puts the stays the API returned first, with its quote, and mutes the rest', () => {
    const entries = arrangeStays([lake, spruce, dune], [makeResult(dune, 40000), makeResult(spruce, 30000)]);

    expect(entries.map((entry) => [entry.house.id, entry.availability, entry.quote?.totalCents ?? null])).toEqual([
      ['spruce', 'available', 30000],
      ['dune', 'available', 40000],
      ['lake', 'unavailable', null],
    ]);
  });

  it('marks everything unavailable when the API found nothing, keeping order', () => {
    const entries = arrangeStays([lake, spruce], []);

    expect(entries.map((entry) => [entry.house.id, entry.availability])).toEqual([
      ['lake', 'unavailable'],
      ['spruce', 'unavailable'],
    ]);
  });

  it('ignores API results for stays this property does not list', () => {
    expect(arrangeStays([lake], [makeResult(dune, 1)]).map((entry) => entry.availability)).toEqual(['unavailable']);
  });

  it('has nothing to arrange without stays', () => {
    expect(arrangeStays([], [])).toEqual([]);
  });
});

describe('describeAvailability', () => {
  const stay = { checkIn: '2099-07-10', checkOut: '2099-07-12', nights: '2', guestCount: '2', propertySlug: 'a' };

  it('words the plural summary', () => {
    expect(describeAvailability(2, 3, stay, 2)).toBe('2 of 3 stays available for 10 Jul to 12 Jul · 2 guests');
  });

  it('words the singular summary', () => {
    expect(describeAvailability(1, 1, stay, 1)).toBe('1 of 1 stay available for 10 Jul to 12 Jul · 1 guest');
    expect(describeAvailability(1, 3, stay, 1)).toBe('1 of 3 stays available for 10 Jul to 12 Jul · 1 guest');
  });

  it('says what to do when nothing is free', () => {
    expect(describeAvailability(0, 3, stay, 2)).toBe('No stays are free for those dates. Try other nights or fewer guests.');
  });
});

describe('propertyAvailabilityHref', () => {
  it('stays on the property page with the dates in the query', () => {
    expect(
      propertyAvailabilityHref('alpine-lake', {
        checkIn: '2099-07-10',
        checkOut: '2099-07-12',
        nights: '2',
        guestCount: '3',
        propertySlug: 'alpine-lake',
      }),
    ).toBe('/properties/alpine-lake?checkIn=2099-07-10&checkOut=2099-07-12&nights=2&guestCount=3');
  });
});
