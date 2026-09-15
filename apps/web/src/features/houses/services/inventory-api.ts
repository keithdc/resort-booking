/**
 * @file apps/web/src/features/houses/services/inventory-api.ts
 * @feature houses
 * @dependencies api-client
 */

import type { CreateHoldRequest, Hold, Quote } from '@resort-booking/shared-types';
import { getApiOk } from '@/shared/services/api-client';

/**
 * Asks the API for nights, total, and availability.
 */
export function fetchQuote(
  houseId: string,
  checkIn: string,
  checkOut: string,
  guestCount: number,
): Promise<Quote> {
  const params = new URLSearchParams({
    houseId,
    checkIn,
    checkOut,
    guestCount: String(guestCount),
  });
  return getApiOk<Quote>(`/quotes?${params.toString()}`);
}

/**
 * Starts a house hold. TTL is decided by the API.
 */
export function createHold(body: CreateHoldRequest): Promise<Hold> {
  return getApiOk<Hold>('/holds', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Reloads a hold (including expired) so the form can stay filled.
 */
export function fetchHold(holdId: string): Promise<Hold> {
  return getApiOk<Hold>(`/holds/${encodeURIComponent(holdId)}`);
}
