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
import { formatIsoDate, formatShortDate } from '@/shared/utils/format-date';
import { centsFromEuroInput, eurosInputFromCents, formatCents } from '@/shared/utils/money';

/** Shown for an automatic discount (no promo code): these never stack with each other. */
export const AUTOMATIC_NOTE = 'Automatic discounts do not stack with each other: the guest gets the best one.';

/** Switch label and help for a promo code (a coupon), which stacks after the best automatic discount. */
export const COUPON_STACK_LABEL = 'Can be used together with an automatic discount';
export const COUPON_STACK_HELP =
  'A coupon is applied after the best automatic discount, on what is left. Turn off to make it replace the automatic discount when it saves more.';

/** Help for the usage limit. */
export const LIMIT_LABEL = 'Limit how many bookings can use it';
export const LIMIT_HELP = 'When the limit is reached the discount stops being offered.';

/** The "How long does it run?" section: when guests can book with this discount. */
export const RUN_WINDOW_TITLE = 'How long does it run?';
export const RUN_WINDOW_HELP =
  'Guests can use it only when they book between these dates. Leave blank to run until you switch it off.';

/** The other date condition: which stay dates qualify (a season), not when the guest books. */
export const STAY_DATES_LABEL = 'Only for stays between these dates (the whole stay must fall inside)';
export const STAY_DATES_HELP =
  "Use this for a season (e.g. only July stays). To run a sale between two dates use 'How long does it run?' above.";

/** Priority is no longer shown or edited; a saved value is carried through, and new discounts get this. */
export const DEFAULT_PRIORITY = 100;

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
  /** The run window (both dates, or both empty): the days the guest can book with this discount. */
  windowStart: string;
  windowEnd: string;
  weekdayOn: boolean;
  weekdays: number[];
  promoOn: boolean;
  promoCode: string;
  /** Only for a promo code (a coupon): stack on top of the best automatic discount. */
  combinable: boolean;
  /** Not shown in the form: carried through so an old discount keeps its saved value. */
  priority: string;
  active: boolean;
  limitOn: boolean;
  maxRedemptions: string;
  /** Show the offer on the guest site. With a promo code this makes the code public. */
  promoted: boolean;
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
  windowStart: '',
  windowEnd: '',
  weekdayOn: false,
  weekdays: [],
  promoOn: false,
  promoCode: '',
  // New discounts stack with others by default: a code on top of a long-stay discount is the common case.
  combinable: true,
  priority: String(DEFAULT_PRIORITY),
  active: true,
  limitOn: false,
  maxRedemptions: '',
  promoted: false,
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
    promoted: discount.promoted,
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
  // Only a coupon has a stacking choice. Ticking "Promo code" on an automatic discount later starts with the default (stack).
  if (!draft.promoOn) {
    draft.combinable = true;
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
    conditions: conditionsFromDraft(draft),
    // "Always on" means no other condition: with a run window the discount is a window-only condition.
    alwaysOn: draft.alwaysOn && !hasRunWindow(draft),
    houseIds: draft.scope === 'all' ? null : [...draft.houseIds],
    // Automatic discounts never stack, so the flag is meaningless for them: save it as off.
    combinable: isCouponDraft(draft) && draft.combinable,
    priority: carriedPriority(draft.priority),
    active: draft.active,
    maxRedemptions: draft.limitOn ? Number(draft.maxRedemptions.trim()) : null,
    promoted: draft.promoted,
  };
}

/**
 * Is this form a coupon: a promo code discount (the guest types a code)?
 */
export function isCouponDraft(draft: Pick<DiscountDraft, 'promoOn' | 'alwaysOn'>): boolean {
  return draft.promoOn && !draft.alwaysOn;
}

/** A saved priority is passed through untouched; anything else becomes the default. */
function carriedPriority(raw: string): number {
  const priority = Number(raw.trim());
  return raw.trim() !== '' && Number.isInteger(priority) && priority >= 0 && priority <= MAX_PRIORITY ? priority : DEFAULT_PRIORITY;
}

function effectFromDraft(draft: DiscountDraft): DiscountEffect {
  return draft.effectKind === 'percent'
    ? { kind: 'percent', percent: Number(draft.value.trim()) }
    : { kind: 'fixed', amountCents: centsFromEuroInput(draft.value) };
}

/**
 * Is a run window being set (either date filled in)? Both are then required: see `validateDraft`.
 */
export function hasRunWindow(draft: Pick<DiscountDraft, 'windowStart' | 'windowEnd'>): boolean {
  return draft.windowStart !== '' || draft.windowEnd !== '';
}

function conditionsFromDraft(draft: DiscountDraft): DiscountCondition[] {
  const conditions: DiscountCondition[] = [];
  // The run window always applies, even on an "always on" discount; the other conditions do not.
  const runWindow: DiscountCondition[] = hasRunWindow(draft)
    ? [{ kind: 'booking_window', startDate: draft.windowStart, endDate: draft.windowEnd }]
    : [];
  if (draft.alwaysOn) {
    return runWindow;
  }
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
  conditions.push(...runWindow);
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
    problems.label = 'Give the discount a name, e.g. "Long booking"';
  } else if (label.length > MAX_LABEL_LENGTH) {
    problems.label = `At most ${String(MAX_LABEL_LENGTH)} characters`;
  }
  const valueProblem = validateValue(draft);
  if (valueProblem !== null) {
    problems.value = valueProblem;
  }
  if (draft.scope === 'chosen' && draft.houseIds.length === 0) {
    problems.houses = 'Choose at least one stay, or apply the discount to all stays';
  }
  if (hasRunWindow(draft)) {
    const window = dateRangeProblem(draft.windowStart, draft.windowEnd);
    if (window !== null) {
      problems.window = window;
    }
  }
  if (!draft.alwaysOn) {
    addConditionProblems(draft, problems);
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
  const anyCondition =
    draft.minNightsOn || draft.leadOn || draft.stayOn || hasRunWindow(draft) || draft.weekdayOn || draft.promoOn;
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
      return `Stays ${formatDateRange(condition.startDate, condition.endDate)}`;
    case 'booking_window':
      return `Book ${formatDateRange(condition.startDate, condition.endDate)}`;
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
    return `Book ${String(minDays)} to ${days(maxDays)} ahead`;
  }
  if (minDays !== null) {
    return `Book ${String(minDays)}+ days ahead`;
  }
  if (maxDays !== null) {
    return `Book up to ${days(maxDays)} ahead`;
  }
  return 'Book any time';
}

/**
 * "1 Dec – 31 Dec 2026" (the year once when both dates share it), "1 Dec 2026 – 31 Jan 2027" otherwise.
 */
export function formatDateRange(startIso: string, endIso: string): string {
  const sameYear = startIso.slice(0, 4) === endIso.slice(0, 4);
  return `${sameYear ? formatShortDate(startIso) : formatIsoDate(startIso)} – ${formatIsoDate(endIso)}`;
}

/**
 * All conditions of a discount, or "Every booking" when it is always on.
 */
export function summarizeConditions(discount: Pick<Discount, 'conditions' | 'alwaysOn'>): string {
  if (discount.conditions.length === 0) {
    return discount.alwaysOn ? 'Every booking' : 'No conditions';
  }
  return discount.conditions.map(summarizeCondition).join('; ');
}

/**
 * "All houses" or the names of the chosen ones.
 */
export function summarizeScope(houseIds: readonly string[] | null, houses: readonly HouseSummary[]): string {
  if (houseIds === null) {
    return 'All stays';
  }
  const names = houses.filter((house): boolean => houseIds.includes(house.id)).map((house): string => house.name);
  return names.length === 0 ? 'No stays' : names.join(', ');
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

/**
 * Has the discount run out of uses? Then guests no longer get it and it is no longer offered.
 */
export function isUsedUp(redemptions: number, maxRedemptions: number | null): boolean {
  return maxRedemptions !== null && redemptions >= maxRedemptions;
}

/**
 * How a discount combines, for the list: an automatic discount competes for "best", a coupon stacks (or replaces).
 */
export function summarizeStacking(discount: Pick<Discount, 'conditions' | 'combinable'>): string {
  const isCoupon = discount.conditions.some((condition): boolean => condition.kind === 'promo_code');
  if (!isCoupon) {
    return 'Automatic: the best one applies';
  }
  return discount.combinable ? 'Coupon: stacks after the automatic discount' : 'Coupon: replaces the automatic discount when better';
}

// --- Is a discount live, waiting, over or off? ---

export type DiscountStatusKind = 'off' | 'used_up' | 'ended' | 'starts' | 'live';

export interface DiscountStatus {
  kind: DiscountStatusKind;
  /** "Off", "Used up", "Ended", "Starts 1 Dec" or "Live". */
  label: string;
}

/**
 * The one status shown per row. Precedence: switched off, used up, ended, starts later, live. "Ended" means the
 * run window is over or every qualifying stay date has passed; "Starts" means the run window has not opened yet.
 * `today` is the local calendar date (YYYY-MM-DD), passed in so this stays pure.
 */
export function discountStatus(
  discount: Pick<Discount, 'active' | 'redemptions' | 'maxRedemptions' | 'conditions'>,
  today: string,
): DiscountStatus {
  if (!discount.active) {
    return { kind: 'off', label: 'Off' };
  }
  if (isUsedUp(discount.redemptions, discount.maxRedemptions)) {
    return { kind: 'used_up', label: 'Used up' };
  }
  const windows = discount.conditions.flatMap((condition): { start: string; end: string }[] =>
    condition.kind === 'booking_window' ? [{ start: condition.startDate, end: condition.endDate }] : [],
  );
  const start = windows.map((window): string => window.start).sort().pop() ?? null;
  const end = windows.map((window): string => window.end).sort()[0] ?? null;
  const staysOver = discount.conditions.some((condition): boolean => condition.kind === 'stay_dates' && condition.endDate < today);
  if ((end !== null && end < today) || staysOver) {
    return { kind: 'ended', label: 'Ended' };
  }
  if (start !== null && start > today) {
    const sameYear = start.slice(0, 4) === today.slice(0, 4);
    return { kind: 'starts', label: `Starts ${sameYear ? formatShortDate(start) : formatIsoDate(start)}` };
  }
  return { kind: 'live', label: 'Live' };
}

// --- What the run window means, in plain English, while the form is being filled in ---

export interface RunWindowNotes {
  /** "Guests who book from 1 Dec 2026 to 31 Dec 2026 get this discount." Null until both dates are valid. */
  summary: string | null;
  /** "Only for stays between 1 Jul 2026 and 31 Aug 2026." When the stay-dates condition is set. */
  stayNote: string | null;
  /** A calm heads-up when the window has not started, or is already over. */
  notice: { severity: 'info' | 'warning'; text: string } | null;
}

/**
 * Plain-English reading of the two date settings. `today` is the local calendar date (YYYY-MM-DD).
 */
export function describeRunWindow(draft: DiscountDraft, today: string): RunWindowNotes {
  const windowOk = hasRunWindow(draft) && dateRangeProblem(draft.windowStart, draft.windowEnd) === null;
  const stayOk = draft.stayOn && !draft.alwaysOn && dateRangeProblem(draft.stayStart, draft.stayEnd) === null;
  const summary = windowOk
    ? `Guests who book from ${formatIsoDate(draft.windowStart)} to ${formatIsoDate(draft.windowEnd)} get this discount.`
    : null;
  const stayNote = stayOk
    ? `Only for stays between ${formatIsoDate(draft.stayStart)} and ${formatIsoDate(draft.stayEnd)}.`
    : null;
  let notice: RunWindowNotes['notice'] = null;
  if (windowOk && draft.windowStart > today) {
    const days = daysBetweenIso(today, draft.windowStart);
    notice = {
      severity: 'info',
      text: `Starts in ${String(days)} day${days === 1 ? '' : 's'}: until then guests do not see or get this discount.`,
    };
  } else if (windowOk && draft.windowEnd < today) {
    notice = { severity: 'warning', text: 'This window has already ended: guests no longer get this discount.' };
  }
  return { summary, stayNote, notice };
}

function daysBetweenIso(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}
