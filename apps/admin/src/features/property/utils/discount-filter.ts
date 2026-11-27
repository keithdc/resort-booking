/**
 * @file apps/admin/src/features/property/utils/discount-filter.ts
 * @feature property
 * @dependencies discount-draft — pure helpers, no React
 *
 * Search, filter, order and page the Discounts list, which can grow long (for example many one-time codes).
 */

import type { Discount } from '@resort-booking/shared-types';
import { discountStatus, type DiscountStatusKind } from './discount-draft';

/** How many rows show at first, and how many more each "Show more" adds. */
export const DISCOUNT_PAGE_SIZE = 20;

export type DiscountTypeFilter = 'all' | 'coupon' | 'automatic';
export type DiscountStatusFilter = 'all' | DiscountStatusKind;
export type DiscountPromotedFilter = 'all' | 'promoted' | 'not_promoted';

export interface DiscountFilters {
  /** Matches the name and the promo code, any case. */
  search: string;
  type: DiscountTypeFilter;
  status: DiscountStatusFilter;
  /** Advertised to guests on the website, or not. */
  promoted: DiscountPromotedFilter;
}

/** Every discount, whatever its state: what "Clear filters" gives. */
export const NO_DISCOUNT_FILTERS: DiscountFilters = { search: '', type: 'all', status: 'all', promoted: 'all' };

/** What the list opens with: the discounts that are running now. */
export const DEFAULT_DISCOUNT_FILTERS: DiscountFilters = { ...NO_DISCOUNT_FILTERS, status: 'live' };

export const TYPE_FILTER_OPTIONS: readonly { value: DiscountTypeFilter; label: string }[] = [
  { value: 'all', label: 'All types' },
  { value: 'coupon', label: 'Coupons (with a code)' },
  { value: 'automatic', label: 'Automatic' },
];

export const STATUS_FILTER_OPTIONS: readonly { value: DiscountStatusFilter; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'live', label: 'Live' },
  { value: 'starts', label: 'Starts later' },
  { value: 'used_up', label: 'Used up' },
  { value: 'ended', label: 'Ended' },
  { value: 'off', label: 'Off' },
];

export const PROMOTED_FILTER_OPTIONS: readonly { value: DiscountPromotedFilter; label: string }[] = [
  { value: 'all', label: 'Promoted or not' },
  { value: 'promoted', label: 'Promoted (shown to guests)' },
  { value: 'not_promoted', label: 'Not promoted' },
];

/** The promo code of a coupon, or null for an automatic discount. */
export function couponCodeOf(discount: Pick<Discount, 'conditions'>): string | null {
  for (const condition of discount.conditions) {
    if (condition.kind === 'promo_code') {
      return condition.code;
    }
  }
  return null;
}

/** "Once per guest" for a coupon limited that way, else null (shown next to the other chips). */
export function guestLimitLabel(discount: Pick<Discount, 'oncePerGuest' | 'conditions'>): string | null {
  return discount.oncePerGuest && couponCodeOf(discount) !== null ? 'Once per guest' : null;
}

/** Are any of the three filters set (so "Clear filters" has something to clear)? */
export function hasActiveFilters(filters: DiscountFilters): boolean {
  return filters.search.trim() !== '' || filters.type !== 'all' || filters.status !== 'all' || filters.promoted !== 'all';
}

/**
 * Live first, then the ones that start later, then the rest (used up, ended, off). Inside each group the order the API
 * gave is kept. The list is not changed.
 */
export function sortDiscounts(discounts: readonly Discount[], today: string): Discount[] {
  const rank = (discount: Discount): number => {
    const kind = discountStatus(discount, today).kind;
    return kind === 'live' ? 0 : kind === 'starts' ? 1 : 2;
  };
  return discounts
    .map((discount, index) => ({ discount, index, rank: rank(discount) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.discount);
}

/**
 * The discounts that pass the three filters, in the order `sortDiscounts` gives. A search matches part of the name or
 * of the promo code, whatever the case.
 */
export function filterDiscounts(discounts: readonly Discount[], filters: DiscountFilters, today: string): Discount[] {
  const needle = filters.search.trim().toLowerCase();
  return sortDiscounts(discounts, today).filter((discount): boolean => {
    const code = couponCodeOf(discount);
    if (filters.type === 'coupon' && code === null) {
      return false;
    }
    if (filters.type === 'automatic' && code !== null) {
      return false;
    }
    if (filters.promoted === 'promoted' && !discount.promoted) {
      return false;
    }
    if (filters.promoted === 'not_promoted' && discount.promoted) {
      return false;
    }
    if (filters.status !== 'all' && discountStatus(discount, today).kind !== filters.status) {
      return false;
    }
    return needle === '' || discount.label.toLowerCase().includes(needle) || (code !== null && code.toLowerCase().includes(needle));
  });
}
