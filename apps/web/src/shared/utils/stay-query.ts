/**
 * @file apps/web/src/shared/utils/stay-query.ts
 * @shared Stay search URL helpers
 * @dependencies today-iso
 */

import { addDaysIsoDate, clampStayNights, nightsBetweenIso, todayIsoDate } from './today-iso';

export interface StayQuery {
  checkIn: string;
  checkOut: string;
  nights: string;
  guestCount: string;
  propertySlug: string;
}

/**
 * Check-in today and one night when the guest has not chosen yet.
 */
export function withDefaultStay(query: StayQuery): StayQuery {
  const checkIn = query.checkIn === '' ? todayIsoDate() : query.checkIn;
  const nights = resolveNights(query.nights, checkIn, query.checkOut);
  return {
    ...query,
    checkIn,
    nights: String(nights),
    checkOut: addDaysIsoDate(checkIn, nights),
    guestCount: query.guestCount === '' ? '2' : query.guestCount,
  };
}

/**
 * Reads stay fields from a query object.
 */
export function stayQueryFromRecord(record: {
  checkIn?: string;
  checkOut?: string;
  nights?: string;
  guestCount?: string;
  property?: string;
}): StayQuery {
  return {
    checkIn: record.checkIn ?? '',
    checkOut: record.checkOut ?? '',
    nights: record.nights ?? '',
    guestCount: record.guestCount ?? '2',
    propertySlug: record.property ?? '',
  };
}

/**
 * Builds a search URL. Availability still comes from the API.
 */
export function searchHref(query: StayQuery): string {
  const params = new URLSearchParams();
  params.set('checkIn', query.checkIn);
  params.set('checkOut', query.checkOut);
  params.set('nights', query.nights);
  params.set('guestCount', query.guestCount);
  if (query.propertySlug !== '') {
    params.set('property', query.propertySlug);
  }
  return `/search?${params.toString()}`;
}

/**
 * Carries selected stay onto a house URL.
 */
export function houseHref(
  propertySlug: string,
  houseSlug: string,
  query: StayQuery | null,
): string {
  const path = `/properties/${propertySlug}/stays/${houseSlug}`;
  if (query === null || query.checkIn === '' || query.checkOut === '') {
    return path;
  }
  const params = new URLSearchParams({
    checkIn: query.checkIn,
    checkOut: query.checkOut,
    nights: query.nights,
    guestCount: query.guestCount,
  });
  return `${path}?${params.toString()}`;
}

function resolveNights(nightsRaw: string, checkIn: string, checkOut: string): number {
  if (nightsRaw !== '') {
    const parsed = Number.parseInt(nightsRaw, 10);
    return clampStayNights(parsed);
  }
  if (checkOut !== '' && checkIn !== '') {
    return clampStayNights(nightsBetweenIso(checkIn, checkOut));
  }
  return 1;
}
