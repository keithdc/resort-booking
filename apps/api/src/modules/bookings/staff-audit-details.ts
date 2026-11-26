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
function actor({ staff }: AuditDetailsInput): AuditMetadata {
  return {
    actorName: staff.fullName.slice(0, 120),
    actorRole: staff.role,
    viaRefundAccess: staff.role !== 'admin' && staff.canManageRefunds,
  };
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

/** Staff cancelled a booking: the booking reference, the reason, and what was refunded. */
export function cancelAuditDetails(input: AuditDetailsInput): AuditMetadata {
  const id = text(input.params.id);
  return {
    ...actor(input),
    bookingReference: id === null ? null : referenceFor(id),
    reason: text(field(input.body, 'reason')),
    ...refundFacts(dataOf(input.result)?.refund),
  };
}

/** Staff moved a booking's dates: old and new reference, the fee and settlement decisions, and any refund. */
export function changeDatesAuditDetails(input: AuditDetailsInput): AuditMetadata {
  const id = text(input.params.id);
  const data = dataOf(input.result);
  return {
    ...actor(input),
    bookingReference: id === null ? null : referenceFor(id),
    newBookingReference: text(field(data?.reservation, 'reference')),
    waiveFee: field(input.body, 'waiveFee') === true,
    balanceSettledOutside: field(input.body, 'balanceSettledOutside') === true,
    ...refundFacts(data?.refund),
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

/** Staff made a booking for a guest: its reference, stay, dates, party size, price and how it will be paid. No guest details. */
export function createBookingAuditDetails(input: AuditDetailsInput): AuditMetadata {
  const booking = dataOf(input.result);
  return {
    ...actor(input),
    bookingReference: text(booking?.reference),
    houseId: text(booking?.houseId),
    checkIn: text(booking?.checkIn),
    checkOut: text(booking?.checkOut),
    guestCount: whole(booking?.guestCount),
    totalCents: whole(booking?.totalCents),
    currency: text(booking?.currencyCode),
    paymentMethod: text(booking?.paymentMethod),
    paymentStatus: text(booking?.paymentStatus),
    ...extrasFacts(booking?.extras),
  };
}

/** The extras on a booking: how many, what the instant ones add, and their names (never a note or a guest detail). */
function extrasFacts(extras: unknown): AuditMetadata {
  const list = Array.isArray(extras) ? (extras as unknown[]) : [];
  const names = list.map((extra: unknown): string | null => text(field(extra, 'name'))).filter((name): name is string => name !== null);
  const addedCents = list.reduce((sum: number, extra: unknown): number => sum + (whole(field(extra, 'lineCents')) ?? 0), 0);
  return { extrasCount: list.length, extrasCents: addedCents, extraNames: names.slice(0, 10) };
}

/** Staff ticked a pay-at-hotel booking as paid: the booking reference and the amount recorded as received. */
export function markBookingPaidAuditDetails(input: AuditDetailsInput): AuditMetadata {
  const booking = dataOf(input.result);
  return {
    ...actor(input),
    bookingReference: text(booking?.reference),
    paidCents: whole(booking?.paidCents),
    currency: text(booking?.currencyCode),
    paymentMethod: text(booking?.paymentMethod),
  };
}

/** Staff added a note: which booking, how long it is. Never the text. */
export function noteAddedAuditDetails(input: AuditDetailsInput): AuditMetadata {
  const note = dataOf(input.result);
  const body = field(note, 'body');
  return {
    ...actor(input),
    bookingId: text(input.params.id),
    noteLength: typeof body === 'string' ? body.length : null,
  };
}

/** Staff hid a note: which booking and which note. Never the text. */
export function noteRemovedAuditDetails(input: AuditDetailsInput): AuditMetadata {
  return {
    ...actor(input),
    bookingId: text(input.params.id),
    noteId: text(input.params.noteId),
  };
}
