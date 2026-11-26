/**
 * @file apps/api/src/modules/extras/booking-extras.ts
 * @feature extras
 * @dependencies shared-types
 *
 * Extras chosen on a booking (table `reservation_extras`, migration 041): the columns staff and guests read, how a
 * row becomes a `BookingExtra`, and the pure pricing rules for a list of choices. No database here.
 */

import type {
  BookingExtra,
  BookingExtraStatus,
  ExtraService,
  ExtraServiceKind,
  StaffBookingExtraChoice,
  StaffQuoteExtraLine,
} from '@resort-booking/shared-types';

/** At most this many different extras on one booking, and this many of each. */
export const MAX_EXTRAS_PER_BOOKING = 10;
export const MAX_EXTRA_QUANTITY = 20;

/** One `reservation_extras` row as read for display. */
export interface BookingExtraRow {
  id: string;
  extra_service_id: string | null;
  name: string;
  kind: ExtraServiceKind;
  quantity: number;
  unit_price_cents: number;
  line_cents: number;
  currency_code: string;
  status: BookingExtraStatus;
}

/** The columns of {@link BookingExtraRow}. Add `FROM reservation_extras WHERE ...`. */
export const BOOKING_EXTRA_COLUMNS = 'id, extra_service_id, name, kind, quantity, unit_price_cents, line_cents, currency_code, status';

export function mapBookingExtra(row: BookingExtraRow): BookingExtra {
  return {
    id: row.id,
    extraServiceId: row.extra_service_id,
    name: row.name,
    kind: row.kind,
    quantity: row.quantity,
    unitPriceCents: row.unit_price_cents,
    lineCents: row.line_cents,
    currencyCode: row.currency_code,
    status: row.status,
  };
}

/** Why a list of choices cannot be priced. */
export type ExtraChoiceProblem =
  | { code: 'DUPLICATE_EXTRA'; message: string }
  | { code: 'EXTRA_NOT_FOUND'; message: string }
  | { code: 'EXTRA_CURRENCY_MISMATCH'; message: string };

export type PricedExtras = { ok: true; lines: StaffQuoteExtraLine[]; extrasCents: number } | { ok: false; problem: ExtraChoiceProblem };

/**
 * Prices the chosen extras against what the property offers. `offered` must already be limited to the property's
 * PUBLISHED extras (another property's or organization's extra is simply not in it, so it is "not found", exactly like
 * an id that does not exist). An instant extra adds price x quantity to the total; an on-request one adds nothing.
 * Two choices of the same extra, or a priced extra in another currency than the stay, are refused.
 */
export function priceExtras(offered: readonly ExtraService[], choices: readonly StaffBookingExtraChoice[], currencyCode: string): PricedExtras {
  const byId = new Map(offered.map((extra): [string, ExtraService] => [extra.id, extra]));
  const seen = new Set<string>();
  const lines: StaffQuoteExtraLine[] = [];
  let extrasCents = 0;
  for (const choice of choices) {
    if (seen.has(choice.extraId)) {
      return { ok: false, problem: { code: 'DUPLICATE_EXTRA', message: 'Each extra can be chosen once: change its quantity instead' } };
    }
    seen.add(choice.extraId);
    const extra = byId.get(choice.extraId);
    if (extra === undefined) {
      return { ok: false, problem: { code: 'EXTRA_NOT_FOUND', message: 'That extra is not offered for this stay' } };
    }
    if (extra.kind === 'instant' && extra.priceCents > 0 && extra.currencyCode !== currencyCode) {
      return {
        ok: false,
        problem: { code: 'EXTRA_CURRENCY_MISMATCH', message: `${extra.name} is priced in ${extra.currencyCode} but this stay is in ${currencyCode}` },
      };
    }
    const lineCents = extra.kind === 'instant' ? extra.priceCents * choice.quantity : 0;
    extrasCents += lineCents;
    lines.push({
      extraId: extra.id,
      name: extra.name,
      kind: extra.kind,
      quantity: choice.quantity,
      unitPriceCents: extra.priceCents,
      lineCents,
      currencyCode: extra.currencyCode,
    });
  }
  return { ok: true, lines, extrasCents };
}
