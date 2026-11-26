/**
 * @file apps/web/src/features/bookings/utils/rebook-labels.ts
 * @feature bookings
 * @dependencies money — words the API's quote; no price math
 */

import type { RebookQuote } from '@resort-booking/shared-types';
import { formatCents } from '@/shared/utils/money';

export type BalanceKind = 'pay' | 'refund' | 'even';

/**
 * Which way money moves for this change, from the amounts the API computed.
 */
export function balanceKind(quote: Pick<RebookQuote, 'payCents' | 'refundCents'>): BalanceKind {
  if (quote.payCents > 0) {
    return 'pay';
  }
  return quote.refundCents > 0 ? 'refund' : 'even';
}

/**
 * The one sentence that says what the change means for the guest's wallet.
 */
export function balanceStatement(quote: Pick<RebookQuote, 'payCents' | 'refundCents' | 'currencyCode'>): string {
  switch (balanceKind(quote)) {
    case 'pay':
      return `You pay ${formatCents(quote.payCents, quote.currencyCode)} more`;
    case 'refund':
      return `You get ${formatCents(quote.refundCents, quote.currencyCode)} back`;
    case 'even':
      return 'Nothing more to pay and nothing to refund';
  }
}

/**
 * The confirm button says exactly what will happen, so nobody clicks it blind.
 */
export function confirmLabel(quote: Pick<RebookQuote, 'payCents' | 'refundCents' | 'currencyCode'>): string {
  switch (balanceKind(quote)) {
    case 'pay':
      return `Pay ${formatCents(quote.payCents, quote.currencyCode)} and change my dates`;
    case 'refund':
      return `Change my dates and get ${formatCents(quote.refundCents, quote.currencyCode)} back`;
    case 'even':
      return 'Change my dates';
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
