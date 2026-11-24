/**
 * @file apps/api/src/modules/property/property.rules.ts
 * @feature property
 * @dependencies none
 */

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
