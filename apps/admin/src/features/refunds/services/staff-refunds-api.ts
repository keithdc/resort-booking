/**
 * @file apps/admin/src/features/refunds/services/staff-refunds-api.ts
 * @feature refunds
 * @dependencies api-client
 */

import type { MarkRefundPaidRequest, StaffRefund } from '@resort-booking/shared-types';
import { getStaffApiOk, mutateStaffApiOk } from '@/shared/services/api-client';

/** Which refunds to list. `needs_attention` is pending plus failed. */
export type RefundListStatus = 'needs_attention' | 'pending' | 'failed' | 'succeeded' | 'all';

/**
 * Refunds for staff, newest first, optionally for one property.
 */
export function fetchStaffRefunds(status: RefundListStatus, propertyId: string): Promise<StaffRefund[]> {
  const params = new URLSearchParams({ status });
  if (propertyId !== '') {
    params.set('propertyId', propertyId);
  }
  return getStaffApiOk<StaffRefund[]>(`/staff/refunds?${params.toString()}`);
}

/**
 * Asks the payment provider again (for a failed refund, or a pending one that is not a manual refund).
 */
export function retryStaffRefund(refundId: string): Promise<StaffRefund> {
  return mutateStaffApiOk<StaffRefund>(`/staff/refunds/${refundId}/retry`, 'POST');
}

/**
 * Records that staff sent the money themselves. The note says how and when.
 */
export function markStaffRefundPaid(refundId: string, body: MarkRefundPaidRequest): Promise<StaffRefund> {
  return mutateStaffApiOk<StaffRefund>(`/staff/refunds/${refundId}/mark-paid`, 'POST', body);
}
