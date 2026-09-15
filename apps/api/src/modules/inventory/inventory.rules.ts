/**
 * @file apps/api/src/modules/inventory/inventory.rules.ts
 * @feature inventory
 * @dependencies shared-types
 */

import type { PaymentMethod } from '@resort-booking/shared-types';

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

/**
 * Formats an instant in a timezone as YYYY-MM-DD.
 */
export function isoDateInTimeZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error('Could not format timezone date');
  }
  return `${year}-${month}-${day}`;
}

/**
 * Stay total in minor units. Rates stay on the API.
 */
export function quoteTotalCents(nights: number, nightlyRateCents: number): number {
  return nights * nightlyRateCents;
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
