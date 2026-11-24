/**
 * @file apps/admin/src/shared/utils/booking-labels.ts
 * @shared Plain-language words for cancellations, refunds and date changes (display only)
 * @dependencies money
 */

import type {
  ActionInitiator,
  RefundKind,
  RefundStatus,
  StaffBookingChange,
  StaffCancellation,
  StaffRefund,
} from '@resort-booking/shared-types';
import { formatCents } from './money';

/**
 * Why a booking was cancelled or refunded, in words ("guest_request" -> "Guest asked").
 * An unknown code is shown readably instead of hidden.
 */
export function reasonLabel(reason: string): string {
  switch (reason) {
    case 'guest_request':
      return 'Guest asked';
    case 'property_cancelled':
      return 'We could not host';
    case 'goodwill':
      return 'Goodwill';
    case 'dates_changed':
      return 'Dates were changed';
    default: {
      const spaced = reason.replace(/_/g, ' ').trim();
      return spaced === '' ? 'Not recorded' : `${spaced.charAt(0).toUpperCase()}${spaced.slice(1)}`;
    }
  }
}

/**
 * The kind of refund, in words.
 */
export function refundKindLabel(kind: RefundKind): string {
  return kind === 'cancellation' ? 'Cancellation refund' : 'Date-change refund';
}

/**
 * Where a refund stands, in words.
 */
export function refundStatusLabel(status: RefundStatus): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'succeeded':
      return 'Done';
    case 'failed':
      return 'Failed';
  }
}

export type StatusColor = 'warning' | 'success' | 'error';

/**
 * Chip colour for a refund status: failed is red, pending amber, done green.
 */
export function refundStatusColor(status: RefundStatus): StatusColor {
  switch (status) {
    case 'pending':
      return 'warning';
    case 'succeeded':
      return 'success';
    case 'failed':
      return 'error';
  }
}

/**
 * "the guest" or "staff (Marie)". Staff without a recorded name are still shown as staff.
 */
export function initiatorLabel(initiatedBy: ActionInitiator, staffName: string | null): string {
  if (initiatedBy === 'guest') {
    return 'the guest';
  }
  return staffName === null || staffName.trim() === '' ? 'staff' : `staff (${staffName})`;
}

/**
 * One line about a cancellation: who, why.
 */
export function cancellationSummary(cancellation: StaffCancellation): string {
  return `Cancelled by ${initiatorLabel(cancellation.initiatedBy, cancellation.staffName)}: ${reasonLabel(cancellation.reason)}`;
}

/**
 * "10 Jul 2027 to 12 Jul 2027" style range for a change line, from ISO dates.
 */
export function dateRangeLabel(checkIn: string, checkOut: string): string {
  return `${checkIn} to ${checkOut}`;
}

/**
 * One line about a date change: old dates -> new dates, and what money moved.
 */
export function changeSummary(change: StaffBookingChange, currencyCode: string): string {
  const dates = `${dateRangeLabel(change.oldCheckIn, change.oldCheckOut)} → ${dateRangeLabel(change.newCheckIn, change.newCheckOut)}`;
  const money: string[] = [];
  if (change.feeCents > 0) {
    money.push(`fee ${formatCents(change.feeCents, currencyCode)}`);
  }
  if (change.payCents > 0) {
    money.push(`guest paid ${formatCents(change.payCents, currencyCode)} more`);
  }
  if (change.refundCents > 0) {
    money.push(`${formatCents(change.refundCents, currencyCode)} refunded`);
  }
  return money.length === 0 ? dates : `${dates} (${money.join(', ')})`;
}

/**
 * "Refunded by hand" details, or null when nobody resolved it by hand.
 */
export function resolvedByHandText(refund: Pick<StaffRefund, 'resolvedByName' | 'resolutionNote'>): string | null {
  if (refund.resolvedByName === null && refund.resolutionNote === null) {
    return null;
  }
  const who = refund.resolvedByName === null ? 'Staff' : refund.resolvedByName;
  return refund.resolutionNote === null ? `Marked as sent by ${who}` : `Marked as sent by ${who}: ${refund.resolutionNote}`;
}

/**
 * A refund can be retried through the provider when it failed, or is pending and not a hand refund.
 */
export function canRetryRefund(refund: Pick<StaffRefund, 'status' | 'provider'>): boolean {
  return refund.status === 'failed' || (refund.status === 'pending' && refund.provider !== 'manual');
}

/**
 * A refund can be marked as sent by hand until it is done.
 */
export function canMarkRefundPaid(refund: Pick<StaffRefund, 'status'>): boolean {
  return refund.status !== 'succeeded';
}

/**
 * Date and time for the staff record. Shown in UTC and labelled, so it reads the same everywhere.
 */
export function formatDateTime(isoDateTime: string): string {
  const date = new Date(isoDateTime);
  if (Number.isNaN(date.getTime())) {
    return isoDateTime;
  }
  const text = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(date);
  return `${text} UTC`;
}
