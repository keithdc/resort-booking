/**
 * @file apps/api/src/modules/discounts/discounts.rules.ts
 * @feature discounts
 * @dependencies shared-types, iso-date
 */

import type {
  Discount,
  DiscountCondition,
  DiscountEffect,
  DiscountWrite,
  PromoCodeResult,
  QuoteDiscountLine,
} from '@resort-booking/shared-types';
import { isValidIsoDate } from '../../shared/dates/iso-date';

export const MAX_DISCOUNT_LABEL_LENGTH = 80;
export const MAX_PRIORITY = 1000;
export const PROMO_CODE_PATTERN = /^[A-Za-z0-9_-]{3,30}$/;

/** Facts about one stay that conditions are checked against. */
export interface DiscountContext {
  houseId: string;
  /** Each night of the stay, YYYY-MM-DD. */
  nights: readonly string[];
  checkIn: string;
  /** Today in the property's timezone, YYYY-MM-DD. */
  today: string;
  /** The code the guest typed, if any. */
  promoCode: string | null;
}

export interface DiscountOutcome {
  lines: QuoteDiscountLine[];
  discountCents: number;
  promoCode: PromoCodeResult | null;
}

// --- Matching ---

/**
 * Whole days from `fromIso` to `toIso` (negative when `toIso` is earlier).
 */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

/**
 * Weekday of a night: 0 = Sunday ... 6 = Saturday.
 */
export function weekdayOf(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

/**
 * Does one condition hold for this stay?
 */
export function conditionMatches(condition: DiscountCondition, context: DiscountContext): boolean {
  switch (condition.kind) {
    case 'min_nights':
      return context.nights.length >= condition.nights;
    case 'booking_lead_days': {
      const lead = daysBetween(context.today, context.checkIn);
      return (condition.minDays === null || lead >= condition.minDays) && (condition.maxDays === null || lead <= condition.maxDays);
    }
    case 'stay_dates':
      return (
        context.nights.length > 0 &&
        context.nights.every((night): boolean => condition.startDate <= night && night <= condition.endDate)
      );
    case 'booking_window':
      return condition.startDate <= context.today && context.today <= condition.endDate;
    case 'weekday':
      return context.nights.length > 0 && context.nights.every((night): boolean => condition.days.includes(weekdayOf(night)));
    case 'promo_code':
      return context.promoCode !== null && normalizeCode(context.promoCode) === normalizeCode(condition.code);
  }
}

/**
 * Is the discount switched on, in scope for the house, not used up, and are all conditions true?
 */
export function discountMatches(discount: Discount, context: DiscountContext): boolean {
  if (!discount.active) {
    return false;
  }
  if (discount.houseIds !== null && !discount.houseIds.includes(context.houseId)) {
    return false;
  }
  if (discount.maxRedemptions !== null && discount.redemptions >= discount.maxRedemptions) {
    return false;
  }
  if (discount.conditions.length === 0) {
    return discount.alwaysOn;
  }
  return discount.conditions.every((condition): boolean => conditionMatches(condition, context));
}

// --- Amounts ---

/**
 * Money off `base`. Percent rounds to whole cents; fixed never exceeds `base`. Never negative.
 */
export function discountAmount(effect: DiscountEffect, base: number): number {
  if (base <= 0) {
    return 0;
  }
  const amount = effect.kind === 'percent' ? Math.round((base * effect.percent) / 100) : effect.amountCents;
  return Math.max(0, Math.min(amount, base));
}

/**
 * Applies the discounts that match a stay to its subtotal.
 *
 * - By default the guest gets the single best matching non-combinable discount.
 * - Combinable discounts stack with each other, in priority order, each on what is left.
 * - The guest gets whichever of those two options saves more; they never mix.
 * - The total never goes below zero.
 */
export function applyDiscounts(
  subtotalCents: number,
  discounts: readonly Discount[],
  context: DiscountContext,
): DiscountOutcome {
  const matching = discounts.filter((discount): boolean => discountMatches(discount, context));

  const singles = matching
    .filter((discount): boolean => !discount.combinable)
    .map((discount): QuoteDiscountLine => lineFor(discount, discountAmount(discount.effect, subtotalCents)))
    .sort((a, b): number => b.amountCents - a.amountCents || a.label.localeCompare(b.label));
  const bestSingle = singles[0];

  const stack: QuoteDiscountLine[] = [];
  let remaining = subtotalCents;
  const combinables = matching
    .filter((discount): boolean => discount.combinable)
    .sort((a, b): number => a.priority - b.priority || a.label.localeCompare(b.label));
  for (const discount of combinables) {
    const amountCents = discountAmount(discount.effect, remaining);
    remaining -= amountCents;
    stack.push(lineFor(discount, amountCents));
  }

  const stackTotal = sum(stack);
  const singleTotal = bestSingle?.amountCents ?? 0;
  const chosen = stackTotal > singleTotal ? stack : bestSingle === undefined ? [] : [bestSingle];
  const lines = chosen.filter((line): boolean => line.amountCents > 0);

  return {
    lines,
    discountCents: sum(lines),
    promoCode: promoOutcome(discounts, matching, lines, context),
  };
}

function lineFor(discount: Discount, amountCents: number): QuoteDiscountLine {
  return { discountId: discount.id, label: discount.label, amountCents };
}

function sum(lines: readonly QuoteDiscountLine[]): number {
  return lines.reduce((total, line): number => total + line.amountCents, 0);
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function promoCodeOf(discount: Discount): string | null {
  for (const condition of discount.conditions) {
    if (condition.kind === 'promo_code') {
      return condition.code;
    }
  }
  return null;
}

/**
 * What to tell the guest about the code they typed. A bad code never blocks a booking.
 */
function promoOutcome(
  all: readonly Discount[],
  matching: readonly Discount[],
  applied: readonly QuoteDiscountLine[],
  context: DiscountContext,
): PromoCodeResult | null {
  if (context.promoCode === null || context.promoCode.trim() === '') {
    return null;
  }
  const code = context.promoCode.trim();
  const owners = all.filter((discount): boolean => {
    const own = promoCodeOf(discount);
    return own !== null && normalizeCode(own) === normalizeCode(code) && discount.active;
  });
  if (owners.length === 0) {
    return { code, applied: false, message: 'That code is not valid' };
  }
  if (owners.some((owner): boolean => applied.some((line): boolean => line.discountId === owner.id))) {
    return { code, applied: true, message: `Code ${normalizeCode(code)} applied` };
  }
  if (owners.some((owner): boolean => matching.some((match): boolean => match.id === owner.id))) {
    return { code, applied: false, message: 'A better offer is already applied to this stay' };
  }
  return { code, applied: false, message: 'This code does not apply to these dates' };
}

// --- Validation (staff input) ---

/**
 * A readable problem with a discount, or null when it is valid.
 */
export function validateDiscountWrite(write: DiscountWrite): string | null {
  if (write.label.trim() === '') {
    return 'Give the discount a name, e.g. "Long stay"';
  }
  if (write.label.trim().length > MAX_DISCOUNT_LABEL_LENGTH) {
    return `The name can be at most ${String(MAX_DISCOUNT_LABEL_LENGTH)} characters`;
  }
  const effectProblem = validateEffect(write.effect);
  if (effectProblem !== null) {
    return effectProblem;
  }
  if (write.conditions.length === 0 && !write.alwaysOn) {
    return 'Add at least one condition, or mark the discount as always on';
  }
  if (write.conditions.length > 0 && write.alwaysOn) {
    return 'An always-on discount cannot also have conditions';
  }
  if (write.conditions.filter((condition): boolean => condition.kind === 'promo_code').length > 1) {
    return 'A discount can have only one promo code';
  }
  for (const condition of write.conditions) {
    const problem = validateCondition(condition);
    if (problem !== null) {
      return problem;
    }
  }
  if (write.houseIds !== null && write.houseIds.length === 0) {
    return 'Choose at least one house, or apply the discount to every house';
  }
  if (!Number.isInteger(write.priority) || write.priority < 0 || write.priority > MAX_PRIORITY) {
    return `Priority must be a whole number from 0 to ${String(MAX_PRIORITY)}`;
  }
  if (write.maxRedemptions !== null && (!Number.isInteger(write.maxRedemptions) || write.maxRedemptions < 1)) {
    return 'The use limit must be at least 1, or left empty for unlimited';
  }
  return null;
}

function validateEffect(effect: DiscountEffect): string | null {
  if (effect.kind === 'percent') {
    return Number.isInteger(effect.percent) && effect.percent >= 1 && effect.percent <= 100
      ? null
      : 'A percentage discount must be a whole number from 1 to 100';
  }
  return Number.isInteger(effect.amountCents) && effect.amountCents >= 1
    ? null
    : 'A fixed discount must be more than zero';
}

function validateCondition(condition: DiscountCondition): string | null {
  switch (condition.kind) {
    case 'min_nights':
      return Number.isInteger(condition.nights) && condition.nights >= 1 ? null : 'Minimum nights must be at least 1';
    case 'booking_lead_days': {
      const { minDays, maxDays } = condition;
      if (minDays === null && maxDays === null) {
        return 'Set the earliest or the latest number of days before arrival';
      }
      if ((minDays !== null && (!Number.isInteger(minDays) || minDays < 0)) || (maxDays !== null && (!Number.isInteger(maxDays) || maxDays < 0))) {
        return 'Days before arrival must be whole numbers, zero or more';
      }
      if (minDays !== null && maxDays !== null && maxDays < minDays) {
        return 'The latest days before arrival cannot be less than the earliest';
      }
      return null;
    }
    case 'stay_dates':
    case 'booking_window':
      if (!isValidIsoDate(condition.startDate) || !isValidIsoDate(condition.endDate)) {
        return 'Dates must be real calendar dates';
      }
      return condition.endDate < condition.startDate ? 'The end date cannot be before the start date' : null;
    case 'weekday':
      if (condition.days.length === 0) {
        return 'Choose at least one weekday';
      }
      if (condition.days.some((day): boolean => !Number.isInteger(day) || day < 0 || day > 6) || new Set(condition.days).size !== condition.days.length) {
        return 'Weekdays must be unique values from Sunday to Saturday';
      }
      return null;
    case 'promo_code':
      return PROMO_CODE_PATTERN.test(condition.code) ? null : 'A promo code is 3 to 30 letters, numbers, dashes or underscores';
  }
}

// --- Parsing untrusted input (request bodies, JSON columns) ---

/**
 * Turns unknown JSON into a typed effect, or null if it is malformed.
 */
export function parseEffect(raw: unknown): DiscountEffect | null {
  if (typeof raw !== 'object' || raw === null || !('kind' in raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  if (record.kind === 'percent' && typeof record.percent === 'number') {
    return { kind: 'percent', percent: record.percent };
  }
  if (record.kind === 'fixed' && typeof record.amountCents === 'number') {
    return { kind: 'fixed', amountCents: record.amountCents };
  }
  return null;
}

/**
 * Turns unknown JSON into typed conditions, or null if anything is malformed.
 */
export function parseConditions(raw: unknown): DiscountCondition[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }
  const parsed: DiscountCondition[] = [];
  for (const item of raw as unknown[]) {
    const condition = parseCondition(item);
    if (condition === null) {
      return null;
    }
    parsed.push(condition);
  }
  return parsed;
}

function parseCondition(item: unknown): DiscountCondition | null {
  if (typeof item !== 'object' || item === null || !('kind' in item)) {
    return null;
  }
  const record = item as Record<string, unknown>;
  switch (record.kind) {
    case 'min_nights':
      return typeof record.nights === 'number' ? { kind: 'min_nights', nights: record.nights } : null;
    case 'booking_lead_days': {
      const minDays = optionalNumber(record.minDays);
      const maxDays = optionalNumber(record.maxDays);
      return minDays === undefined || maxDays === undefined ? null : { kind: 'booking_lead_days', minDays, maxDays };
    }
    case 'stay_dates':
    case 'booking_window':
      return typeof record.startDate === 'string' && typeof record.endDate === 'string'
        ? { kind: record.kind, startDate: record.startDate, endDate: record.endDate }
        : null;
    case 'weekday':
      return Array.isArray(record.days) && (record.days as unknown[]).every((day): boolean => typeof day === 'number')
        ? { kind: 'weekday', days: record.days as number[] }
        : null;
    case 'promo_code':
      return typeof record.code === 'string' ? { kind: 'promo_code', code: record.code } : null;
    default:
      return null;
  }
}

/** A number, or null for missing/null; undefined means "present but not a number". */
function optionalNumber(value: unknown): number | null | undefined {
  if (value === undefined || value === null) {
    return null;
  }
  return typeof value === 'number' ? value : undefined;
}
