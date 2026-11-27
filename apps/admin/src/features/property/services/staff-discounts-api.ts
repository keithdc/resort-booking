/**
 * @file apps/admin/src/features/property/services/staff-discounts-api.ts
 * @feature property
 * @dependencies api-client
 */

import type { Discount, DiscountWrite } from '@resort-booking/shared-types';
import { getStaffApiOk, mutateStaffApiOk } from '@/shared/services/api-client';

/**
 * A server that has not been restarted since "show on the website" (or "once per guest") was added sends no `promoted`
 * (or `oncePerGuest`): read each as off.
 */
function withDiscountDefaults(discount: Discount): Discount {
  return { ...discount, promoted: discount.promoted === true, oncePerGuest: discount.oncePerGuest === true };
}

/**
 * Every discount at a property, switched-off ones included.
 */
export async function fetchDiscounts(propertyId: string): Promise<Discount[]> {
  const discounts = await getStaffApiOk<Discount[]>(`/staff/properties/${propertyId}/discounts`);
  return discounts.map(withDiscountDefaults);
}

/**
 * Adds a discount. The API checks the rules and answers with a readable message.
 */
export async function createDiscount(propertyId: string, body: DiscountWrite): Promise<Discount> {
  return withDiscountDefaults(await mutateStaffApiOk<Discount>(`/staff/properties/${propertyId}/discounts`, 'POST', body));
}

/**
 * Edits a discount. Stays already booked keep the price they were quoted.
 */
export async function updateDiscount(discountId: string, body: DiscountWrite): Promise<Discount> {
  return withDiscountDefaults(await mutateStaffApiOk<Discount>(`/staff/discounts/${discountId}`, 'PATCH', body));
}

/**
 * Removes a discount.
 */
export function deleteDiscount(discountId: string): Promise<null> {
  return mutateStaffApiOk<null>(`/staff/discounts/${discountId}`, 'DELETE');
}
