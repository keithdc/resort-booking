/**
 * @file apps/api/src/modules/rates/rates.rules.ts
 * @feature rates
 * @dependencies shared-types, iso-date
 */

import type { QuoteLine, RatePeriod, RatePeriodConflict, RatePeriodWrite } from '@resort-booking/shared-types';
import { addDaysIso, isValidIsoDate } from '../../shared/dates/iso-date';

export const STANDARD_RATE_LABEL = 'Standard rate';
export const MAX_RATE_LABEL_LENGTH = 80;
/** Safety cap so a bad date range can never build an unbounded list of nights. */
export const MAX_PRICED_NIGHTS = 366;

export interface PricedStay {
  lines: QuoteLine[];
  totalCents: number;
}

/** The part of a period that pricing needs. */
export type PricingPeriod = Pick<RatePeriod, 'label' | 'startDate' | 'endDate' | 'nightlyRateCents'>;

/**
 * Each night of a stay: check-in through the night before check-out.
 * Returns an empty list for an invalid or inverted range, or one over the safety cap.
 */
export function stayNights(checkIn: string, checkOut: string): string[] {
  if (!isValidIsoDate(checkIn) || !isValidIsoDate(checkOut) || checkOut <= checkIn) {
    return [];
  }
  const nights: string[] = [];
  for (let night = checkIn; night < checkOut; night = addDaysIso(night, 1)) {
    nights.push(night);
    if (nights.length > MAX_PRICED_NIGHTS) {
      return [];
    }
  }
  return nights;
}

/**
 * Prices a stay night by night. A night takes the rate of the period that contains it,
 * otherwise the standard rate. Consecutive nights at the same period collapse into one line,
 * so a stay crossing into peak season shows "2 x 180, 3 x 260". Total is the sum of nights.
 */
export function priceStay(
  nights: readonly string[],
  standardRateCents: number,
  periods: readonly PricingPeriod[],
): PricedStay {
  if (nights.length === 0 || !isMoney(standardRateCents)) {
    return { lines: [], totalCents: 0 };
  }
  const lines: QuoteLine[] = [];
  let currentPeriod: PricingPeriod | null | undefined;
  for (const night of nights) {
    const period = periods.find((candidate): boolean => candidate.startDate <= night && night <= candidate.endDate) ?? null;
    const rate = period === null ? standardRateCents : period.nightlyRateCents;
    const last = lines[lines.length - 1];
    if (last !== undefined && period === currentPeriod) {
      last.nights += 1;
      last.subtotalCents += rate;
    } else {
      lines.push({
        label: period === null ? STANDARD_RATE_LABEL : period.label,
        nights: 1,
        nightlyRateCents: rate,
        subtotalCents: rate,
      });
      currentPeriod = period;
    }
  }
  return { lines, totalCents: lines.reduce((sum, line): number => sum + line.subtotalCents, 0) };
}

/**
 * The first period that shares a night with the candidate range, or null. Ranges are inclusive,
 * so two periods touching on the same night conflict; back-to-back ranges do not.
 */
export function findPeriodConflict(
  periods: readonly RatePeriod[],
  candidate: Pick<RatePeriodWrite, 'startDate' | 'endDate'>,
  exceptId: string | null,
): RatePeriodConflict | null {
  const hit = periods.find(
    (period): boolean =>
      period.id !== exceptId && period.startDate <= candidate.endDate && candidate.startDate <= period.endDate,
  );
  return hit === undefined ? null : { label: hit.label, startDate: hit.startDate, endDate: hit.endDate };
}

/**
 * Human-readable problem with a period, or null when it is valid.
 */
export function validatePeriodWrite(input: RatePeriodWrite): string | null {
  if (input.label.trim() === '') {
    return 'Give the period a name, e.g. "Peak summer"';
  }
  if (input.label.trim().length > MAX_RATE_LABEL_LENGTH) {
    return `The name can be at most ${String(MAX_RATE_LABEL_LENGTH)} characters`;
  }
  if (!isValidIsoDate(input.startDate) || !isValidIsoDate(input.endDate)) {
    return 'Dates must be real calendar dates';
  }
  if (input.endDate < input.startDate) {
    return 'The last night cannot be before the first night';
  }
  if (!isMoney(input.nightlyRateCents)) {
    return 'The nightly rate must be zero or more';
  }
  return null;
}

/**
 * Message naming the clashing period so staff can fix it without guessing.
 */
export function describeConflict(conflict: RatePeriodConflict): string {
  return `These dates overlap "${conflict.label}" (${conflict.startDate} to ${conflict.endDate}). Change one of the two ranges.`;
}

function isMoney(cents: number): boolean {
  return Number.isInteger(cents) && cents >= 0;
}
