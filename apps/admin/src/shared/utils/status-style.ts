/**
 * @file apps/admin/src/shared/utils/status-style.ts
 * @shared Which colour, icon and words each booking or refund status gets (display only)
 * @dependencies shared-types
 */

import type { RefundStatus, StaffReservation } from '@resort-booking/shared-types';

export type StatusTone = 'success' | 'warning' | 'error' | 'info' | 'default';

export type StatusIconKey =
  | 'booked'
  | 'in-house'
  | 'checked-out'
  | 'rebook'
  | 'hold'
  | 'cancelled'
  | 'expired'
  | 'refund-done'
  | 'refund-pending'
  | 'refund-failed';

export interface StatusStyle {
  label: string;
  tone: StatusTone;
  icon: StatusIconKey;
}

type StayStatusFields = Pick<StaffReservation, 'status' | 'arrivalStatus' | 'rebookOfId'>;

/**
 * Words, colour and icon for a booking or hold on the calendar and in day lists.
 * Colour is never the only signal: the label and the icon say the same thing.
 */
export function stayStatusStyle(stay: StayStatusFields): StatusStyle {
  const ended = stay.status === 'cancelled' || stay.status === 'released';
  if (stay.rebookOfId !== null && !ended) {
    return { label: 'Rebook', tone: 'info', icon: 'rebook' };
  }
  if (stay.status === 'confirmed') {
    if (stay.arrivalStatus === 'checked_in') {
      return { label: 'In-house', tone: 'success', icon: 'in-house' };
    }
    if (stay.arrivalStatus === 'checked_out') {
      return { label: 'Checked out', tone: 'default', icon: 'checked-out' };
    }
    return { label: 'Booked', tone: 'success', icon: 'booked' };
  }
  if (stay.status === 'active') {
    return { label: 'Hold', tone: 'warning', icon: 'hold' };
  }
  if (stay.status === 'cancelled') {
    return { label: 'Cancelled', tone: 'error', icon: 'cancelled' };
  }
  if (stay.status === 'released') {
    return { label: 'Released', tone: 'error', icon: 'cancelled' };
  }
  if (stay.status === 'expired') {
    return { label: 'Expired', tone: 'default', icon: 'expired' };
  }
  return { label: stay.status, tone: 'default', icon: 'expired' };
}

export type BookingFilterKey = 'confirmed' | 'awaiting_payment' | 'cancelled' | 'expired' | 'unpaid_at_hotel';

/**
 * Style for the four booking states the report groups bookings into, and the "Unpaid at hotel" filter on top of them.
 */
export function bookingFilterStyle(key: BookingFilterKey): StatusStyle {
  switch (key) {
    case 'confirmed':
      return { label: 'Confirmed', tone: 'success', icon: 'booked' };
    case 'awaiting_payment':
      return { label: 'Awaiting payment', tone: 'warning', icon: 'hold' };
    case 'cancelled':
      return { label: 'Cancelled', tone: 'error', icon: 'cancelled' };
    case 'expired':
      return { label: 'Expired', tone: 'default', icon: 'expired' };
    case 'unpaid_at_hotel':
      return { label: 'Unpaid at hotel', tone: 'warning', icon: 'hold' };
  }
}

/**
 * Style for a refund: done is green, pending amber, failed red.
 */
export function refundStyle(status: RefundStatus): StatusStyle {
  switch (status) {
    case 'succeeded':
      return { label: 'Done', tone: 'success', icon: 'refund-done' };
    case 'pending':
      return { label: 'Pending', tone: 'warning', icon: 'refund-pending' };
    case 'failed':
      return { label: 'Failed', tone: 'error', icon: 'refund-failed' };
  }
}
