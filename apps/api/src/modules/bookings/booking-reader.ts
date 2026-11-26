/**
 * @file apps/api/src/modules/bookings/booking-reader.ts
 * @feature bookings
 * @dependencies BookingsRepository, PaymentsService, ReservationsService
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import type { GuestBooking, GuestBookingLookupRequest, RefundQuote, RefundSummary } from '@resort-booking/shared-types';
import { isoDateInTimeZone } from '../../shared/dates/iso-date';
import { referenceFor } from '../inventory/inventory.rules';
import { PaymentsService } from '../payments/payments.service';
import { parsePolicySnapshot, type PolicySnapshot } from '../reservations/reservations.rules';
import { ReservationsService } from '../reservations/reservations.service';
import { BookingsRepository, type BookingRow } from './bookings.repository';
import {
  BOOKING_CANCELLED_MESSAGE,
  checkCancellation,
  parseBookingReference,
  referenceIdRange,
  type RefundCalculation,
} from './bookings.rules';
import { checkRebookAllowed } from './rebook.rules';

export const BOOKING_CANCELLED_SHORT_MESSAGE = 'This booking is cancelled.';

/**
 * Finds a guest's booking and turns it into what the guest may see. Shared by cancelling and by
 * changing dates, so both read bookings, policies and "today" exactly the same way.
 */
@Injectable()
export class BookingReader {
  public constructor(
    private readonly bookings: BookingsRepository,
    private readonly payments: PaymentsService,
    private readonly reservations: ReservationsService,
  ) {}

  /**
   * The guest's booking. A wrong reference and a wrong email give the exact same 404, so nobody can
   * tell which half they got right.
   */
  public async find(request: GuestBookingLookupRequest): Promise<BookingRow> {
    const prefix = parseBookingReference(request.reference);
    if (prefix === null) {
      throw this.notFound();
    }
    const rows = await this.bookings.findByReference(referenceIdRange(prefix), request.email.trim());
    const [only, ...others] = rows;
    // No match, or an ambiguous reference: treated the same, never explained.
    if (only === undefined || others.length > 0) {
      throw this.notFound();
    }
    return only;
  }

  /**
   * The booking again after something changed it.
   */
  public async reload(bookingId: string): Promise<BookingRow> {
    const row = await this.bookings.findById(bookingId);
    if (row === null) {
      throw this.notFound();
    }
    return row;
  }

  public notFound(): NotFoundException {
    return new NotFoundException({
      message: 'We could not find a booking with that reference and email.',
      code: 'BOOKING_NOT_FOUND',
    });
  }

  /**
   * The policy the booking was made under. Older bookings saved none, so they use the property's
   * current policy (the only policy that exists for them).
   */
  public async policyFor(row: BookingRow): Promise<PolicySnapshot> {
    return parsePolicySnapshot(row.policy_snapshot) ?? (await this.reservations.getPolicySnapshot(row.property_id));
  }

  /**
   * Today in the property's timezone, as YYYY-MM-DD.
   */
  public todayFor(row: BookingRow): string {
    return isoDateInTimeZone(new Date(), row.property_timezone);
  }

  /**
   * What has been paid for the booking so far, else its total.
   */
  public paidCentsOf(row: BookingRow): number {
    return row.paid_cents ?? row.total_cents ?? 0;
  }

  /**
   * The booking as its guest may see it. Never includes phone, email or staff data.
   */
  public async present(row: BookingRow): Promise<GuestBooking> {
    const currencyCode = row.currency_code ?? 'EUR';
    const replacedBy = row.replaced_by_id === null ? null : referenceFor(row.replaced_by_id);
    const extras = await this.bookings.listExtras(row.id);
    const base = {
      reference: referenceFor(row.id),
      reservationId: row.id,
      stayName: row.stay_name,
      propertyName: row.property_name,
      checkIn: row.check_in,
      checkOut: row.check_out,
      guestCount: row.guest_count,
      bookerName: row.booker_name ?? '',
      totalCents: row.total_cents ?? 0,
      currencyCode,
      replacedByReference: replacedBy,
      extras,
    };

    if (row.status === 'cancelled') {
      return {
        ...base,
        status: 'cancelled',
        canCancel: false,
        cancelBlockedReason: BOOKING_CANCELLED_MESSAGE,
        refundQuote: null,
        refund: this.refundSummary(row, currencyCode),
        rebookable: false,
        canChangeDates: false,
        changeDatesBlockedReason:
          replacedBy === null
            ? BOOKING_CANCELLED_SHORT_MESSAGE
            : `The dates of this booking were changed. Your new booking is ${replacedBy}.`,
      };
    }

    const policy = await this.policyFor(row);
    const paidCents = this.paidCentsOf(row);
    const today = this.todayFor(row);
    const check = checkCancellation(paidCents, row.check_in, today, policy.tiers);
    const change = checkRebookAllowed(policy.rebookable, 'confirmed', row.check_in, today, row.payment_status, 'guest');
    return {
      ...base,
      status: 'confirmed',
      canCancel: check.allowed,
      cancelBlockedReason: check.allowed ? null : check.reason,
      refundQuote: check.allowed ? this.refundQuote(paidCents, currencyCode, check.calculation) : null,
      refund: null,
      rebookable: policy.rebookable,
      canChangeDates: change.allowed,
      changeDatesBlockedReason: change.allowed ? null : change.message,
    };
  }

  private refundQuote(paidCents: number, currencyCode: string, calculation: RefundCalculation): RefundQuote {
    return {
      paidCents,
      refundPercent: calculation.percent,
      refundCents: calculation.refundCents,
      currencyCode,
      daysBeforeCheckIn: calculation.daysBeforeCheckIn,
    };
  }

  private refundSummary(row: BookingRow, fallbackCurrency: string): RefundSummary | null {
    if (row.refund_id === null || row.refund_amount_cents === null || row.refund_percent === null || row.refund_status === null) {
      return null;
    }
    return this.summarize(row.refund_amount_cents, row.refund_percent, row.refund_currency ?? fallbackCurrency, row.refund_status, row.refund_provider);
  }

  /**
   * A refund as the guest sees it. Only a refund made through the active simulated provider is
   * simulated: a manual one is real work for the operator.
   */
  public summarize(
    amountCents: number,
    percent: number,
    currencyCode: string,
    status: RefundSummary['status'],
    refundProvider: string | null,
  ): RefundSummary {
    const provider = this.payments.describeProvider();
    return {
      amountCents,
      percent,
      currencyCode,
      status,
      simulated: refundProvider === provider.name && provider.simulated,
    };
  }
}
