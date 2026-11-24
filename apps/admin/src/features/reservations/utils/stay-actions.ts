/**
 * @file apps/admin/src/features/reservations/utils/stay-actions.ts
 * @feature reservations
 * @dependencies money — which staff actions a booking offers, and the confirmation messages
 */

import type { StaffCancelResult, StaffChangeResult, StaffRefund, StaffReservation } from '@resort-booking/shared-types';
import { formatCents } from '@/shared/utils/money';

/**
 * Staff can cancel a real, confirmed booking (not a hold, not one already cancelled).
 */
export function canCancelStay(stay: Pick<StaffReservation, 'kind' | 'status'>): boolean {
  return stay.kind === 'reservation' && stay.status === 'confirmed';
}

/**
 * Staff can change the dates of a confirmed booking that has not started: still expected, and the
 * check-in is today or later. (The API makes the final call.)
 */
export function canChangeStayDates(
  stay: Pick<StaffReservation, 'kind' | 'status' | 'arrivalStatus' | 'checkIn'>,
  todayIso: string,
): boolean {
  return canCancelStay(stay) && stay.arrivalStatus === 'expected' && stay.checkIn >= todayIso;
}

function refundSentence(refund: StaffRefund | null): string {
  if (refund === null || refund.amountCents === 0) {
    return 'no refund recorded';
  }
  return `refund of ${formatCents(refund.amountCents, refund.currencyCode)} recorded`;
}

function needsHandRefund(refund: StaffRefund | null): boolean {
  return refund !== null && refund.amountCents > 0 && refund.provider === 'manual' && refund.status === 'pending';
}

/**
 * The message after a staff cancellation. A refund that has to be sent by hand says where to find it.
 */
export function cancelNotice(result: StaffCancelResult): string {
  const base = `Booking cancelled, ${refundSentence(result.refund)}`;
  return needsHandRefund(result.refund) ? `${base}. This refund must be sent by hand, see Refunds` : base;
}

/**
 * The message after staff changed a guest's dates: the new reference, and any refund.
 */
export function changeNotice(result: StaffChangeResult): string {
  const base = `Dates changed. The new booking is ${result.reservation.reference}`;
  if (result.refund === null || result.refund.amountCents === 0) {
    return base;
  }
  const refund = `refund of ${formatCents(result.refund.amountCents, result.refund.currencyCode)} recorded`;
  return needsHandRefund(result.refund)
    ? `${base}, ${refund}. This refund must be sent by hand, see Refunds`
    : `${base}, ${refund}`;
}
