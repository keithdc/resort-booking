/**
 * @file apps/web/src/shared/utils/offers.ts
 * @shared Display helpers for the offers the API advertises — no prices are calculated here
 * @dependencies shared-types
 */

import type { PromotedOffer } from '@resort-booking/shared-types';

const PROMO_PARAM_PATTERN = /^[A-Za-z0-9_-]{1,40}$/;

/**
 * The offers that apply to one stay: whole-property offers, plus ones that list this stay.
 */
export function offersForHouse(offers: readonly PromotedOffer[], houseId: string): PromotedOffer[] {
  return offers.filter((offer): boolean => offer.houseIds === null || offer.houseIds.includes(houseId));
}

/**
 * "Add 3 more nights to save 10%" for a long-stay offer the guest has not reached yet.
 *
 * Display arithmetic only: it names the percentage the API advertised and never a price. Only a
 * percentage offer whose sole condition is a minimum stay (and maybe a code) gets a hint, because
 * for any other offer more nights alone would not earn the saving. Nothing once the guest has
 * enough nights: the quote then shows the real discount line.
 */
export function nightsHint(offers: readonly PromotedOffer[], nights: number): string | null {
  let best: PromotedOffer | null = null;
  let bestGap = 0;
  for (const offer of offers) {
    if (offer.kind !== 'percent' || !offer.nightsOnly || offer.minNights === null || nights >= offer.minNights) {
      continue;
    }
    const gap = offer.minNights - nights;
    if (best === null || gap < bestGap || (gap === bestGap && offer.value > best.value)) {
      best = offer;
      bestGap = gap;
    }
  }
  if (best === null) {
    return null;
  }
  const saving = `Add ${String(bestGap)} more night${bestGap === 1 ? '' : 's'} to save ${String(best.value)}%`;
  return best.promoCode === null ? saving : `${saving} with code ${best.promoCode}`;
}

/**
 * The `?promo=CODE` of a link, only if it looks like a promo code. Anything else is ignored.
 */
export function parsePromoParam(raw: string | readonly string[] | undefined): string {
  const value = (typeof raw === 'string' ? raw : (raw?.[0] ?? '')).trim();
  return PROMO_PARAM_PATTERN.test(value) ? value : '';
}
