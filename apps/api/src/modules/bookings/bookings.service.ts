/**
 * @file apps/api/src/modules/bookings/bookings.service.ts
 * @feature bookings
 * @dependencies BookingsRepository, PaymentsService, ReservationsService
 */

import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  GuestBooking,
  GuestBookingLookupRequest,
  RefundQuote,
  RefundStatus,
  RefundSummary,
} from '@resort-booking/shared-types';
import { isoDateInTimeZone } from '../../shared/dates/iso-date';
import { DatabaseService } from '../../shared/database/database.service';
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
import { referenceFor } from '../inventory/inventory.rules';

/** How a cancellation's refund will be paid out, decided before anything is written. */
interface RefundPlan {
  amountCents: number;
  percent: number;
  currencyCode: string;
  paymentId: string | null;
  /** 'mock' / 'stripe', or 'manual' when the operator has to refund outside the app. */
  provider: string;
  status: RefundStatus;
  /** True when the active provider must be asked to move the money after the booking is cancelled. */
  viaProvider: boolean;
  reason: string;
}

const MANUAL_PROVIDER = 'manual';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  public constructor(
    private readonly bookings: BookingsRepository,
    private readonly payments: PaymentsService,
    private readonly reservations: ReservationsService,
    private readonly database: DatabaseService,
  ) {}

  /**
   * The guest's booking. A wrong reference and a wrong email give the exact same 404, so nobody can
   * tell which half they got right.
   */
  public async lookup(request: GuestBookingLookupRequest): Promise<GuestBooking> {
    return this.present(await this.find(request));
  }

  /**
   * Cancels a booking and refunds it per the policy it was made under.
   *
   * - One transaction locks the booking, cancels it, and records the refund as pending.
   * - Only after that commits is the provider asked to move the money. If the provider fails the
   *   booking STAYS cancelled and the refund is recorded as failed for staff to retry.
   * - Repeating the call returns the same cancelled booking. There is one refund per booking.
   */
  public async cancel(request: GuestBookingLookupRequest): Promise<GuestBooking> {
    const row = await this.find(request);
    if (row.status === 'cancelled') {
      return this.present(row);
    }

    const policy = await this.policyFor(row);
    const paidCents = paidCentsOf(row);
    const check = checkCancellation(paidCents, row.check_in, this.todayFor(row), policy.tiers);
    if (!check.allowed) {
      throw new ConflictException({ message: check.reason, code: 'CANCELLATION_NOT_ALLOWED' });
    }

    const plan = this.planRefund(row, check.calculation);
    const refundId = await this.cancelInTransaction(row, plan);
    if (refundId !== null && plan.viaProvider) {
      await this.settleWithProvider(refundId, row, plan);
    }
    return this.present(await this.reload(row.id));
  }

  // --- Lookup ---

  private async find(request: GuestBookingLookupRequest): Promise<BookingRow> {
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

  private notFound(): NotFoundException {
    return new NotFoundException({
      message: 'We could not find a booking with that reference and email.',
      code: 'BOOKING_NOT_FOUND',
    });
  }

  private async reload(bookingId: string): Promise<BookingRow> {
    const row = await this.bookings.findById(bookingId);
    if (row === null) {
      throw this.notFound();
    }
    return row;
  }

  // --- Cancelling ---

  private async cancelInTransaction(row: BookingRow, plan: RefundPlan): Promise<string | null> {
    return this.database.withClient(async (client): Promise<string | null> => {
      await client.query('BEGIN');
      try {
        const status = await this.bookings.lockForCancel(client, row.id);
        if (status !== 'confirmed') {
          // Someone else cancelled it a moment ago (or it is no longer a booking): nothing to do here.
          await client.query('ROLLBACK');
          if (status === 'cancelled') {
            return null;
          }
          throw this.notFound();
        }
        await this.bookings.markCancelled(client, row.id);
        const refundId = await this.bookings.insertRefund(client, {
          organizationId: row.organization_id,
          propertyId: row.property_id,
          bookingId: row.id,
          paymentId: plan.paymentId,
          provider: plan.provider,
          amountCents: plan.amountCents,
          percent: plan.percent,
          currencyCode: plan.currencyCode,
          status: plan.status,
          reason: plan.reason,
        });
        await client.query('COMMIT');
        return refundId;
      } catch (error: unknown) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  private planRefund(row: BookingRow, calculation: RefundCalculation): RefundPlan {
    const provider = this.payments.describeProvider();
    const hasPayment = row.payment_id !== null && row.payment_ref !== null && row.payment_provider !== null;
    const sameProvider = row.payment_provider === provider.name;
    const base = {
      amountCents: calculation.refundCents,
      percent: calculation.percent,
      currencyCode: row.currency_code ?? 'EUR',
      paymentId: row.payment_id,
    };
    if (calculation.refundCents === 0) {
      // Nothing to give back: recorded as done, and the provider is never called for zero.
      return { ...base, provider: row.payment_provider ?? MANUAL_PROVIDER, status: 'succeeded', viaProvider: false, reason: 'Guest cancelled online; no refund under the policy' };
    }
    if (hasPayment && sameProvider) {
      return { ...base, provider: provider.name, status: 'pending', viaProvider: true, reason: 'Guest cancelled online' };
    }
    // No online payment on record (or it was taken with another provider): the operator refunds by hand.
    return {
      ...base,
      provider: MANUAL_PROVIDER,
      status: 'pending',
      viaProvider: false,
      reason: hasPayment
        ? 'Guest cancelled online; the payment was taken with a different provider, so the operator must refund it'
        : 'Guest cancelled online; no online payment is on record, so the operator must refund it',
    };
  }

  private async settleWithProvider(refundId: string, row: BookingRow, plan: RefundPlan): Promise<void> {
    try {
      const result = await this.payments.issueRefund({
        providerRef: row.payment_ref ?? '',
        amountCents: plan.amountCents,
        currencyCode: plan.currencyCode,
        reason: plan.reason,
      });
      await this.finish(refundId, 'succeeded', result.providerRef, null);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'The payment provider refused the refund';
      this.logger.error(`Refund ${refundId} for booking ${row.id} failed: ${message}. The booking stays cancelled; staff must retry.`);
      await this.finish(refundId, 'failed', '', message);
    }
  }

  private async finish(refundId: string, status: 'succeeded' | 'failed', providerRef: string, failureReason: string | null): Promise<void> {
    try {
      await this.bookings.completeRefund(refundId, status, providerRef, failureReason);
    } catch (error: unknown) {
      // The provider already answered. Say so loudly: the refund row still reads "pending".
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Refund ${refundId} was ${status} at the provider (${providerRef}) but could not be saved: ${message}`);
    }
  }

  // --- Presenting ---

  private async present(row: BookingRow): Promise<GuestBooking> {
    const currencyCode = row.currency_code ?? 'EUR';
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
      };
    }

    const policy = await this.policyFor(row);
    const paidCents = paidCentsOf(row);
    const check = checkCancellation(paidCents, row.check_in, this.todayFor(row), policy.tiers);
    return {
      ...base,
      status: 'confirmed',
      canCancel: check.allowed,
      cancelBlockedReason: check.allowed ? null : check.reason,
      refundQuote: check.allowed ? this.refundQuote(paidCents, currencyCode, check.calculation) : null,
      refund: null,
      rebookable: policy.rebookable,
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
    const provider = this.payments.describeProvider();
    return {
      amountCents: row.refund_amount_cents,
      percent: row.refund_percent,
      currencyCode: row.refund_currency ?? fallbackCurrency,
      status: row.refund_status,
      // Only a refund made through the active simulated provider is simulated. A manual one is real work.
      simulated: row.refund_provider === provider.name && provider.simulated,
    };
  }

  /**
   * The policy the booking was made under. Older bookings saved none, so they use the property's
   * current policy (the only policy that exists for them).
   */
  private async policyFor(row: BookingRow): Promise<PolicySnapshot> {
    return parsePolicySnapshot(row.policy_snapshot) ?? (await this.reservations.getPolicySnapshot(row.property_id));
  }

  private todayFor(row: BookingRow): string {
    return isoDateInTimeZone(new Date(), row.property_timezone);
  }
}

/**
 * What the guest actually paid: the succeeded payment, else the booking's total.
 */
function paidCentsOf(row: BookingRow): number {
  return row.paid_cents ?? row.total_cents ?? 0;
}
