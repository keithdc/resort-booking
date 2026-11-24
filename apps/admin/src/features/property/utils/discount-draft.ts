/**
 * @file apps/admin/src/features/property/utils/discount-draft.ts
 * @feature property
 * @dependencies shared-types, money, format-date — pure helpers, no React
 */

import type {
  Discount,
  DiscountCondition,
  DiscountEffect,
  DiscountWrite,
  HouseSummary,
} from '@resort-booking/shared-types';
import { formatIsoDate } from '@/shared/utils/format-date';
import { centsFromEuroInput, eurosInputFromCents, formatCents } from '@/shared/utils/money';

export const WEEKDAY_NAMES: readonly string[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const PROMO_CODE_PATTERN = /^[A-Za-z0-9_-]{3,30}$/;
const MAX_LABEL_LENGTH = 80;
const MAX_PRIORITY = 1000;

/** Everything the discount form edits, as strings the person typed. */
export interface DiscountDraft {
  label: string;
  effectKind: 'percent' | 'fixed';
  /** Whole percent, or euros for a fixed discount. */
  value: string;
  scope: 'all' | 'chosen';
  houseIds: string[];
  alwaysOn: boolean;
  minNightsOn: boolean;
  minNights: string;
  leadOn: boolean;
  leadMin: string;
  leadMax: string;
  stayOn: boolean;
  stayStart: string;
  stayEnd: string;
  windowOn: boolean;
  windowStart: string;
  windowEnd: string;
  weekdayOn: boolean;
  weekdays: number[];
  promoOn: boolean;
  promoCode: string;
  combinable: boolean;
  priority: string;
  active: boolean;
  limitOn: boolean;
  maxRedemptions: string;
}

/** Problems found in a draft, by form area. Missing key means that area is fine. */
export interface DraftProblems {
  label?: string;
  value?: string;
  houses?: string;
  conditions?: string;
  minNights?: string;
  lead?: string;
  stay?: string;
  window?: string;
  weekdays?: string;
  promo?: string;
  priority?: string;
  limit?: string;
}

export const EMPTY_DISCOUNT_DRAFT: DiscountDraft = {
  label: '',
  effectKind: 'percent',
  value: '',
  scope: 'all',
  houseIds: [],
  alwaysOn: false,
  minNightsOn: false,
  minNights: '',
  leadOn: false,
  leadMin: '',
  leadMax: '',
  stayOn: false,
  stayStart: '',
  stayEnd: '',
  windowOn: false,
  windowStart: '',
  windowEnd: '',
  weekdayOn: false,
  weekdays: [],
  promoOn: false,
  promoCode: '',
  combinable: false,
  priority: '100',
  active: true,
  limitOn: false,
  maxRedemptions: '',
};

// --- Draft <-> API ---

/**
 * Fills the form from a saved discount.
 */
export function draftFromDiscount(discount: Discount): DiscountDraft {
  const draft: DiscountDraft = {
    ...EMPTY_DISCOUNT_DRAFT,
    label: discount.label,
    effectKind: discount.effect.kind,
    value:
      discount.effect.kind === 'percent'
        ? String(discount.effect.percent)
        : eurosInputFromCents(discount.effect.amountCents),
    scope: discount.houseIds === null ? 'all' : 'chosen',
    houseIds: discount.houseIds === null ? [] : [...discount.houseIds],
    alwaysOn: discount.alwaysOn,
    combinable: discount.combinable,
    priority: String(discount.priority),
    active: discount.active,
    limitOn: discount.maxRedemptions !== null,
    maxRedemptions: discount.maxRedemptions === null ? '' : String(discount.maxRedemptions),
  };
  for (const condition of discount.conditions) {
    switch (condition.kind) {
      case 'min_nights':
        draft.minNightsOn = true;
        draft.minNights = String(condition.nights);
        break;
      case 'booking_lead_days':
        draft.leadOn = true;
        draft.leadMin = condition.minDays === null ? '' : String(condition.minDays);
        draft.leadMax = condition.maxDays === null ? '' : String(condition.maxDays);
        break;
      case 'stay_dates':
        draft.stayOn = true;
        draft.stayStart = condition.startDate;
        draft.stayEnd = condition.endDate;
        break;
      case 'booking_window':
        draft.windowOn = true;
        draft.windowStart = condition.startDate;
        draft.windowEnd = condition.endDate;
        break;
      case 'weekday':
        draft.weekdayOn = true;
        draft.weekdays = [...condition.days];
        break;
      case 'promo_code':
        draft.promoOn = true;
        draft.promoCode = condition.code;
        break;
    }
  }
  return draft;
}

/**
 * Turns the form into what the API expects. Run `validateDraft` first; this does not re-check.
 */
export function draftToWrite(draft: DiscountDraft): DiscountWrite {
  return {
    label: draft.label.trim(),
    effect: effectFromDraft(draft),
    conditions: draft.alwaysOn ? [] : conditionsFromDraft(draft),
    alwaysOn: draft.alwaysOn,
    houseIds: draft.scope === 'all' ? null : [...draft.houseIds],
    combinable: draft.combinable,
    priority: Number(draft.priority.trim()),
    active: draft.active,
    maxRedemptions: draft.limitOn ? Number(draft.maxRedemptions.trim()) : null,
  };
}

function effectFromDraft(draft: DiscountDraft): DiscountEffect {
  return draft.effectKind === 'percent'
    ? { kind: 'percent', percent: Number(draft.value.trim()) }
    : { kind: 'fixed', amountCents: centsFromEuroInput(draft.value) };
}

function conditionsFromDraft(draft: DiscountDraft): DiscountCondition[] {
  const conditions: DiscountCondition[] = [];
  if (draft.minNightsOn) {
    conditions.push({ kind: 'min_nights', nights: Number(draft.minNights.trim()) });
  }
  if (draft.leadOn) {
    conditions.push({
      kind: 'booking_lead_days',
      minDays: optionalWhole(draft.leadMin),
      maxDays: optionalWhole(draft.leadMax),
    });
  }
  if (draft.stayOn) {
    conditions.push({ kind: 'stay_dates', startDate: draft.stayStart, endDate: draft.stayEnd });
  }
  if (draft.windowOn) {
    conditions.push({ kind: 'booking_window', startDate: draft.windowStart, endDate: draft.windowEnd });
  }
  if (draft.weekdayOn) {
    conditions.push({ kind: 'weekday', days: [...draft.weekdays].sort((a, b): number => a - b) });
  }
  if (draft.promoOn) {
    conditions.push({ kind: 'promo_code', code: draft.promoCode.trim() });
  }
  return conditions;
}

/** Empty text means "no limit" (null); anything else is read as a number (maybe NaN, caught by validation). */
function optionalWhole(text: string): number | null {
  return text.trim() === '' ? null : Number(text.trim());
}

// --- Validation (mirrors the API rules; the API stays the final judge) ---

/**
 * Problems with the form, by area. Empty object means it can be saved.
 */
export function validateDraft(draft: DiscountDraft): DraftProblems {
  const problems: DraftProblems = {};
  const label = draft.label.trim();
  if (label === '') {
    problems.label = 'Give the discount a name, e.g. "Long stay"';
  } else if (label.length > MAX_LABEL_LENGTH) {
    problems.label = `At most ${String(MAX_LABEL_LENGTH)} characters`;
  }
  const valueProblem = validateValue(draft);
  if (valueProblem !== null) {
    problems.value = valueProblem;
  }
  if (draft.scope === 'chosen' && draft.houseIds.length === 0) {
    problems.houses = 'Choose at least one house, or apply the discount to all houses';
  }
  if (!draft.alwaysOn) {
    addConditionProblems(draft, problems);
  }
  const priority = Number(draft.priority.trim());
  if (draft.priority.trim() === '' || !Number.isInteger(priority) || priority < 0 || priority > MAX_PRIORITY) {
    problems.priority = `A whole number from 0 to ${String(MAX_PRIORITY)}`;
  }
  if (draft.limitOn) {
    const limit = Number(draft.maxRedemptions.trim());
    if (draft.maxRedemptions.trim() === '' || !Number.isInteger(limit) || limit < 1) {
      problems.limit = 'A whole number, 1 or more';
    }
  }
  return problems;
}

function validateValue(draft: DiscountDraft): string | null {
  if (draft.effectKind === 'percent') {
    const percent = Number(draft.value.trim());
    return draft.value.trim() !== '' && Number.isInteger(percent) && percent >= 1 && percent <= 100
      ? null
      : 'A whole number from 1 to 100';
  }
  return centsFromEuroInput(draft.value) >= 1 ? null : 'An amount above zero';
}

function addConditionProblems(draft: DiscountDraft, problems: DraftProblems): void {
  const anyCondition = draft.minNightsOn || draft.leadOn || draft.stayOn || draft.windowOn || draft.weekdayOn || draft.promoOn;
  if (!anyCondition) {
    problems.conditions = 'Add at least one condition, or tick "Always on"';
  }
  if (draft.minNightsOn) {
    const nights = Number(draft.minNights.trim());
    if (draft.minNights.trim() === '' || !Number.isInteger(nights) || nights < 1) {
      problems.minNights = 'A whole number, 1 or more';
    }
  }
  if (draft.leadOn) {
    const lead = leadProblem(draft.leadMin, draft.leadMax);
    if (lead !== null) {
      problems.lead = lead;
    }
  }
  if (draft.stayOn) {
    const stay = dateRangeProblem(draft.stayStart, draft.stayEnd);
    if (stay !== null) {
      problems.stay = stay;
    }
  }
  if (draft.windowOn) {
    const window = dateRangeProblem(draft.windowStart, draft.windowEnd);
    if (window !== null) {
      problems.window = window;
    }
  }
  if (draft.weekdayOn && draft.weekdays.length === 0) {
    problems.weekdays = 'Choose at least one weekday';
  }
  if (draft.promoOn && !PROMO_CODE_PATTERN.test(draft.promoCode.trim())) {
    problems.promo = '3 to 30 letters, numbers, dashes or underscores';
  }
}

function leadProblem(minText: string, maxText: string): string | null {
  const min = optionalWhole(minText);
  const max = optionalWhole(maxText);
  if (min === null && max === null) {
    return 'Set the earliest or the latest number of days before arrival';
  }
  const bad = (value: number | null): boolean => value !== null && (!Number.isInteger(value) || value < 0);
  if (bad(min) || bad(max)) {
    return 'Whole numbers, zero or more';
  }
  if (min !== null && max !== null && max < min) {
    return 'The latest cannot be less than the earliest';
  }
  return null;
}

function dateRangeProblem(start: string, end: string): string | null {
  if (start === '' || end === '') {
    return 'Choose both dates';
  }
  return end < start ? 'The end date cannot be before the start date' : null;
}

// --- Plain-language summaries for the list ---

/**
 * "10%" or "20,00 €".
 */
export function summarizeEffect(effect: DiscountEffect, currencyCode: string): string {
  return effect.kind === 'percent' ? `${String(effect.percent)}%` : formatCents(effect.amountCents, currencyCode);
}

/**
 * One condition in everyday words.
 */
export function summarizeCondition(condition: DiscountCondition): string {
  switch (condition.kind) {
    case 'min_nights':
      return `${String(condition.nights)}+ night${condition.nights === 1 ? '' : 's'}`;
    case 'booking_lead_days':
      return summarizeLead(condition.minDays, condition.maxDays);
    case 'stay_dates':
      return `stays ${formatIsoDate(condition.startDate)} to ${formatIsoDate(condition.endDate)}`;
    case 'booking_window':
      return `booked ${formatIsoDate(condition.startDate)} to ${formatIsoDate(condition.endDate)}`;
    case 'weekday':
      return `${[...condition.days]
        .sort((a, b): number => a - b)
        .map((day): string => WEEKDAY_NAMES[day] ?? String(day))
        .join(', ')} only`;
    case 'promo_code':
      return `code ${condition.code}`;
  }
}

function summarizeLead(minDays: number | null, maxDays: number | null): string {
  const days = (count: number): string => `${String(count)} day${count === 1 ? '' : 's'}`;
  if (minDays !== null && maxDays !== null) {
    return `booked ${String(minDays)} to ${days(maxDays)} ahead`;
  }
  if (minDays !== null) {
    return `booked ${String(minDays)}+ days ahead`;
  }
  if (maxDays !== null) {
    return `booked up to ${days(maxDays)} ahead`;
  }
  return 'booked any time';
}

/**
 * All conditions of a discount, or "Every stay" when it is always on.
 */
export function summarizeConditions(discount: Pick<Discount, 'conditions' | 'alwaysOn'>): string {
  if (discount.conditions.length === 0) {
    return discount.alwaysOn ? 'Every stay' : 'No conditions';
  }
  return discount.conditions.map(summarizeCondition).join('; ');
}

/**
 * "All houses" or the names of the chosen ones.
 */
export function summarizeScope(houseIds: readonly string[] | null, houses: readonly HouseSummary[]): string {
  if (houseIds === null) {
    return 'All houses';
  }
  const names = houses.filter((house): boolean => houseIds.includes(house.id)).map((house): string => house.name);
  return names.length === 0 ? 'No houses' : names.join(', ');
}

/**
 * "3 of 10 used", "3 used", or "Unlimited" when nothing has been used and there is no limit.
 */
export function summarizeUses(redemptions: number, maxRedemptions: number | null): string {
  if (maxRedemptions !== null) {
    return `${String(redemptions)} of ${String(maxRedemptions)} used`;
  }
  return redemptions === 0 ? 'Unlimited' : `${String(redemptions)} used`;
}
