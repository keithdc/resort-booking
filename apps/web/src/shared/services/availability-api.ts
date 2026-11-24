/**
 * @file apps/web/src/shared/services/availability-api.ts
 * @shared Booked-date reads for guest pickers
 * @dependencies api-client
 */

import type { HouseAvailability, PropertyAvailability } from '@resort-booking/shared-types';
import { getApiOk } from './api-client';

interface AvailabilityWindowOptions {
  from?: string | undefined;
  to?: string | undefined;
}

interface HouseAvailabilityOptions extends AvailabilityWindowOptions {
  checkIn?: string | undefined;
}

/**
 * Unavailable ranges for one house. With `checkIn`, also the latest valid check-out.
 */
export function fetchHouseAvailability(
  propertySlug: string,
  houseSlug: string,
  options: HouseAvailabilityOptions = {},
): Promise<HouseAvailability> {
  return getApiOk<HouseAvailability>(
    `/properties/${encodeURIComponent(propertySlug)}/houses/${encodeURIComponent(houseSlug)}/availability${toQuery(options)}`,
  );
}

/**
 * Nights when no house at the property is free.
 */
export function fetchPropertyAvailability(
  propertySlug: string,
  options: AvailabilityWindowOptions = {},
): Promise<PropertyAvailability> {
  return getApiOk<PropertyAvailability>(
    `/properties/${encodeURIComponent(propertySlug)}/availability${toQuery(options)}`,
  );
}

function toQuery(options: HouseAvailabilityOptions): string {
  const params = new URLSearchParams();
  if (options.from !== undefined) {
    params.set('from', options.from);
  }
  if (options.to !== undefined) {
    params.set('to', options.to);
  }
  if (options.checkIn !== undefined) {
    params.set('checkIn', options.checkIn);
  }
  const text = params.toString();
  return text === '' ? '' : `?${text}`;
}
