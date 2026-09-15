/**
 * @file apps/api/src/modules/property/geocode.rules.ts
 * @feature property
 * @dependencies GeocodeHit
 */

import type { GeocodeHit } from '@resort-booking/shared-types';

/**
 * Prefer Nominatim place fields; fill blanks from Photon.
 */
export function mergeReverseHits(
  preferred: GeocodeHit | null,
  fallback: GeocodeHit | null,
): GeocodeHit | null {
  if (preferred === null) {
    return fallback;
  }
  if (fallback === null) {
    return preferred;
  }
  return {
    label: preferred.label !== '' ? preferred.label : fallback.label,
    addressLine: preferred.addressLine !== '' ? preferred.addressLine : fallback.addressLine,
    city: preferred.city !== '' ? preferred.city : fallback.city,
    postalCode: preferred.postalCode !== '' ? preferred.postalCode : fallback.postalCode,
    countryCode: preferred.countryCode !== '' ? preferred.countryCode : fallback.countryCode,
    latitude: preferred.latitude,
    longitude: preferred.longitude,
  };
}
