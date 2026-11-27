/**
 * @file apps/api/src/modules/bookings/staff-audit-details.ts
 * @feature bookings
 * @dependencies audit types, inventory.rules
 * What the audit row of each staff money action records: who did it (id comes from the row, name and role here), the
 * booking reference, the refund amount and reason. Numbers, ids, names and flags only: never a note, an email, a
 * password, a token or a bank detail.
 */

import type { AuditDetailsInput } from '../../shared/audit/audited.decorator';
import type { AuditMetadata } from '../../shared/audit/audit.types';
import type { StaffAccount } from '../../shared/roles/staff-role';
import { referenceFor } from '../inventory/inventory.rules';

/** The `data` object of an `{ status: "ok", data }` answer, or null. */
function dataOf(result: unknown): Record<string, unknown> | null {
  if (typeof result !== 'object' || result === null || !('data' in result)) {
    return null;
  }
  const data: unknown = result.data;
  return typeof data === 'object' && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
}

function field(source: unknown, key: string): unknown {
  return typeof source === 'object' && source !== null && key in source ? (source as Record<string, unknown>)[key] : undefined;
}

function text(value: unknown): string | null {
  return typeof value === 'string' ? value.slice(0, 80) : null;
}

function whole(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Who acted: name and role (the id is the row's own staff_user_id), and whether money access came from the permission. */
export function actorFacts(staff: StaffAccount): AuditMetadata {
  return {
    actorName: staff.fullName.slice(0, 120),
    actorRole: staff.role,
    viaRefundAccess: staff.role !== 'admin' && staff.canManageRefunds,
  };
}

function actor({ staff }: AuditDetailsInput): AuditMetadata {
  return actorFacts(staff);
}

/** The refund that came back with the answer: amount, percent, reason, status, and the booking's own reference. */
function refundFacts(refund: unknown): AuditMetadata {
  if (typeof refund !== 'object' || refund === null) {
    return { refundCents: 0, refundIssued: false };
  }
  return {
    refundIssued: true,
    refundCents: whole(field(refund, 'amountCents')),
    refundPercent: whole(field(refund, 'percent')),
    refundReason: text(field(refund, 'reason')),
    refundStatus: text(field(refund, 'status')),
    refundCurrency: text(field(refund, 'currencyCode')),
  };
}

/**
 * Staff cancelled a booking, built from what the cancel decided (the refund as planned when the booking was cancelled):
 * the booking reference, the reason and the refund amount. Written inside the cancel's own transaction (docs/13 R6-05).
 * The refund's status here is the planned one; the refund list shows how it ended.
 */
export function cancelAuditMetadata(
  staff: StaffAccount,
  bookingId: string,
  reason: string,
  refund: { amountCents: number; percent: number; reason: string; status: string; currencyCode: string } | null,
): AuditMetadata {
  return {
    ...actorFacts(staff),
    bookingReference: referenceFor(bookingId),
    reason: reason.slice(0, 80),
    ...refundFacts(refund),
  };
}

/**
 * Staff moved a booking's dates: old and new reference, the fee and settlement decisions, and any refund. Built from what
 * the swap knows inside its own transaction (docs/13 R6-05); the refund's status is the planned one.
 */
export function changeDatesAuditMetadata(
  staff: StaffAccount,
  oldBookingId: string,
  newBookingId: string,
  decisions: { waiveFee: boolean; balanceSettledOutside: boolean },
  refund: { amountCents: number; percent: number; reason: string; status: string; currencyCode: string } | null,
): AuditMetadata {
  return {
    ...actorFacts(staff),
    bookingReference: referenceFor(oldBookingId),
    newBookingReference: referenceFor(newBookingId),
    waiveFee: decisions.waiveFee,
    balanceSettledOutside: decisions.balanceSettledOutside,
    ...refundFacts(refund),
  };
}

/**
 * Staff sent a refund themselves and marked it paid: who, the refund, its booking reference, amount and reason. Built from
 * the refund as it was just before the update, so the service writes it in the update's own transaction (docs/13 R6-05).
 * Never the note the person wrote.
 */
export function refundMarkedPaidAuditMetadata(
  staff: StaffAccount,
  refund: { inventory_block_id: string; amount_cents: number; reason: string; currency_code: string },
): AuditMetadata {
  return {
    ...actorFacts(staff),
    bookingReference: referenceFor(refund.inventory_block_id),
    refundCents: refund.amount_cents,
    refundReason: refund.reason.slice(0, 80),
    refundStatus: 'succeeded',
    refundCurrency: refund.currency_code.slice(0, 80),
  };
}

/** A refund was retried or marked paid: the refund, its booking reference, amount and the outcome. */
export function refundActionAuditDetails(input: AuditDetailsInput): AuditMetadata {
  const refund = dataOf(input.result);
  return {
    ...actor(input),
    bookingReference: text(refund?.reference),
    refundCents: whole(refund?.amountCents),
    refundReason: text(refund?.reason),
    refundStatus: text(refund?.status),
    refundCurrency: text(refund?.currencyCode),
  };
}

/**
 * Staff made a booking for a guest, built from what the creator knows inside its own transaction (docs/13 R6-05): the
 * reference, stay, dates, party size, price and method, and the extras by name. Never a guest detail.
 */
export function createBookingAuditMetadata(
  staff: StaffAccount,
  booking: {
    id: string;
    houseId: string;
    checkIn: string;
    checkOut: string;
    guestCount: number;
    totalCents: number;
    currencyCode: string;
    extras: ReadonlyArray<{ name: string; lineCents: number }>;
    bookingSource: string;
    paymentMethod: string;
    paymentStatus: string;
  },
): AuditMetadata {
  return {
    ...actorFacts(staff),
    bookingReference: referenceFor(booking.id),
    houseId: booking.houseId.slice(0, 80),
    checkIn: booking.checkIn,
    checkOut: booking.checkOut,
    guestCount: booking.guestCount,
    totalCents: booking.totalCents,
    currency: booking.currencyCode.slice(0, 80),
    paymentMethod: booking.paymentMethod.slice(0, 80),
    paymentStatus: booking.paymentStatus.slice(0, 80),
    bookingSource: booking.bookingSource.slice(0, 80),
    ...extrasFacts(booking.extras),
  };
}

/** The extras on a booking: how many, what the instant ones add, and their names (never a note or a guest detail). */
function extrasFacts(extras: unknown): AuditMetadata {
  const list = Array.isArray(extras) ? (extras as unknown[]) : [];
  const names = list.map((extra: unknown): string | null => text(field(extra, 'name'))).filter((name): name is string => name !== null);
  const addedCents = list.reduce((sum: number, extra: unknown): number => sum + (whole(field(extra, 'lineCents')) ?? 0), 0);
  return { extrasCount: list.length, extrasCents: addedCents, extraNames: names.slice(0, 10) };
}

/**
 * Staff ticked a pay-at-hotel booking as paid: who, the booking reference and the amount recorded as received. Built from
 * what is known BEFORE the answer exists, so the service writes it inside the transaction that marks the booking paid
 * (docs/13 R6-05).
 */
export function markPaidAuditMetadata(staff: StaffAccount, booking: { id: string; total_cents: number | null; currency_code: string | null }): AuditMetadata {
  return {
    ...actorFacts(staff),
    bookingReference: referenceFor(booking.id),
    paidCents: booking.total_cents ?? 0,
    currency: (booking.currency_code ?? 'EUR').slice(0, 80),
    paymentMethod: 'pay_at_hotel',
  };
}

/** Staff added a note: which booking, how long it is. Never the text. Written in the note's own transaction (docs/13 R6-05). */
export function noteAddedAuditMetadata(staff: StaffAccount, bookingId: string, noteLength: number): AuditMetadata {
  return { ...actorFacts(staff), bookingId: bookingId.slice(0, 80), noteLength };
}

/** Staff hid a note: which booking and which note. Never the text. Written in the same transaction as the hiding. */
export function noteRemovedAuditMetadata(staff: StaffAccount, bookingId: string, noteId: string): AuditMetadata {
  return { ...actorFacts(staff), bookingId: bookingId.slice(0, 80), noteId: noteId.slice(0, 80) };
}

/** An admin corrected where a booking came from: who, the booking, the old and the new source. */
export function sourceChangedAuditMetadata(staff: StaffAccount, bookingId: string, from: string, to: string): AuditMetadata {
  return { ...actorFacts(staff), bookingReference: referenceFor(bookingId), fromSource: from.slice(0, 80), toSource: to.slice(0, 80) };
}
