/**
 * @file apps/api/src/modules/bookings/bookings.service.ts
 * @feature bookings
 * @dependencies BookingReader, RefundIssuer, BookingsRepository
 */

import { ConflictException, Injectable } from '@nestjs/common';
import type { ActionInitiator, GuestBooking, GuestBookingLookupRequest, RefundStatus } from '@resort-booking/shared-types';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../shared/database/database.service';
import { BookingReader } from './booking-reader';
import { BookingsRepository, type BookingRow, type CancelReasonCode } from './bookings.repository';
import { CHANNEL_BOOKING_MESSAGE, checkCancellation } from './bookings.rules';
import { RefundIssuer, type RefundPlan } from './refund-issuer';

/** What the shared cancel needs, whoever is cancelling. */
export interface CancelInput {
  refundCents: number;
  percent: number;
  /** Readable start of the refund's reason text, e.g. "Guest cancelled online". */
  label: string;
  /** Why the booking was cancelled, kept on the booking and on the refund. */
  reasonCode: CancelReasonCode;
  initiatedBy: ActionInitiator;
  /** The staff member, when staff cancel. */
  staffId: string | null;
  note: string | null;
  /** A booking made on another site: nothing was paid here, so no refund row of any size is recorded. */
  skipRefundRow?: boolean;
}

/** Writes the audit row inside the cancel's own transaction, after the refund is recorded and before it commits. */
export type CancelAudit = (client: PoolClient, done: { refundId: string | null; plan: RefundPlan }) => Promise<void>;

export interface CancelOutcome {
  /** False when someone else had already cancelled it (nothing was changed or refunded here). */
  cancelledNow: boolean;
  refundId: string | null;
  /** The refund's status after the provider answered (or as planned when it is done by hand). */
  status: RefundStatus;
  plan: RefundPlan;
}

@Injectable()
export class BookingsService {
  public constructor(
    private readonly bookings: BookingsRepository,
    private readonly reader: BookingReader,
    private readonly refunds: RefundIssuer,
    private readonly database: DatabaseService,
  ) {}

  /**
   * The guest's booking. A wrong reference and a wrong email give the exact same 404.
   */
  public async lookup(request: GuestBookingLookupRequest): Promise<GuestBooking> {
    return this.reader.present(await this.reader.find(request));
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
    const row = await this.reader.find(request);
    if (row.status === 'cancelled') {
      return this.reader.present(row);
    }

    if (row.payment_method === 'paid_by_channel') {
      throw new ConflictException({ message: CHANNEL_BOOKING_MESSAGE, code: 'BOOKED_ON_CHANNEL' });
    }
    const policy = await this.reader.policyFor(row);
    const paidCents = this.reader.paidCentsOf(row);
    const check = checkCancellation(paidCents, row.check_in, this.reader.todayFor(row), policy.tiers);
    if (!check.allowed) {
      throw new ConflictException({ message: check.reason, code: 'CANCELLATION_NOT_ALLOWED' });
    }

    await this.cancelRow(row, {
      refundCents: check.calculation.refundCents,
      percent: check.calculation.percent,
      label: 'Guest cancelled online',
      reasonCode: 'guest_request',
      initiatedBy: 'guest',
      staffId: null,
      note: null,
    });
    return this.reader.present(await this.reader.reload(row.id));
  }

  /**
   * The cancel-and-refund core, shared by the guest and by staff so the money rules exist once.
   * Whoever calls it has already decided who may cancel and how much to refund; this locks the row,
   * cancels it, records the refund (pending) and who/why in ONE transaction, then, after the commit,
   * asks the provider to move the money. A booking cancelled a moment ago by someone else is reported
   * as `cancelledNow: false` and never refunds twice.
   */
  public async cancelRow(row: BookingRow, input: CancelInput, audit?: CancelAudit): Promise<CancelOutcome> {
    const plan = this.refunds.plan(row, input.refundCents, input.percent, input.label);
    const { cancelledNow, refundId } = await this.cancelInTransaction(row, plan, input, audit);
    let status = plan.status;
    if (refundId !== null && plan.viaProvider) {
      status = await this.refunds.settle(refundId, row.id, plan);
    }
    return { cancelledNow, refundId, status, plan };
  }

  private async cancelInTransaction(
    row: BookingRow,
    plan: RefundPlan,
    input: CancelInput,
    audit: CancelAudit | undefined,
  ): Promise<{ cancelledNow: boolean; refundId: string | null }> {
    return this.database.withClient(async (client): Promise<{ cancelledNow: boolean; refundId: string | null }> => {
      await client.query('BEGIN');
      try {
        const status = await this.bookings.lockForCancel(client, row.id);
        if (status !== 'confirmed') {
          // Someone else cancelled it a moment ago (or it is no longer a booking): nothing to do here.
          await client.query('ROLLBACK');
          if (status === 'cancelled') {
            return { cancelledNow: false, refundId: null };
          }
          throw this.reader.notFound();
        }
        await this.bookings.markCancelled(client, row.id, {
          reason: input.reasonCode,
          staffId: input.staffId,
          note: input.note,
          expectedPaymentStatus: row.payment_status,
        });
        const refundId = input.skipRefundRow === true ? null : await this.bookings.insertRefund(client, {
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
          reasonCode: input.reasonCode,
          initiatedBy: input.initiatedBy,
          createdByStaffId: input.staffId,
        });
        // Same transaction: the booking is cancelled and the row exists, or neither (docs/13 R6-05).
        await audit?.(client, { refundId, plan });
        await client.query('COMMIT');
        return { cancelledNow: true, refundId };
      } catch (error: unknown) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }
}
