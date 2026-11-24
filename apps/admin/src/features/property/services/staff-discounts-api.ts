/**
 * @file apps/admin/src/features/property/services/staff-discounts-api.ts
 * @feature property
 * @dependencies api-client
 */

import type { Discount, DiscountWrite } from '@resort-booking/shared-types';
import { getStaffApiOk, mutateStaffApiOk } from '@/shared/services/api-client';

/**
 * Every discount at a property, switched-off ones included.
 */
export function fetchDiscounts(propertyId: string): Promise<Discount[]> {
  return getStaffApiOk<Discount[]>(`/staff/properties/${propertyId}/discounts`);
}

/**
 * Adds a discount. The API checks the rules and answers with a readable message.
 */
export function createDiscount(propertyId: string, body: DiscountWrite): Promise<Discount> {
  return mutateStaffApiOk<Discount>(`/staff/properties/${propertyId}/discounts`, 'POST', body);
}

/**
 * Edits a discount. Stays already booked keep the price they were quoted.
 */
export function updateDiscount(discountId: string, body: DiscountWrite): Promise<Discount> {
  return mutateStaffApiOk<Discount>(`/staff/discounts/${discountId}`, 'PATCH', body);
}

/**
 * Removes a discount.
 */
export function deleteDiscount(discountId: string): Promise<null> {
  return mutateStaffApiOk<null>(`/staff/discounts/${discountId}`, 'DELETE');
}
