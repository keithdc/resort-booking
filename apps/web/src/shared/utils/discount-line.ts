/**
 * @file apps/web/src/shared/utils/discount-line.ts
 * @shared Words for a discount line on a quote
 * @dependencies shared-types
 */

import type { QuoteDiscountLine } from '@resort-booking/shared-types';

/** "10", "7.5": whole numbers stay whole, never more than two decimals. */
function percentText(percent: number): string {
  return String(Number(percent.toFixed(2)));
}

/**
 * The line's name with its size: "Long stay: 7+ nights · 10% off". A fixed-amount discount, an older price
 * snapshot without a percent, and a label that already says its percent ("Early bird 10%") stay as they are.
 */
export function discountLineLabel(line: { label: string; percent?: number | undefined }): string {
  const { percent } = line;
  if (percent === undefined || !Number.isFinite(percent) || percent <= 0) {
    return line.label;
  }
  const text = percentText(percent);
  if (new RegExp(`(^|[^0-9.])${text.replace('.', '\\.')}\\s?%`).test(line.label)) {
    return line.label;
  }
  return `${line.label} · ${text}% off`;
}

/**
 * True when an automatic discount and a promo-code coupon both apply. Automatic discounts never stack with each
 * other and a coupon that cannot stack leaves a single line, so "more than one line" means exactly that pair
 * (the coupon was taken from what the automatic discount left).
 */
export function discountsAreCombined(lines: readonly Pick<QuoteDiscountLine, 'discountId'>[]): boolean {
  return lines.length > 1;
}

/** The calm line shown under combined discounts. */
export const COMBINED_DISCOUNTS_NOTE = 'Your discounts are combined.';
