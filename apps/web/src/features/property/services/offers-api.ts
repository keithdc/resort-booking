/**
 * @file apps/web/src/features/property/services/offers-api.ts
 * @feature property
 * @dependencies api-client
 */

import type { PromotedOffer } from '@resort-booking/shared-types';
import { getApiOk } from '@/shared/services/api-client';

/**
 * The discounts staff chose to advertise at a published property.
 */
export function fetchPropertyOffers(propertySlug: string): Promise<PromotedOffer[]> {
  return getApiOk<PromotedOffer[]>(`/properties/${encodeURIComponent(propertySlug)}/offers`);
}

/**
 * Same, but a failed load gives an empty list: offers are an extra, so the page must render without them.
 */
export async function fetchPropertyOffersOrEmpty(propertySlug: string): Promise<PromotedOffer[]> {
  try {
    return await fetchPropertyOffers(propertySlug);
  } catch {
    return [];
  }
}
