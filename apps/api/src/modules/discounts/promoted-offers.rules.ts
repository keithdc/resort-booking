/**
 * @file apps/api/src/modules/discounts/promoted-offers.rules.ts
 * @feature discounts
 * @dependencies shared-types
 *
 * Turns the discounts staff chose to advertise into the public offer list. Pure: no I/O.
 */

import type { Discount, DiscountCondition, HouseSummary, PromotedOffer } from '@resort-booking/shared-types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * The promo code a discount needs, or null for an automatic discount.
 */
export function promoCodeOf(conditions: readonly DiscountCondition[]): string | null {
  for (const condition of conditions) {
    if (condition.kind === 'promo_code') {
      return condition.code;
    }
  }
  return null;
}

/**
 * "3 Dec 2026" from YYYY-MM-DD.
 */
export function formatOfferDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return `${String(day)} ${MONTHS[(month ?? 1) - 1] ?? ''} ${String(year)}`;
}

/**
 * "50 €" or "50,50 €": fixed amounts in the guest site's style (whole amounts without decimals).
 */
export function formatOfferMoney(amountCents: number, currencyCode: string): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: amountCents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amountCents / 100);
}

function plural(count: number, word: string): string {
  return `${String(count)} ${word}${count === 1 ? '' : 's'}`;
}

function joinWords(parts: readonly string[]): string {
  if (parts.length <= 1) {
    return parts[0] ?? '';
  }
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1] ?? ''}`;
}

function weekdayPhrase(days: readonly number[]): string | null {
  if (new Set(days).size >= 7) {
    return null;
  }
  const names = [...days].sort((a, b): number => a - b).map((day): string => WEEKDAYS[day] ?? '');
  return `only on ${joinWords(names)} nights`;
}

function leadPhrase(minDays: number | null, maxDays: number | null): string | null {
  const min = minDays !== null && minDays > 0 ? minDays : null;
  if (min !== null && maxDays !== null) {
    return `${String(min)} to ${plural(maxDays, 'day')} before arrival`;
  }
  if (min !== null) {
    return `at least ${plural(min, 'day')} before arrival`;
  }
  if (maxDays !== null) {
    return `within ${plural(maxDays, 'day')} of arrival`;
  }
  return null;
}

/**
 * Plain-English "when" clause from the conditions, e.g. "when you stay 7 or more nights and book by 31 Aug 2026".
 * Empty string when the discount has no conditions (it applies to every stay).
 */
export function describeConditions(conditions: readonly DiscountCondition[]): string {
  const stay: string[] = [];
  const book: string[] = [];
  for (const condition of conditions) {
    switch (condition.kind) {
      case 'min_nights':
        if (condition.nights > 1) {
          stay.push(`${String(condition.nights)} or more nights`);
        }
        break;
      case 'stay_dates':
        stay.push(`between ${formatOfferDate(condition.startDate)} and ${formatOfferDate(condition.endDate)}`);
        break;
      case 'weekday': {
        const phrase = weekdayPhrase(condition.days);
        if (phrase !== null) {
          stay.push(phrase);
        }
        break;
      }
      case 'booking_lead_days': {
        const phrase = leadPhrase(condition.minDays, condition.maxDays);
        if (phrase !== null) {
          book.push(phrase);
        }
        break;
      }
      case 'booking_window':
        book.push(`by ${formatOfferDate(condition.endDate)}`);
        break;
      case 'promo_code':
        break;
    }
  }
  const clauses: string[] = [];
  if (stay.length > 0) {
    clauses.push(`stay ${joinWords(stay)}`);
  }
  if (book.length > 0) {
    clauses.push(`book ${joinWords(book)}`);
  }
  return clauses.length === 0 ? '' : `when you ${clauses.join(' and ')}`;
}

/**
 * "Save 10% when you stay 7 or more nights", or for a code "Use code WELCOME10 for 10% off".
 */
export function offerHeadline(discount: Discount, currencyCode: string): string {
  const amount =
    discount.effect.kind === 'percent'
      ? `${String(discount.effect.percent)}%`
      : formatOfferMoney(discount.effect.amountCents, currencyCode);
  const code = promoCodeOf(discount.conditions);
  const saving = code === null ? `Save ${amount}` : `Use code ${code.trim().toUpperCase()} for ${amount} off`;
  const when = describeConditions(discount.conditions);
  return when === '' ? saving : `${saving} ${when}`;
}

/**
 * Can a guest still use this discount today? Same facts the quote uses: switched on, not used up,
 * the booking window open, the stay dates not already over.
 */
function isOpenToday(discount: Discount, today: string): boolean {
  if (!discount.active) {
    return false;
  }
  if (discount.maxRedemptions !== null && discount.redemptions >= discount.maxRedemptions) {
    return false;
  }
  return discount.conditions.every((condition): boolean => {
    if (condition.kind === 'booking_window') {
      return condition.startDate <= today && today <= condition.endDate;
    }
    if (condition.kind === 'stay_dates') {
      return condition.endDate >= today;
    }
    return true;
  });
}

/**
 * The days a guest can book it: the overlap of any booking windows (usually just one).
 */
function bookingWindowOf(conditions: readonly DiscountCondition[]): { from: string | null; to: string | null } {
  const starts: string[] = [];
  const ends: string[] = [];
  for (const condition of conditions) {
    if (condition.kind === 'booking_window') {
      starts.push(condition.startDate);
      ends.push(condition.endDate);
    }
  }
  return { from: starts.sort().pop() ?? null, to: ends.sort()[0] ?? null };
}

/**
 * The offers to show guests: advertised (staff opted in), still usable today, and on at least one published stay.
 * Only an advertised discount ever exposes its promo code. Never carries priority or stacking rules.
 */
export function buildPromotedOffers(
  discounts: readonly Discount[],
  houses: readonly HouseSummary[],
  today: string,
): PromotedOffer[] {
  const offers: PromotedOffer[] = [];
  for (const discount of discounts) {
    if (!discount.promoted || !isOpenToday(discount, today)) {
      continue;
    }
    const promoCode = promoCodeOf(discount.conditions);
    if (discount.conditions.length === 0 && !discount.alwaysOn) {
      continue;
    }
    const inScope =
      discount.houseIds === null
        ? houses
        : houses.filter((house): boolean => discount.houseIds?.includes(house.id) ?? false);
    const first = inScope[0];
    if (first === undefined) {
      continue;
    }
    const minNights = discount.conditions.reduce<number | null>(
      (best, condition): number | null =>
        condition.kind === 'min_nights' ? Math.max(best ?? 0, condition.nights) : best,
      null,
    );
    const window = bookingWindowOf(discount.conditions);
    offers.push({
      id: discount.id,
      name: discount.label,
      kind: discount.effect.kind,
      value: discount.effect.kind === 'percent' ? discount.effect.percent : discount.effect.amountCents,
      currencyCode: discount.effect.kind === 'fixed' ? first.currencyCode : null,
      minNights,
      nightsOnly:
        minNights !== null &&
        discount.conditions.filter((condition): boolean => condition.kind !== 'promo_code').length === 1,
      promoCode: promoCode === null ? null : promoCode.trim().toUpperCase(),
      houseIds: discount.houseIds === null ? null : inScope.map((house): string => house.id),
      validFrom: window.from,
      validTo: window.to,
      headline: offerHeadline(discount, first.currencyCode),
    });
  }
  return offers;
}
