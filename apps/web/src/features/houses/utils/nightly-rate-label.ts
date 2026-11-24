/**
 * @file apps/web/src/features/houses/utils/nightly-rate-label.ts
 * @feature houses
 * @dependencies money — formats the API's quote lines; no price math
 */

import type { Quote } from '@resort-booking/shared-types';
import { formatCents } from '@/shared/utils/money';

/** The label the API puts on nights that no seasonal period covers. */
export const STANDARD_RATE_LABEL = 'Standard rate';

/** The header's rate, in the parts the page draws (the rate itself gets the highlighter). */
export interface NightlyRateParts {
  /** Words before the rate: "Standard rate", or empty for a seasonal or mixed price. */
  lead: string;
  /** The highlighted rate, e.g. "416,00 € / night" or "320,00 € – 416,00 € / night". */
  rate: string;
  /** The season name when every night is in one named season, e.g. "Peak summer 2027". */
  season: string | null;
}

/**
 * What the stay header should say about the nightly price.
 *
 * - No usable quote (none yet, dates taken, nothing priced): the standard rate, as before.
 * - Every night at one rate: that rate, with the season's name unless it is the standard rate.
 * - Nights at several rates: the lowest to the highest rate.
 *
 * Only the API's `nightlyRateCents` and labels are formatted; nothing is calculated.
 */
export function nightlyRateParts(
  quote: Pick<Quote, 'lines' | 'available' | 'currencyCode'> | null,
  standard: { nightlyRateCents: number; currencyCode: string },
): NightlyRateParts {
  const fallback: NightlyRateParts = {
    lead: STANDARD_RATE_LABEL,
    rate: `${formatCents(standard.nightlyRateCents, standard.currencyCode)} / night`,
    season: null,
  };
  if (quote === null || !quote.available || quote.lines.length === 0) {
    return fallback;
  }
  const rates = quote.lines.map((line): number => line.nightlyRateCents);
  const lowest = Math.min(...rates);
  const highest = Math.max(...rates);
  const money = (cents: number): string => formatCents(cents, quote.currencyCode);
  if (lowest !== highest) {
    return { lead: '', rate: `${money(lowest)} – ${money(highest)} / night`, season: null };
  }
  const labels = new Set(quote.lines.map((line): string => line.label));
  const only = quote.lines[0]?.label ?? STANDARD_RATE_LABEL;
  if (labels.size === 1 && only === STANDARD_RATE_LABEL) {
    return { lead: STANDARD_RATE_LABEL, rate: `${money(lowest)} / night`, season: null };
  }
  // One rate; name the season only when exactly one named season produced it.
  const named = [...labels].filter((label): boolean => label !== STANDARD_RATE_LABEL);
  return { lead: '', rate: `${money(lowest)} / night`, season: named.length === 1 ? (named[0] ?? null) : null };
}
