/**
 * @file apps/api/src/modules/inventory/inventory.rules.ts
 * @feature inventory
 * @dependencies shared-types
 */

import type { PaymentMethod, PromoCodeResult, QuoteDiscountLine, QuoteLine } from '@resort-booking/shared-types';
import { isoDateInTimeZone } from '../../shared/dates/iso-date';

export { isoDateInTimeZone };

export const CARD_HOLD_TTL_SECONDS = 900;
export const BANK_HOLD_TTL_SECONDS = 172800;
export const HOLD_WARNING_REMAINING_SECONDS = 300;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Card/wallets freeze 15 minutes; bank transfer freezes 48 hours.
 */
export function holdTtlSeconds(paymentMethod: PaymentMethod): number {
  return paymentMethod === 'bank_transfer' ? BANK_HOLD_TTL_SECONDS : CARD_HOLD_TTL_SECONDS;
}

/**
 * Inclusive-exclusive night count. Returns null when the range is invalid.
 */
export function nightsBetween(checkIn: string, checkOut: string): number | null {
  if (!ISO_DATE.test(checkIn) || !ISO_DATE.test(checkOut)) {
    return null;
  }
  const start = parseUtcDate(checkIn);
  const end = parseUtcDate(checkOut);
  if (start === null || end === null) {
    return null;
  }
  const diff = (end.getTime() - start.getTime()) / 86_400_000;
  if (!Number.isInteger(diff) || diff < 1) {
    return null;
  }
  return diff;
}

/**
 * Guest check-in must not be before the property-local today (YYYY-MM-DD).
 */
export function isCheckInBeforeToday(checkIn: string, todayIsoDate: string): boolean {
  return checkIn < todayIsoDate;
}

function parseUtcDate(isoDate: string): Date | null {
  const [yearRaw, monthRaw, dayRaw] = isoDate.split('-');
  const year = Number.parseInt(yearRaw ?? '', 10);
  const month = Number.parseInt(monthRaw ?? '', 10);
  const day = Number.parseInt(dayRaw ?? '', 10);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}

/** The price a guest was quoted, saved with the hold so later rate or discount edits never change it. */
export interface PriceSnapshot {
  lines: QuoteLine[];
  subtotalCents: number;
  discounts: QuoteDiscountLine[];
  discountCents: number;
  totalCents: number;
  currencyCode: string;
  promoCode: PromoCodeResult | null;
}

/**
 * True when stored JSON is a complete price snapshot. Older holds (saved before discounts existed)
 * fail this on purpose and fall back to a live quote.
 */
export function isPriceSnapshot(value: unknown): value is PriceSnapshot {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    Array.isArray(record.lines) &&
    Array.isArray(record.discounts) &&
    typeof record.subtotalCents === 'number' &&
    typeof record.discountCents === 'number' &&
    typeof record.totalCents === 'number' &&
    typeof record.currencyCode === 'string' &&
    'promoCode' in record
  );
}

/**
 * Short code the guest quotes to the operator, derived from the stay id (no extra column to keep
 * in sync): "BK-" plus 10 hex characters, e.g. BK-1A2B3C4D5E.
 */
export function referenceFor(stayId: string): string {
  return `BK-${stayId.replace(/-/g, '').slice(0, 10).toUpperCase()}`;
}
