/**
 * @file apps/api/src/modules/property/property.rules.ts
 * @feature property
 * @dependencies none
 */

import type { ExtraServiceWrite } from '@resort-booking/shared-types';

/**
 * The guest extras every NEW property starts with. The data model has no pricing unit: an extra is a name, a
 * description, a kind (instant = priced and paid at checkout, on_request = staff confirm), a price and a published
 * flag. Both start as "on request" at price 0, published, so a guest can ask for them and staff confirm; the owner sets
 * a price (and may switch the kind to instant) in the property's Extras tab. Existing properties are not touched.
 */
export const DEFAULT_PROPERTY_EXTRAS: readonly ExtraServiceWrite[] = [
  {
    name: 'Baby mattress / travel cot',
    description: 'Ask for a baby mattress or travel cot to be ready when you arrive. Staff confirm after the stay is booked.',
    kind: 'on_request',
    priceCents: 0,
    currencyCode: 'EUR',
    published: true,
  },
  {
    name: 'Extra pillows',
    description: 'Ask for extra pillows in the house. Staff confirm after the stay is booked.',
    kind: 'on_request',
    priceCents: 0,
    currencyCode: 'EUR',
    published: true,
  },
];

/**
 * URL slug from a property name. Uniqueness is enforced in Postgres.
 */
export function slugifyPropertyName(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug === '' ? 'property' : slug;
}

export interface MapPoint {
  latitude: number;
  longitude: number;
}

/**
 * Where to pin a stay on a map: its own coordinates when it has a complete, valid pair, otherwise
 * the property's. A half-set or unreadable pair is ignored, so a stay is never pinned in the sea
 * because one of its two numbers was missing.
 */
export function resolveMapPoint(
  stayLatitude: string | null,
  stayLongitude: string | null,
  propertyLatitude: string,
  propertyLongitude: string,
): MapPoint {
  const own = readPoint(stayLatitude, stayLongitude);
  if (own !== null) {
    return own;
  }
  // Property coordinates are required when a property is saved, so they are always readable here.
  return {
    latitude: Number.parseFloat(propertyLatitude),
    longitude: Number.parseFloat(propertyLongitude),
  };
}

function readPoint(latitudeText: string | null, longitudeText: string | null): MapPoint | null {
  if (latitudeText === null || longitudeText === null) {
    return null;
  }
  const latitude = Number.parseFloat(latitudeText);
  const longitude = Number.parseFloat(longitudeText);
  const valid =
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180;
  return valid ? { latitude, longitude } : null;
}
