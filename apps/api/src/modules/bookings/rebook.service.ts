/**
 * @file apps/api/src/modules/bookings/rebook.service.ts
 * @feature bookings
 * @dependencies BookingReader, RefundIssuer, BookingsRepository, InventoryService, AvailabilityService, PaymentsService, DiscountsService
 */

import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type {
  ActionInitiator,
  GuestBooking,
  HouseAvailability,
  PromoCodeResult,
  RebookQuote,
  RebookRequest,
  RebookResult,
  RefundStatus,
  StaffChangeDatesRequest,
  StaffChangeQuoteRequest,
  StaffProfile,
} from '@resort-booking/shared-types';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../shared/database/database.service';
import { DiscountsService } from '../discounts/discounts.service';
import { AvailabilityService } from '../inventory/availability.service';
import { referenceFor, type PriceSnapshot } from '../inventory/inventory.rules';
import { InventoryService } from '../inventory/inventory.service';
import type { SettlingPayment } from '../payments/payment-settlement';
import { PaymentsService } from '../payments/payments.service';
import type { PolicySnapshot } from '../reservations/reservations.rules';
import { BookingReader } from './booking-reader';
import { BookingsRepository, type BookingRow } from './bookings.repository';
import { RefundIssuer, type RefundPlan } from './refund-issuer';
import {
  appliedPromoCodeOf,
  checkNewDates,
  checkRebookAllowed,
  DATES_TAKEN_MESSAGE,
  formatMoney,
  NO_CHANGE_MESSAGE,
  parseRebookPayload,
  priceSnapshotOf,
  rebookBalance,
  rebookFeeCents,
  type NewDatesCheck,
  type RebookBalance,
  type RebookPayload,
} from './rebook.rules';

interface PgErrorLike {
  code?: string;
}

/** Everything worked out about a requested change before anything is written. */
interface RebookContext {
  row: BookingRow;
  policy: PolicySnapshot;
  newCheckIn: string;
  newCheckOut: string;
  dateCheck: NewDatesCheck;
  paidCents: number;
  feeCents: number;
  balance: RebookBalance;
  nights: number;
  currencyCode: string;
  priceSnapshot: PriceSnapshot;
  newTotalCents: number;
  available: boolean;
  promoCode: PromoCodeResult | null;
}

/** What applying a change needs, whether it comes straight from the guest or from a settled payment. */
interface ChangePlan {
  row: BookingRow;
  newCheckIn: string;
  newCheckOut: string;
  newTotalCents: number;
  feeCents: number;
  priceSnapshot: PriceSnapshot;
  payCents: number;
  refundCents: number;
  paymentId: string | null;
  refund: RefundPlan | null;
  /** Who is changing the dates, kept on the audit record, the old booking and any refund. */
  actor: ChangeActor;
  /** Money the guest paid outside the system (staff only); recorded as a manual payment in the swap. */
  manualPaymentCents: number;
}

/** Who made a date change. Guests carry no staff id and no note. */
interface ChangeActor {
  initiatedBy: ActionInitiator;
  staffId: string | null;
  note: string | null;
}

const GUEST_ACTOR: ChangeActor = { initiatedBy: 'guest', staffId: null, note: null };

interface AppliedChange {
  newBookingId: string;
  refundId: string | null;
}

/** What a change that was applied now left behind. */
export interface ChangeOutcome {
  newBookingId: string;
  /** The refund of the price difference, when there was one. */
  refund: { id: string | null; plan: RefundPlan; status: RefundStatus } | null;
}

@Injectable()
export class RebookService {
  public constructor(
    private readonly bookings: BookingsRepository,
    private readonly reader: BookingReader,
    private readonly refunds: RefundIssuer,
    private readonly inventory: InventoryService,
    private readonly availability: AvailabilityService,
    private readonly payments: PaymentsService,
    private readonly discounts: DiscountsService,
    private readonly database: DatabaseService,
  ) {}

  /**
   * The nights of THIS stay that are taken, leaving out the booking's own, so a guest can shift their
   * dates by a day. Dates only. Refused (like a change) when the booking cannot be changed.
   */
  public async availabilityFor(request: { reference: string; email: string }): Promise<HouseAvailability> {
    const row = await this.reader.find(request);
    const policy = await this.reader.policyFor(row);
    this.assertEligible(row, policy);
    return this.availability.getStayAvailabilityExcluding(row.house_id, row.property_timezone, row.id);
  }

  /**
   * What changing to the new dates would cost. Never writes. A taken date range or "no change" still
   * answers 200 with `available: false` and a readable `problem`.
   */
  public async quote(request: RebookRequest): Promise<RebookQuote> {
    const context = await this.prepare(request);
    return this.toQuote(context);
  }

  /**
   * Changes the dates. If the guest owes more, nothing changes yet: a balance payment is opened (the same
   * one again if they ask twice) and the change is applied when it succeeds. Otherwise it is applied now
   * and any money owed back is refunded.
   */
  public async rebook(request: RebookRequest): Promise<RebookResult> {
    const context = await this.prepare(request);
    if (context.dateCheck === 'same') {
      throw new ConflictException({ message: NO_CHANGE_MESSAGE, code: 'NO_CHANGE' });
    }
    if (!context.available) {
      throw this.datesUnavailable();
    }
    if (context.balance.payCents > 0) {
      return this.requirePayment(context);
    }
    return this.changeNow(context);
  }

  /**
   * Applies a change whose balance payment just succeeded, inside the settling transaction (the payment
   * service has already marked it paid). Refuses, and so rolls the payment back, if the booking can no
   * longer be changed or the new dates were taken in the meantime.
   */
  public async applySettledChange(client: PoolClient, payment: SettlingPayment): Promise<void> {
    const payload = parseRebookPayload(payment.payload);
    if (payload === null) {
      throw new ConflictException({ message: 'This date change can no longer be applied.', code: 'REBOOK_PAYLOAD_INVALID' });
    }
    const row = await this.bookings.findById(payload.oldBookingId);
    if (row === null) {
      throw this.reader.notFound();
    }
    this.assertEligible(row, await this.reader.policyFor(row));
    const owed = payload.newTotalCents + payload.feeCents - this.reader.paidCentsOf(row);
    if (owed !== payment.amountCents) {
      throw new ConflictException({
        message: 'Your booking changed while you were paying. Please start the change again.',
        code: 'BOOKING_CHANGED',
      });
    }
    await this.applyInTransaction(client, this.planFromPayload(row, payload, payment));
  }

  /**
   * The new booking a settled balance payment produced.
   */
  public async presentSettled(paymentId: string): Promise<GuestBooking | null> {
    const bookingId = await this.bookings.findBookingIdByChangePayment(paymentId);
    return bookingId === null ? null : this.reader.present(await this.reader.reload(bookingId));
  }

  // --- Working out the change ---

  private async prepare(request: RebookRequest): Promise<RebookContext> {
    const row = await this.reader.find(request);
    const policy = await this.reader.policyFor(row);
    this.assertEligible(row, policy);
    return this.buildContext(row, policy, request.newCheckIn, request.newCheckOut, false);
  }

  /**
   * Works out a change for a booking staff picked. Staff override: the policy's "rebookable" switch
   * does not apply (staff may change dates of any booking that has not started), and the fee can be waived.
   */
  private async prepareForStaff(row: BookingRow, input: StaffChangeQuoteRequest): Promise<RebookContext> {
    const policy = await this.reader.policyFor(row);
    this.assertEligible(row, { ...policy, rebookable: true }, 'staff');
    return this.buildContext(row, policy, input.newCheckIn, input.newCheckOut, input.waiveFee);
  }

  /**
   * Prices the new dates and the money that would move. The same for guests and staff.
   */
  private async buildContext(
    row: BookingRow,
    policy: PolicySnapshot,
    newCheckIn: string,
    newCheckOut: string,
    waiveFee: boolean,
  ): Promise<RebookContext> {
    const dateCheck = checkNewDates(
      { checkIn: row.check_in, checkOut: row.check_out },
      { checkIn: newCheckIn, checkOut: newCheckOut },
      this.reader.todayFor(row),
    );
    if (dateCheck === 'invalid') {
      throw new BadRequestException({ message: 'Check-out must be after check-in', code: 'INVALID_DATES' });
    }
    if (dateCheck === 'past') {
      throw new BadRequestException({ message: 'The new check-in cannot be in the past', code: 'PAST_CHECK_IN' });
    }

    // Today's rates and discounts for the new nights, with the booking's own dates counted as free. A promo
    // code the original booking used is tried again; if it no longer applies the price simply has no discount.
    const promo = appliedPromoCodeOf(row.price_snapshot);
    const quote = await this.inventory.getQuote(
      {
        houseId: row.house_id,
        checkIn: newCheckIn,
        checkOut: newCheckOut,
        guestCount: row.guest_count,
        ...(promo === null ? {} : { promoCode: promo }),
      },
      true,
      { excludeHoldId: row.id },
    );

    const paidCents = this.reader.paidCentsOf(row);
    const feeCents = waiveFee ? 0 : rebookFeeCents(policy.rebookFeeType, policy.rebookFeeValue, paidCents);
    return {
      row,
      policy,
      newCheckIn,
      newCheckOut,
      dateCheck,
      paidCents,
      feeCents,
      balance: rebookBalance(quote.totalCents, feeCents, paidCents),
      nights: quote.nights,
      currencyCode: quote.currencyCode,
      priceSnapshot: priceSnapshotOf(quote),
      newTotalCents: quote.totalCents,
      available: quote.available && dateCheck === 'ok',
      promoCode: quote.promoCode,
    };
  }

  private assertEligible(row: BookingRow, policy: PolicySnapshot, audience: 'guest' | 'staff' = 'guest'): void {
    const eligibility = checkRebookAllowed(
      policy.rebookable,
      row.status,
      row.check_in,
      this.reader.todayFor(row),
      row.payment_status,
      audience,
      row.priced_extras_count > 0,
    );
    if (!eligibility.allowed) {
      throw new ConflictException({ message: eligibility.message, code: eligibility.code });
    }
  }

  private toQuote(context: RebookContext): RebookQuote {
    const { row, balance, priceSnapshot } = context;
    return {
      reference: referenceFor(row.id),
      newCheckIn: context.newCheckIn,
      newCheckOut: context.newCheckOut,
      nights: context.nights,
      currencyCode: context.currencyCode,
      lines: priceSnapshot.lines,
      subtotalCents: priceSnapshot.subtotalCents,
      discounts: priceSnapshot.discounts,
      discountCents: priceSnapshot.discountCents,
      newTotalCents: context.newTotalCents,
      feeCents: context.feeCents,
      paidCents: context.paidCents,
      balanceCents: balance.balanceCents,
      payCents: balance.payCents,
      refundCents: balance.refundCents,
      available: context.available,
      problem: this.problemOf(context),
      promoCode: context.promoCode,
    };
  }

  private problemOf(context: RebookContext): string | null {
    if (context.dateCheck === 'same') {
      return NO_CHANGE_MESSAGE;
    }
    return context.available ? null : DATES_TAKEN_MESSAGE;
  }

  // --- Paying more ---

  private async requirePayment(context: RebookContext): Promise<RebookResult> {
    const { row } = context;
    const payload: RebookPayload = {
      oldBookingId: row.id,
      newCheckIn: context.newCheckIn,
      newCheckOut: context.newCheckOut,
      newTotalCents: context.newTotalCents,
      feeCents: context.feeCents,
      priceSnapshot: context.priceSnapshot,
    };
    const payment = await this.payments.openRebookPayment({
      bookingId: row.id,
      organizationId: row.organization_id,
      propertyId: row.property_id,
      amountCents: context.balance.payCents,
      currencyCode: context.currencyCode,
      payload,
    });
    return { outcome: 'payment_required', booking: await this.reader.present(row), payment, refund: null };
  }

  // --- Changing now ---

  private async changeNow(context: RebookContext): Promise<RebookResult> {
    const outcome = await this.runChange(context, GUEST_ACTOR, 0, 'Guest changed the dates of a booking online; the price difference is refunded');
    const refundSummary =
      outcome.refund === null
        ? null
        : this.reader.summarize(
            outcome.refund.plan.amountCents,
            outcome.refund.plan.percent,
            outcome.refund.plan.currencyCode,
            outcome.refund.status,
            outcome.refund.plan.provider,
          );
    const booking = await this.reader.present(await this.reader.reload(outcome.newBookingId));
    return { outcome: 'changed', booking, payment: null, refund: refundSummary };
  }

  /**
   * Applies a change now (nothing more to pay online): the swap in ONE transaction, then, once it has
   * committed, the provider is asked to move any money back. Guests and staff both come through here.
   */
  private async runChange(
    context: RebookContext,
    actor: ChangeActor,
    manualPaymentCents: number,
    refundLabel: string,
  ): Promise<ChangeOutcome> {
    const { row, balance } = context;
    const refund = balance.refundCents > 0 ? this.refunds.plan(row, balance.refundCents, 100, refundLabel) : null;
    const plan: ChangePlan = {
      row,
      newCheckIn: context.newCheckIn,
      newCheckOut: context.newCheckOut,
      newTotalCents: context.newTotalCents,
      feeCents: context.feeCents,
      priceSnapshot: context.priceSnapshot,
      payCents: manualPaymentCents,
      refundCents: balance.refundCents,
      paymentId: null,
      refund,
      actor,
      manualPaymentCents,
    };
    const applied = await this.database.withClient(async (client): Promise<AppliedChange> => {
      await client.query('BEGIN');
      try {
        const result = await this.applyInTransaction(client, plan);
        await client.query('COMMIT');
        return result;
      } catch (error: unknown) {
        await client.query('ROLLBACK');
        throw error;
      }
    });

    // Only after the change is committed is the provider asked to move any money back.
    if (refund === null) {
      return { newBookingId: applied.newBookingId, refund: null };
    }
    const status =
      applied.refundId !== null && refund.viaProvider ? await this.refunds.settle(applied.refundId, applied.newBookingId, refund) : refund.status;
    return { newBookingId: applied.newBookingId, refund: { id: applied.refundId, plan: refund, status } };
  }

  // --- Staff ---

  /**
   * What changing a booking staff picked to new dates would cost or refund. Never writes.
   */
  public async staffQuote(row: BookingRow, input: StaffChangeQuoteRequest): Promise<RebookQuote> {
    return this.toQuote(await this.prepareForStaff(row, input));
  }

  /**
   * Staff change the dates of a guest's booking. Same pricing and the same atomic swap as the guest, with
   * three differences: the policy's "rebookable" switch is ignored, the fee can be waived, and when the guest
   * owes more, staff must confirm the guest paid the difference outside the system (it is recorded as a
   * manual payment). Who did it and why is kept on the audit record.
   */
  public async staffChange(row: BookingRow, input: StaffChangeDatesRequest, staff: StaffProfile): Promise<ChangeOutcome> {
    const context = await this.prepareForStaff(row, input);
    if (context.dateCheck === 'same') {
      throw new ConflictException({ message: NO_CHANGE_MESSAGE, code: 'NO_CHANGE' });
    }
    if (!context.available) {
      throw this.datesUnavailable();
    }
    if (context.balance.payCents > 0 && !input.balanceSettledOutside) {
      throw new ConflictException({
        message: `The guest owes ${formatMoney(context.balance.payCents, context.currencyCode)} more. Confirm the guest has paid it, or choose different dates.`,
        code: 'BALANCE_REQUIRED',
      });
    }
    return this.runChange(
      context,
      { initiatedBy: 'staff', staffId: staff.id, note: input.note },
      context.balance.payCents,
      `Staff changed the dates of a booking (${staff.fullName}); the price difference is refunded`,
    );
  }

  private planFromPayload(row: BookingRow, payload: RebookPayload, payment: SettlingPayment): ChangePlan {
    return {
      row,
      newCheckIn: payload.newCheckIn,
      newCheckOut: payload.newCheckOut,
      newTotalCents: payload.newTotalCents,
      feeCents: payload.feeCents,
      priceSnapshot: payload.priceSnapshot,
      payCents: payment.amountCents,
      refundCents: 0,
      paymentId: payment.id,
      refund: null,
      actor: GUEST_ACTOR,
      manualPaymentCents: 0,
    };
  }

  /**
   * The swap itself, inside the caller's transaction: lock the old booking, cancel it FIRST (so a shift by
   * a day does not clash with itself), create the replacement, and move what was paid, the guest's
   * requests, discount use and the audit record across. If the new dates are taken the insert is
   * rejected, so everything rolls back and nothing changes.
   */
  private async applyInTransaction(client: PoolClient, plan: ChangePlan): Promise<AppliedChange> {
    const { row } = plan;
    const status = await this.bookings.lockForCancel(client, row.id);
    if (status === 'cancelled') {
      throw new ConflictException({ message: 'This booking is already cancelled.', code: 'BOOKING_CANCELLED' });
    }
    if (status !== 'confirmed') {
      throw this.reader.notFound();
    }
    await this.bookings.markCancelled(client, row.id, {
      reason: 'dates_changed',
      staffId: plan.actor.staffId,
      note: plan.actor.note,
    });

    let newBookingId: string;
    try {
      newBookingId = await this.bookings.insertRebookedBooking(client, {
        oldBookingId: row.id,
        newCheckIn: plan.newCheckIn,
        newCheckOut: plan.newCheckOut,
        totalCents: plan.newTotalCents,
        // Whatever the case, the new booking now holds exactly its price plus the fee.
        paidCents: plan.newTotalCents + plan.feeCents,
        priceSnapshot: JSON.stringify({ ...plan.priceSnapshot, rebookFeeCents: plan.feeCents }),
      });
    } catch (error: unknown) {
      if (isExclusionViolation(error)) {
        throw this.datesUnavailable();
      }
      throw error;
    }

    await this.bookings.copyRequests(client, row.id, newBookingId);
    await this.bookings.copyExtras(client, row.id, newBookingId);
    // A balance the guest paid outside the system (staff confirmed it) becomes a manual payment on the old
    // booking first, so it moves to the new booking together with the other payments.
    const paymentId =
      plan.manualPaymentCents > 0
        ? await this.payments.recordManualPayment(client, {
            bookingId: row.id,
            organizationId: row.organization_id,
            propertyId: row.property_id,
            amountCents: plan.manualPaymentCents,
            currencyCode: row.currency_code ?? 'EUR',
          })
        : plan.paymentId;
    await this.bookings.moveSucceededPayments(client, row.id, newBookingId);
    await this.discounts.moveRedemptions(client, row.id, newBookingId, plan.priceSnapshot.discounts);
    const refundId = await this.recordDifferenceRefund(client, plan, newBookingId);
    await this.bookings.insertChange(client, {
      organizationId: row.organization_id,
      propertyId: row.property_id,
      oldBookingId: row.id,
      newBookingId,
      paymentId,
      oldCheckIn: row.check_in,
      oldCheckOut: row.check_out,
      newCheckIn: plan.newCheckIn,
      newCheckOut: plan.newCheckOut,
      oldTotalCents: row.total_cents ?? 0,
      newTotalCents: plan.newTotalCents,
      feeCents: plan.feeCents,
      payCents: plan.payCents,
      refundCents: plan.refundCents,
      initiatedBy: plan.actor.initiatedBy,
      staffId: plan.actor.staffId,
      note: plan.actor.note,
    });
    return { newBookingId, refundId };
  }

  private async recordDifferenceRefund(client: PoolClient, plan: ChangePlan, newBookingId: string): Promise<string | null> {
    if (plan.refund === null) {
      return null;
    }
    return this.bookings.insertRefund(client, {
      organizationId: plan.row.organization_id,
      propertyId: plan.row.property_id,
      bookingId: newBookingId,
      paymentId: plan.refund.paymentId,
      provider: plan.refund.provider,
      amountCents: plan.refund.amountCents,
      percent: plan.refund.percent,
      currencyCode: plan.refund.currencyCode,
      status: plan.refund.status,
      reason: plan.refund.reason,
      kind: 'rebook_difference',
      reasonCode: 'dates_changed',
      initiatedBy: plan.actor.initiatedBy,
      createdByStaffId: plan.actor.staffId,
    });
  }

  private datesUnavailable(): ConflictException {
    return new ConflictException({ message: DATES_TAKEN_MESSAGE, code: 'DATES_UNAVAILABLE' });
  }
}

function isExclusionViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as PgErrorLike).code === '23P01';
}
