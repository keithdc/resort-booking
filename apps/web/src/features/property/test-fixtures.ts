/**
 * @file apps/web/src/features/property/test-fixtures.ts
 * @feature property
 * @dependencies shared-types — builders for tests only
 */

import type { HouseSearchResult, HouseSummary, PropertyDetail, Quote } from '@resort-booking/shared-types';

export function makeHouse(id: string, name: string): HouseSummary {
  return {
    id,
    organizationId: 'o',
    propertyId: 'p',
    propertySlug: 'alpine-lake',
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
    mapLatitude: 45.9,
    mapLongitude: 6.1,
  };
}

export function makeQuote(houseId: string, totalCents: number, nights = 2): Quote {
  return {
    houseId,
    checkIn: '2099-07-10',
    checkOut: '2099-07-12',
    guestCount: 2,
    nights,
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
}

export function makeResult(house: HouseSummary, totalCents: number, nights = 2): HouseSearchResult {
  return { house, quote: makeQuote(house.id, totalCents, nights) };
}

export function makeProperty(): PropertyDetail {
  return {
    id: 'p',
    organizationId: 'o',
    slug: 'alpine-lake',
    name: 'Alpine Lake',
    description: 'Lake life.',
    city: 'Annecy',
    countryCode: 'FR',
    latitude: 45.9,
    longitude: 6.1,
    phone: '+33450123456',
    email: 'stay@example.com',
    published: true,
    timezone: 'Europe/Paris',
    coverPhotoUrl: null,
    customRequestsEnabled: false,
    addressLine: '8 Route du Lac',
    postalCode: '74000',
    photos: [],
  };
}
