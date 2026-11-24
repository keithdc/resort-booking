/**
 * @file apps/web/src/features/property/utils/property-stay-search.ts
 * @feature property
 * @dependencies stay-query, iso-date-text — reads the property page URL; availability is the API's
 */

import type { HouseSearchResult, HouseSummary } from '@resort-booking/shared-types';
import { formatDayMonth, isRealIsoDate } from '@/shared/utils/iso-date-text';
import { withDefaultStay, type StayQuery } from '@/shared/utils/stay-query';

/** Query-string values as Next hands them over. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

export type PropertyStaySearch =
  | { kind: 'none' }
  | { kind: 'invalid'; reason: 'date' | 'past' }
  | { kind: 'search'; stay: StayQuery; guests: number };

export type StayAvailability = 'unknown' | 'available' | 'unavailable';

export interface StayListEntry {
  house: HouseSummary;
  /** The API's quote for the searched dates, null when none. */
  quote: HouseSearchResult['quote'] | null;
  availability: StayAvailability;
}

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }
  return value ?? '';
}

/**
 * Reads checkIn / checkOut / nights / guestCount from the property page URL. No check-in means no
 * search. A check-in that is not a real date, or is before today, is reported so the page can say
 * so instead of failing.
 */
export function parsePropertyStaySearch(
  raw: RawSearchParams,
  propertySlug: string,
  todayIso: string,
): PropertyStaySearch {
  const checkIn = first(raw.checkIn);
  if (checkIn === '') {
    return { kind: 'none' };
  }
  if (!isRealIsoDate(checkIn)) {
    return { kind: 'invalid', reason: 'date' };
  }
  if (checkIn < todayIso) {
    return { kind: 'invalid', reason: 'past' };
  }
  const checkOutRaw = first(raw.checkOut);
  const stay = withDefaultStay({
    checkIn,
    checkOut: isRealIsoDate(checkOutRaw) ? checkOutRaw : '',
    nights: first(raw.nights),
    guestCount: first(raw.guestCount),
    propertySlug,
  });
  const parsedGuests = Number.parseInt(stay.guestCount, 10);
  const guests = Number.isInteger(parsedGuests) && parsedGuests >= 1 && parsedGuests <= 50 ? parsedGuests : 2;
  return { kind: 'search', stay: { ...stay, guestCount: String(guests) }, guests };
}

/**
 * Every stay of the property, available ones first (existing order kept inside each group).
 * Availability is the API's answer: a stay missing from its search result is unavailable. With
 * no results (no search, or the search failed) every stay is "unknown" and the order is untouched.
 */
export function arrangeStays(houses: readonly HouseSummary[], results: readonly HouseSearchResult[] | null): StayListEntry[] {
  if (results === null) {
    return houses.map((house): StayListEntry => ({ house, quote: null, availability: 'unknown' }));
  }
  const quotes = new Map(results.map((result): [string, HouseSearchResult['quote']] => [result.house.id, result.quote]));
  const entries = houses.map((house): StayListEntry => {
    const quote = quotes.get(house.id);
    return quote === undefined
      ? { house, quote: null, availability: 'unavailable' }
      : { house, quote, availability: 'available' };
  });
  return [
    ...entries.filter((entry): boolean => entry.availability === 'available'),
    ...entries.filter((entry): boolean => entry.availability === 'unavailable'),
  ];
}

/**
 * "2 of 3 stays available for 10 Jul to 12 Jul · 2 guests", or the empty-result sentence.
 */
export function describeAvailability(available: number, total: number, stay: StayQuery, guests: number): string {
  if (available === 0) {
    return 'No stays are free for those dates. Try other nights or fewer guests.';
  }
  const stays = total === 1 ? 'stay' : 'stays';
  const people = guests === 1 ? 'guest' : 'guests';
  return `${available} of ${total} ${stays} available for ${formatDayMonth(stay.checkIn)} to ${formatDayMonth(stay.checkOut)} · ${guests} ${people}`;
}

/**
 * The property page URL for a search (same page, dates in the query string).
 */
export function propertyAvailabilityHref(propertySlug: string, query: StayQuery): string {
  const params = new URLSearchParams({
    checkIn: query.checkIn,
    checkOut: query.checkOut,
    nights: query.nights,
    guestCount: query.guestCount,
  });
  return `/properties/${propertySlug}?${params.toString()}`;
}
