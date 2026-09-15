/**
 * @file apps/admin/src/features/property/services/staff-property-api.ts
 * @feature property
 * @dependencies api-client
 */

import type { PropertySummary } from '@resort-booking/shared-types';
import { getStaffApiOk } from '@/shared/services/api-client';

/**
 * Staff property list including unpublished.
 */
export function fetchStaffProperties(): Promise<PropertySummary[]> {
  return getStaffApiOk<PropertySummary[]>('/staff/properties');
}
