/**
 * @file apps/admin/src/features/property/services/staff-rates-api.ts
 * @feature property
 * @dependencies api-client
 */

import type {
  BulkRatePeriodPreview,
  BulkRatePeriodRequest,
  BulkRatePeriodResult,
  RatePeriod,
  RatePeriodWrite,
} from '@resort-booking/shared-types';
import { getStaffApiOk, mutateStaffApiOk } from '@/shared/services/api-client';

/**
 * Every house's seasonal periods at a property in one request (the houses list).
 */
export function fetchPropertyRatePeriods(propertyId: string): Promise<RatePeriod[]> {
  return getStaffApiOk<RatePeriod[]>(`/staff/properties/${propertyId}/rate-periods`);
}

/**
 * Seasonal rate periods on one house, soonest first.
 */
export function fetchRatePeriods(houseId: string): Promise<RatePeriod[]> {
  return getStaffApiOk<RatePeriod[]>(`/staff/houses/${houseId}/rate-periods`);
}

/**
 * Adds a period. The API rejects a date clash and names the period it collides with.
 */
export function createRatePeriod(houseId: string, body: RatePeriodWrite): Promise<RatePeriod> {
  return mutateStaffApiOk<RatePeriod>(`/staff/houses/${houseId}/rate-periods`, 'POST', body);
}

/**
 * Edits a period.
 */
export function updateRatePeriod(periodId: string, body: RatePeriodWrite): Promise<RatePeriod> {
  return mutateStaffApiOk<RatePeriod>(`/staff/rate-periods/${periodId}`, 'PATCH', body);
}

/**
 * Removes a period. Existing reservations keep the price they were quoted.
 */
export function deleteRatePeriod(periodId: string): Promise<null> {
  return mutateStaffApiOk<null>(`/staff/rate-periods/${periodId}`, 'DELETE');
}

/**
 * Dry run of "apply to several houses": which houses would get it and which clash. Writes nothing.
 */
export function previewBulkRatePeriod(
  propertyId: string,
  body: BulkRatePeriodRequest,
): Promise<BulkRatePeriodPreview> {
  return mutateStaffApiOk<BulkRatePeriodPreview>(
    `/staff/properties/${propertyId}/rate-periods/bulk/preview`,
    'POST',
    body,
  );
}

/**
 * Applies the period to every house without a clash. The API requires `confirmed: true`.
 */
export function applyBulkRatePeriod(
  propertyId: string,
  body: BulkRatePeriodRequest,
): Promise<BulkRatePeriodResult> {
  return mutateStaffApiOk<BulkRatePeriodResult>(
    `/staff/properties/${propertyId}/rate-periods/bulk`,
    'POST',
    body,
  );
}
