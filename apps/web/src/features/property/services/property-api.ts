/**
 * @file apps/web/src/features/property/services/property-api.ts
 * @feature property
 * @dependencies api-client
 */

import type {
  CancellationPolicy,
  ExtraService,
  HouseDetail,
  HouseRequestOption,
  HouseSummary,
  PropertyDetail,
  PropertySummary,
} from '@resort-booking/shared-types';
import { cache } from 'react';
import { getApiOk } from '@/shared/services/api-client';

/**
 * Lists published properties. Wrapped in React `cache`, so the page and its metadata share one API call per request
 * (the same for the three loaders below).
 */
export const fetchProperties = cache((): Promise<PropertySummary[]> => {
  return getApiOk<PropertySummary[]>('/properties');
});

/**
 * Loads one published property.
 */
export const fetchProperty = cache((slug: string): Promise<PropertyDetail> => {
  return getApiOk<PropertyDetail>(`/properties/${encodeURIComponent(slug)}`);
});

/**
 * Lists published houses at a property.
 */
export const fetchHouses = cache((propertySlug: string): Promise<HouseSummary[]> => {
  return getApiOk<HouseSummary[]>(`/properties/${encodeURIComponent(propertySlug)}/houses`);
});

/**
 * Loads a published house.
 */
export const fetchHouse = cache((propertySlug: string, houseSlug: string): Promise<HouseDetail> => {
  return getApiOk<HouseDetail>(
    `/properties/${encodeURIComponent(propertySlug)}/houses/${encodeURIComponent(houseSlug)}`,
  );
});

/**
 * Published extra pillows / mattress-style requests at checkout.
 */
export function fetchRequestOptions(propertySlug: string): Promise<HouseRequestOption[]> {
  return getApiOk<HouseRequestOption[]>(
    `/properties/${encodeURIComponent(propertySlug)}/request-options`,
  );
}

/**
 * Published extras catalog for this property.
 */
export function fetchExtras(propertySlug: string): Promise<ExtraService[]> {
  return getApiOk<ExtraService[]>(`/properties/${encodeURIComponent(propertySlug)}/extras`);
}

/**
 * The refund ladder and date-change rule guests may read before booking.
 */
export function fetchCancellationPolicy(propertySlug: string): Promise<CancellationPolicy> {
  return getApiOk<CancellationPolicy>(`/properties/${encodeURIComponent(propertySlug)}/cancellation-policy`);
}

/**
 * Same, but a failed load gives null so the page still renders (and says the terms could not load)
 * instead of breaking over a secondary section.
 */
export async function fetchCancellationPolicyOrNull(propertySlug: string): Promise<CancellationPolicy | null> {
  try {
    return await fetchCancellationPolicy(propertySlug);
  } catch {
    return null;
  }
}
