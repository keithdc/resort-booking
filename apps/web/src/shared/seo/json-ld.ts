/**
 * @file apps/web/src/shared/seo/json-ld.ts
 * @shared schema.org structured data for the guest site (no ratings, no personal data)
 * @dependencies site-url
 */

import type { HouseDetail, PropertyDetail, HouseSummary } from '@resort-booking/shared-types';
import { SITE_NAME, absoluteUrl, propertyPath, stayPath } from './site-url';

/** A schema.org node: plain JSON values only. */
export interface JsonLdNode {
  [key: string]: JsonLdValue;
}
export type JsonLdValue = string | number | boolean | null | JsonLdNode | JsonLdValue[];

/**
 * Turns a node into text that is safe to put inside a `<script type="application/ld+json">` tag. Characters that
 * could close the tag or start an HTML comment are written as unicode escapes, so a stay called
 * `</script><script>alert(1)</script>` stays plain data.
 */
export function serializeJsonLd(node: JsonLdNode): string {
  return JSON.stringify(node)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function isWebUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

/** Only absolute web addresses go into the data; anything else (relative, data:, javascript:) is dropped. */
function imageUrls(urls: readonly string[]): string[] {
  return urls.filter(isWebUrl);
}

function postalAddress(addressLine: string, postalCode: string, city: string, countryCode: string): JsonLdNode {
  const address: JsonLdNode = { '@type': 'PostalAddress', addressLocality: city };
  if (addressLine.trim() !== '') {
    address.streetAddress = addressLine;
  }
  if (postalCode.trim() !== '') {
    address.postalCode = postalCode;
  }
  if (countryCode.trim() !== '') {
    address.addressCountry = countryCode;
  }
  return address;
}

function geo(latitude: number, longitude: number): JsonLdNode | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  return { '@type': 'GeoCoordinates', latitude, longitude };
}

/** "from €180 per night": the lowest standard nightly rate, in the stay's own currency. */
export function priceFromText(cents: number, currencyCode: string): string {
  const amount = cents / 100;
  try {
    const money = new Intl.NumberFormat('en', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
    return `from ${money} per night`;
  } catch {
    return `from ${amount.toFixed(2)} ${currencyCode} per night`;
  }
}

/** The lowest standard rate across stays, or null when there are none. */
export function lowestRate(houses: readonly HouseSummary[]): { cents: number; currencyCode: string } | null {
  let best: HouseSummary | null = null;
  for (const house of houses) {
    if (best === null || house.nightlyRateCents < best.nightlyRateCents) {
      best = house;
    }
  }
  return best === null ? null : { cents: best.nightlyRateCents, currencyCode: best.currencyCode };
}

/**
 * A property as a LodgingBusiness. Contact: the public business phone only, never the email address or any
 * guest data. There is no `aggregateRating`: the site has no reviews of its own and must not invent any.
 */
export function propertyJsonLd(property: PropertyDetail, houses: readonly HouseSummary[]): JsonLdNode {
  const node: JsonLdNode = {
    '@context': 'https://schema.org',
    '@type': 'LodgingBusiness',
    name: property.name,
    description: property.description,
    address: postalAddress(property.addressLine, property.postalCode, property.city, property.countryCode),
  };
  const url = absoluteUrl(propertyPath(property.slug));
  if (url !== null) {
    node.url = url;
  }
  const images = imageUrls(property.photos.map((photo): string => photo.url));
  if (images.length > 0) {
    node.image = images;
  }
  const point = geo(property.latitude, property.longitude);
  if (point !== null) {
    node.geo = point;
  }
  if (property.phone.trim() !== '') {
    node.telephone = property.phone;
  }
  const lowest = lowestRate(houses);
  if (lowest !== null) {
    node.priceRange = priceFromText(lowest.cents, lowest.currencyCode);
  }
  return node;
}

/**
 * One stay as a VacationRental: a whole place booked as one unit, with its capacity and what is included.
 */
export function stayJsonLd(house: HouseDetail): JsonLdNode {
  const node: JsonLdNode = {
    '@context': 'https://schema.org',
    '@type': 'VacationRental',
    name: house.name,
    description: house.description,
    address: postalAddress(house.propertyAddressLine, house.propertyPostalCode, house.propertyCity, house.propertyCountryCode),
    occupancy: { '@type': 'QuantitativeValue', maxValue: house.capacity },
    priceRange: priceFromText(house.nightlyRateCents, house.currencyCode),
  };
  const url = absoluteUrl(stayPath(house.propertySlug, house.slug));
  if (url !== null) {
    node.url = url;
  }
  const images = imageUrls(house.photos.map((photo): string => photo.url));
  if (images.length > 0) {
    node.image = images;
  }
  const point = geo(house.latitude ?? house.propertyLatitude, house.longitude ?? house.propertyLongitude);
  if (point !== null) {
    node.geo = point;
  }
  if (house.propertyPhone.trim() !== '') {
    node.telephone = house.propertyPhone;
  }
  if (house.amenities.length > 0) {
    node.amenityFeature = house.amenities.map(
      (amenity): JsonLdNode => ({ '@type': 'LocationFeatureSpecification', name: amenity.name, value: true }),
    );
  }
  return node;
}

/** The trail Home > Property > Stay. Without a configured site address it is left out (it needs absolute links). */
export function breadcrumbJsonLd(trail: readonly { name: string; path: string }[]): JsonLdNode | null {
  const items: JsonLdNode[] = [];
  for (const [index, step] of trail.entries()) {
    const url = absoluteUrl(step.path);
    if (url === null) {
      return null;
    }
    items.push({ '@type': 'ListItem', position: index + 1, name: step.name, item: url });
  }
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items };
}

/** The site itself, for the home page. Left out without a configured site address (it needs an absolute link). */
export function websiteJsonLd(): JsonLdNode | null {
  const url = absoluteUrl('/');
  if (url === null) {
    return null;
  }
  return { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_NAME, url, inLanguage: 'en' };
}
