/**
 * @file apps/api/src/modules/reservations/staff-history.ts
 * @feature reservations
 * @dependencies shared-types, inventory.rules
 *
 * How staff see a booking's money and history: refunds, date changes, and who cancelled it. The SQL
 * and the mapping live here once, so the booking lists and the refund queue always agree.
 */

import type {
  ActionInitiator,
  RefundKind,
  RefundStatus,
  StaffBookingChange,
  StaffCancellation,
  StaffRefund,
} from '@resort-booking/shared-types';
import { referenceFor } from '../inventory/inventory.rules';

/** One refund joined with the booking, stay and property staff need to act on it. */
export interface StaffRefundRow {
  id: string;
  organization_id: string;
  inventory_block_id: string;
  property_name: string;
  stay_name: string;
  booker_name: string | null;
  booker_email: string | null;
  kind: RefundKind;
  amount_cents: number;
  percent: number;
  currency_code: string;
  status: RefundStatus;
  provider: string;
  failure_reason: string | null;
  reason: string;
  initiated_by: ActionInitiator;
  resolution_note: string | null;
  resolved_by_name: string | null;
  created_at: Date;
}

/**
 * The refund columns, joined with booking, stay, property and the staff member who resolved it. Add
 * a WHERE clause. One statement, however many refunds.
 */
export const STAFF_REFUND_SELECT = `
  SELECT r.id, r.organization_id, r.inventory_block_id, p.name AS property_name, h.name AS stay_name,
    ib.booker_name, ib.booker_email, r.kind, r.amount_cents, r.percent, r.currency_code,
    r.status, r.provider, r.failure_reason,
    COALESCE(r.reason_code, CASE r.kind WHEN 'rebook_difference' THEN 'dates_changed' ELSE 'guest_request' END) AS reason,
    r.initiated_by, r.resolution_note, su.full_name AS resolved_by_name, r.created_at
  FROM refunds r
  JOIN inventory_blocks ib ON ib.id = r.inventory_block_id
  JOIN houses h ON h.id = ib.house_id
  JOIN properties p ON p.id = r.property_id
  LEFT JOIN staff_users su ON su.id = r.resolved_by_staff_id
`;

/**
 * A refund row as the staff contract.
 */
export function mapStaffRefund(row: StaffRefundRow): StaffRefund {
  return {
    id: row.id,
    reservationId: row.inventory_block_id,
    reference: referenceFor(row.inventory_block_id),
    propertyName: row.property_name,
    stayName: row.stay_name,
    bookerName: row.booker_name ?? '',
    bookerEmail: row.booker_email ?? '',
    kind: row.kind,
    amountCents: row.amount_cents,
    percent: row.percent,
    currencyCode: row.currency_code,
    status: row.status,
    provider: row.provider,
    failureReason: row.failure_reason,
    reason: row.reason,
    initiatedBy: row.initiated_by,
    resolutionNote: row.resolution_note,
    resolvedByName: row.resolved_by_name,
    createdAt: row.created_at.toISOString(),
  };
}

/** One date change joined with the staff member who made it (if staff did). */
export interface StaffChangeRow {
  id: string;
  old_booking_id: string;
  new_booking_id: string;
  old_check_in: string;
  old_check_out: string;
  new_check_in: string;
  new_check_out: string;
  old_total_cents: number;
  new_total_cents: number;
  fee_cents: number;
  pay_cents: number;
  refund_cents: number;
  initiated_by: ActionInitiator;
  staff_name: string | null;
  note: string | null;
  created_at: Date;
}

/**
 * Every change that involves any of the given bookings (as the old or the new one), oldest first.
 * Takes the whole list of ids at once.
 */
export const STAFF_CHANGES_SELECT = `
  SELECT bc.id, bc.old_booking_id, bc.new_booking_id,
    bc.old_check_in::text AS old_check_in, bc.old_check_out::text AS old_check_out,
    bc.new_check_in::text AS new_check_in, bc.new_check_out::text AS new_check_out,
    bc.old_total_cents, bc.new_total_cents, bc.fee_cents, bc.pay_cents, bc.refund_cents,
    bc.initiated_by, su.full_name AS staff_name, bc.note, bc.created_at
  FROM booking_changes bc
  LEFT JOIN staff_users su ON su.id = bc.staff_user_id
  WHERE bc.old_booking_id = ANY($1::uuid[]) OR bc.new_booking_id = ANY($1::uuid[])
  ORDER BY bc.created_at ASC
`;

/**
 * A change row as the staff contract. The two references are worked out from the booking ids.
 */
export function mapStaffChange(row: StaffChangeRow): StaffBookingChange {
  return {
    id: row.id,
    fromReference: referenceFor(row.old_booking_id),
    toReference: referenceFor(row.new_booking_id),
    oldCheckIn: row.old_check_in,
    oldCheckOut: row.old_check_out,
    newCheckIn: row.new_check_in,
    newCheckOut: row.new_check_out,
    oldTotalCents: row.old_total_cents,
    newTotalCents: row.new_total_cents,
    feeCents: row.fee_cents,
    payCents: row.pay_cents,
    refundCents: row.refund_cents,
    initiatedBy: row.initiated_by,
    staffName: row.staff_name,
    note: row.note,
    createdAt: row.created_at.toISOString(),
  };
}

/** The booking columns that say who cancelled it and why. */
export interface CancellationColumns {
  status: string;
  cancelled_at: Date | null;
  created_at: Date;
  cancelled_by_staff_id: string | null;
  cancelled_by_name: string | null;
  cancel_reason: string | null;
  cancel_note: string | null;
}

/**
 * Who cancelled a booking and why, or null while it is not cancelled. Bookings cancelled before this
 * was recorded read as the guest's own request with no note.
 */
export function deriveCancellation(row: CancellationColumns): StaffCancellation | null {
  if (row.status !== 'cancelled') {
    return null;
  }
  return {
    initiatedBy: row.cancelled_by_staff_id === null ? 'guest' : 'staff',
    reason: row.cancel_reason ?? 'guest_request',
    note: row.cancel_note,
    staffName: row.cancelled_by_name,
    cancelledAt: (row.cancelled_at ?? row.created_at).toISOString(),
  };
}

/**
 * Groups items by booking id, keeping their order. Bookings with none simply have no entry.
 */
export function groupBy<T>(items: readonly T[], keysOf: (item: T) => readonly string[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    for (const key of keysOf(item)) {
      const list = grouped.get(key);
      if (list === undefined) {
        grouped.set(key, [item]);
      } else {
        list.push(item);
      }
    }
  }
  return grouped;
}
