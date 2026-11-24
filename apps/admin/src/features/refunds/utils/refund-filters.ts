/**
 * @file apps/admin/src/features/refunds/utils/refund-filters.ts
 * @feature refunds
 * @dependencies none
 */

import type { StaffRefund } from '@resort-booking/shared-types';
import type { RefundListStatus } from '../services/staff-refunds-api';

export type RefundFilter = 'attention' | 'pending' | 'failed' | 'done' | 'all';

export interface RefundFilterOption {
  filter: RefundFilter;
  label: string;
}

/** The chips, in order. "Needs attention" comes first and is the default. */
export const REFUND_FILTERS: readonly RefundFilterOption[] = [
  { filter: 'attention', label: 'Needs attention' },
  { filter: 'pending', label: 'Pending' },
  { filter: 'failed', label: 'Failed' },
  { filter: 'done', label: 'Done' },
  { filter: 'all', label: 'All' },
];

/**
 * The status value the API understands for a chip.
 */
export function apiStatusFor(filter: RefundFilter): RefundListStatus {
  switch (filter) {
    case 'attention':
      return 'needs_attention';
    case 'pending':
      return 'pending';
    case 'failed':
      return 'failed';
    case 'done':
      return 'succeeded';
    case 'all':
      return 'all';
  }
}

/**
 * Does a refund belong under a chip? Used to drop a row from the list once staff resolve it.
 */
export function matchesFilter(refund: Pick<StaffRefund, 'status'>, filter: RefundFilter): boolean {
  switch (filter) {
    case 'attention':
      return refund.status === 'pending' || refund.status === 'failed';
    case 'pending':
      return refund.status === 'pending';
    case 'failed':
      return refund.status === 'failed';
    case 'done':
      return refund.status === 'succeeded';
    case 'all':
      return true;
  }
}

/**
 * Narrows the list by what staff typed: booking reference, guest name or email, stay or property.
 * Blank shows everything. Matching ignores case and surrounding spaces.
 */
export function searchRefunds(refunds: readonly StaffRefund[], query: string): StaffRefund[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') {
    return [...refunds];
  }
  return refunds.filter((refund): boolean =>
    [refund.reference, refund.bookerName, refund.bookerEmail, refund.stayName, refund.propertyName].some((value): boolean =>
      value.toLowerCase().includes(needle),
    ),
  );
}
