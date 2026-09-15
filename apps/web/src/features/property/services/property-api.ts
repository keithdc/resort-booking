/**
 * @file apps/web/src/features/property/services/property-api.ts
 * @feature property
 * @dependencies api-client
 */

import type {
  ExtraService,
  HouseDetail,
  HouseRequestOption,
  HouseSummary,
  PropertyDetail,
  PropertySummary,
} from '@resort-booking/shared-types';
import { getApiOk } from '@/shared/services/api-client';

/**
 * Lists published properties.
 */
export function fetchProperties(): Promise<PropertySummary[]> {
  return getApiOk<PropertySummary[]>('/properties');
}

/**
 * Loads one published property.
 */
export function fetchProperty(slug: string): Promise<PropertyDetail> {
  return getApiOk<PropertyDetail>(`/properties/${encodeURIComponent(slug)}`);
}

/**
 * Lists published houses at a property.
 */
export function fetchHouses(propertySlug: string): Promise<HouseSummary[]> {
  return getApiOk<HouseSummary[]>(`/properties/${encodeURIComponent(propertySlug)}/houses`);
}

/**
 * Loads a published house.
 */
export function fetchHouse(propertySlug: string, houseSlug: string): Promise<HouseDetail> {
  return getApiOk<HouseDetail>(
    `/properties/${encodeURIComponent(propertySlug)}/houses/${encodeURIComponent(houseSlug)}`,
  );
}

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
