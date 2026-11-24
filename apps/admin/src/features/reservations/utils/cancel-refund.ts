/**
 * @file apps/admin/src/features/reservations/utils/cancel-refund.ts
 * @feature reservations
 * @dependencies money — what each cancel reason refunds, for the staff form (the API still decides)
 */

import type { StaffCancelPreview, StaffCancelReason } from '@resort-booking/shared-types';
import { formatCents, parseEurosToCents } from '@/shared/utils/money';
import { MAX_NOTE_LENGTH, MIN_NOTE_LENGTH, noteProblem } from '@/shared/utils/record-note';

// The note rule is shared with the refund screens.
export { MAX_NOTE_LENGTH, MIN_NOTE_LENGTH, noteProblem };

/**
 * True for one of the three reasons staff can pick (narrows a radio button's text value).
 */
export function isCancelReason(value: string): value is StaffCancelReason {
  return value === 'guest_request' || value === 'property_cancelled' || value === 'goodwill';
}

export interface ChosenRefund {
  /** The refund this choice means, or null when the goodwill amount is not valid yet. */
  cents: number | null;
  /** What is wrong with the goodwill amount, else null. */
  error: string | null;
}

/**
 * The refund each reason means: the saved policy's refund, everything paid, or the amount staff
 * typed (which must be a real euro amount from 0 up to what was paid).
 */
export function chosenRefund(reason: StaffCancelReason, preview: StaffCancelPreview, goodwillEuros: string): ChosenRefund {
  if (reason === 'guest_request') {
    return { cents: preview.policyRefund?.refundCents ?? 0, error: null };
  }
  if (reason === 'property_cancelled') {
    return { cents: preview.paidCents, error: null };
  }
  const cents = parseEurosToCents(goodwillEuros);
  if (cents === null) {
    return { cents: null, error: 'Enter an amount in euros, like 50 or 49,90' };
  }
  if (cents > preview.paidCents) {
    return { cents: null, error: `The guest paid ${formatCents(preview.paidCents, preview.currencyCode)}; you cannot refund more` };
  }
  return { cents, error: null };
}

/**
 * The confirm button says exactly what will happen.
 */
export function confirmCancelLabel(refundCents: number | null, currencyCode: string): string {
  if (refundCents === null) {
    return 'Cancel booking';
  }
  return refundCents > 0 ? `Cancel and refund ${formatCents(refundCents, currencyCode)}` : 'Cancel with no refund';
}
