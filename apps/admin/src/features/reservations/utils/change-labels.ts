/**
 * @file apps/admin/src/features/reservations/utils/change-labels.ts
 * @feature reservations
 * @dependencies money — words the API's quote for staff; no price math
 */

import type { RebookQuote } from '@resort-booking/shared-types';
import { formatCents } from '@/shared/utils/money';

export type StaffBalanceKind = 'pay' | 'refund' | 'even';

type Amounts = Pick<RebookQuote, 'payCents' | 'refundCents' | 'currencyCode'>;

/**
 * Which way money moves for this change, from the amounts the API computed.
 */
export function staffBalanceKind(quote: Pick<RebookQuote, 'payCents' | 'refundCents'>): StaffBalanceKind {
  if (quote.payCents > 0) {
    return 'pay';
  }
  return quote.refundCents > 0 ? 'refund' : 'even';
}

/**
 * One sentence about what the change means for the guest's money.
 */
export function staffBalanceStatement(quote: Amounts): string {
  switch (staffBalanceKind(quote)) {
    case 'pay':
      return `The guest owes ${formatCents(quote.payCents, quote.currencyCode)} more`;
    case 'refund':
      return `The guest gets ${formatCents(quote.refundCents, quote.currencyCode)} back`;
    case 'even':
      return 'Nothing more to pay and nothing to refund';
  }
}

/**
 * The checkbox text staff must tick when the guest owes money, naming the exact amount.
 */
export function outsidePaymentLabel(quote: Pick<RebookQuote, 'payCents' | 'currencyCode'>): string {
  return `The guest has paid the difference of ${formatCents(quote.payCents, quote.currencyCode)} outside the system (cash or bank)`;
}

/**
 * The confirm button says exactly what will happen.
 */
export function confirmChangeLabel(quote: Amounts): string {
  switch (staffBalanceKind(quote)) {
    case 'pay':
      return `Change dates (guest paid ${formatCents(quote.payCents, quote.currencyCode)})`;
    case 'refund':
      return `Change dates and refund ${formatCents(quote.refundCents, quote.currencyCode)}`;
    case 'even':
      return 'Change dates';
  }
}

/**
 * The carried-over extras as one line, e.g. "Extras carried over: Breakfast × 2, Private dinner (on request)".
 * Null when the booking has none. Names and quantities only; the amount is shown beside it.
 */
export function extrasCarriedLabel(extras: RebookQuote['extras']): string | null {
  if (extras.length === 0) {
    return null;
  }
  const parts = extras.map((extra): string => {
    const name = extra.quantity > 1 ? `${extra.name} × ${String(extra.quantity)}` : extra.name;
    return extra.kind === 'on_request' ? `${name} (on request)` : name;
  });
  return `Extras carried over: ${parts.join(', ')}`;
}
