/**
 * @file apps/api/src/modules/bookings/staff-bookings.service.ts
 * @feature bookings
 * @dependencies BookingsRepository, BookingsService, RebookService, BookingReader, ReservationsService
 */

import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  BookingSource,
  RebookQuote,
  StaffCancelPreview,
  StaffCancelReason,
  StaffCancelRequest,
  StaffCancelResult,
  StaffChangeDatesRequest,
  StaffChangeQuoteRequest,
  StaffChangeResult,
  StaffRefund,
  StaffReservation,
} from '@resort-booking/shared-types';
import { AuditService } from '../../shared/audit/audit.service';
import { hasMoneyAccess, type StaffAccount } from '../../shared/roles/staff-role';
import { isChannelSource, referenceFor } from '../inventory/inventory.rules';
import { ReservationsService } from '../reservations/reservations.service';
import { BookingReader } from './booking-reader';
import { BookingsRepository, type AuditInTransaction, type BookingRow } from './bookings.repository';
import {
  calculateRefund,
  isCheckInTodayOrPast,
  SAME_DAY_ADMIN_ONLY_MESSAGE,
  SAME_DAY_NO_REFUND_LABEL,
  SAME_DAY_NO_REFUND_NOTICE,
} from './bookings.rules';
import { BookingsService, type CancelAudit, type CancelInput } from './bookings.service';
import { RebookService } from './rebook.service';
import { cancelAuditMetadata, markPaidAuditMetadata, sourceChangedAuditMetadata } from './staff-audit-details';
import { StaffRefundsRepository } from './staff-refunds.repository';

const BOOKING_NOT_FOUND = 'Booking not found';
const CHANNEL_CANCEL_NOTICE = 'This booking was made on another website. Refunds for it are handled on that website, so cancelling here only frees the dates and records no refund.';
const PAYMENT_PENDING_CANCEL_NOTICE = 'Nothing has been paid for this booking yet (pay at hotel), so there is nothing to refund.';
const MONEY_ACCESS_MESSAGE = 'You need refund access for this. Ask an admin to handle it or to turn on refund access for you.';

/** How each cancel reason reads in the refund's text. */
const REASON_LABELS: Record<StaffCancelReason, string> = {
  guest_request: 'Staff cancelled at the guest\'s request',
  property_cancelled: 'Staff cancelled because the property could not host the stay',
  goodwill: 'Staff cancelled with a goodwill refund',
};

/**
 * What staff may do to a guest's booking: cancel it (with a refund they choose within the rules),
 * and move its dates. The money rules live in BookingsService and RebookService; this decides who
 * may act, how much to refund for each reason, and what to answer.
 *
 * Money access: an admin, or an employee an admin gave "can handle refunds and money actions" (`hasMoneyAccess`), may
 * pick any refund amount and the reasons property_cancelled / goodwill, waive the rebook fee, mark a balance as paid
 * outside the system, and act on the check-in day. Everyone else is policy only: and on the check-in day (or later)
 * their cancellation goes through with NO refund (a change of dates is refused: it is a money difference).
 */
@Injectable()
export class StaffBookingsService {
  public constructor(
    private readonly bookings: BookingsRepository,
    private readonly bookingsService: BookingsService,
    private readonly rebook: RebookService,
    private readonly reader: BookingReader,
    private readonly reservations: ReservationsService,
    private readonly refunds: StaffRefundsRepository,
    private readonly audit: AuditService,
  ) {}

  /**
   * What cancelling would do right now, so staff can see the numbers before choosing. A confirmed
   * booking can be cancelled even after the stay began; cancelled ones and holds cannot.
   */
  public async cancelPreview(staff: StaffAccount, id: string): Promise<StaffCancelPreview> {
    const row = await this.bookings.findById(id);
    if (row === null) {
      return this.previewForOther(staff, id);
    }
    this.requireSameOrganization(staff, row.organization_id);

    const currencyCode = row.currency_code ?? 'EUR';
    const paidCents = this.reader.paidCentsOf(row);
    const base = { reservationId: row.id, reference: referenceFor(row.id), paidCents, currencyCode };
    if (row.status === 'cancelled') {
      return { ...base, canCancel: false, blockedReason: 'This booking is already cancelled.', notice: null, policyRefund: null };
    }

    if (row.payment_method === 'paid_by_channel') {
      // Made on another site: that site holds the money, so no refund is made here whoever cancels.
      const days = calculateRefund(0, row.check_in, this.reader.todayFor(row), []).daysBeforeCheckIn;
      return {
        ...base,
        canCancel: true,
        blockedReason: null,
        notice: CHANNEL_CANCEL_NOTICE,
        policyRefund: { paidCents: 0, refundPercent: 0, refundCents: 0, currencyCode, daysBeforeCheckIn: days },
      };
    }

    if (row.payment_status === 'pending') {
      // Pay at hotel and not paid yet: there is no money to give back, whoever cancels and whatever the ladder says.
      const days = calculateRefund(0, row.check_in, this.reader.todayFor(row), []).daysBeforeCheckIn;
      return {
        ...base,
        canCancel: true,
        blockedReason: null,
        notice: PAYMENT_PENDING_CANCEL_NOTICE,
        policyRefund: { paidCents: 0, refundPercent: 0, refundCents: 0, currencyCode, daysBeforeCheckIn: days },
      };
    }

    if (this.isSameDayLockedFor(staff, row)) {
      const days = calculateRefund(paidCents, row.check_in, this.reader.todayFor(row), []).daysBeforeCheckIn;
      return {
        ...base,
        canCancel: true,
        blockedReason: null,
        notice: SAME_DAY_NO_REFUND_NOTICE,
        policyRefund: { paidCents, refundPercent: 0, refundCents: 0, currencyCode, daysBeforeCheckIn: days },
      };
    }

    const policy = await this.reader.policyFor(row);
    if (policy.tiers.length === 0) {
      return { ...base, canCancel: true, blockedReason: null, notice: null, policyRefund: null };
    }
    const calculation = calculateRefund(paidCents, row.check_in, this.reader.todayFor(row), policy.tiers);
    return {
      ...base,
      canCancel: true,
      blockedReason: null,
      notice: null,
      policyRefund: {
        paidCents,
        refundPercent: calculation.percent,
        refundCents: calculation.refundCents,
        currencyCode,
        daysBeforeCheckIn: calculation.daysBeforeCheckIn,
      },
    };
  }

  /**
   * Cancels a booking for the guest. The refund depends on the reason: the saved policy, everything
   * paid, or an amount staff choose. Who did it and why is kept. A booking that is already cancelled
   * is refused and never refunded a second time.
   */
  public async cancel(staff: StaffAccount, id: string, request: StaffCancelRequest): Promise<StaffCancelResult> {
    this.requireMoneyAccessForCancel(staff, request);
    const row = await this.requireConfirmed(staff, id);
    const input = await this.cancelInput(staff, row, request);
    // The audit row is written in the cancel's own transaction: no cancelled booking without its row, and no row without it.
    const audit: CancelAudit = (client, { refundId, plan }) =>
      this.audit.recordInTransaction(client, { organizationId: staff.organizationId, staffUserId: staff.id }, 'booking.cancelled_by_staff', {
        targetType: 'booking',
        targetId: id,
        metadata: cancelAuditMetadata(
          staff,
          id,
          request.reason,
          refundId === null ? null : { amountCents: plan.amountCents, percent: plan.percent, reason: plan.reason, status: plan.status, currencyCode: plan.currencyCode },
        ),
      });
    const outcome = await this.bookingsService.cancelRow(row, input, audit);
    if (!outcome.cancelledNow) {
      throw this.alreadyCancelled();
    }
    return {
      reservation: await this.reservations.getReservation(id),
      refund: await this.refundOrNull(outcome.refundId),
    };
  }

  /**
   * What moving the booking to other dates would cost. Ignores the policy's "guests may change" switch,
   * but a stay that already started cannot be moved.
   */
  public async changeQuote(staff: StaffAccount, id: string, request: StaffChangeQuoteRequest): Promise<RebookQuote> {
    this.requireMoneyAccessForFeeWaiver(staff, request.waiveFee);
    const row = await this.requireConfirmed(staff, id);
    this.requireNotSameDayWithoutMoneyAccess(staff, row);
    return this.rebook.staffQuote(row, request);
  }

  /**
   * Moves the booking to other dates in one step. A cheaper stay refunds the difference; a dearer one
   * needs staff to confirm the guest paid it outside the system.
   */
  public async changeDates(staff: StaffAccount, id: string, request: StaffChangeDatesRequest): Promise<StaffChangeResult> {
    this.requireMoneyAccessForFeeWaiver(staff, request.waiveFee);
    if (request.balanceSettledOutside) {
      this.requireMoneyAccess(staff);
    }
    const row = await this.requireConfirmed(staff, id);
    this.requireNotSameDayWithoutMoneyAccess(staff, row);
    const outcome = await this.rebook.staffChange(row, request, staff);
    return {
      reservation: await this.reservations.getReservation(outcome.newBookingId),
      refund: await this.refundOrNull(outcome.refund?.id ?? null),
    };
  }

  /**
   * A person ticks a pay-at-hotel booking as paid: the guest paid at the property. Pending becomes paid once, with the
   * time and who did it, and the whole total counts as paid (so a later cancellation refunds under the policy, by hand,
   * because no online payment backs it). Open to admins and employees: the front desk takes the money. A second tick, a
   * cancelled booking and an online booking are all refused with a plain answer, and change nothing.
   */
  public async markPaid(staff: StaffAccount, id: string): Promise<StaffReservation> {
    // The route already needs money access; repeated here so no other caller can skip it.
    this.requireMoneyAccess(staff);
    const row = await this.requireConfirmed(staff, id);
    if (row.payment_method !== 'pay_at_hotel') {
      throw new ConflictException({ message: 'Only a pay-at-hotel booking can be marked as paid.', code: 'NOT_PAY_AT_HOTEL' });
    }
    if (row.payment_status === 'paid') {
      throw this.alreadyPaid();
    }
    // The audit row is written in the same transaction as the update: no tick without its row, no row without its tick.
    const audit: AuditInTransaction = (client) =>
      this.audit.recordInTransaction(client, { organizationId: staff.organizationId, staffUserId: staff.id }, 'booking.marked_paid', {
        targetType: 'booking',
        targetId: id,
        metadata: markPaidAuditMetadata(staff, row),
      });
    if (!(await this.bookings.markPaid(id, staff.id, staff.organizationId, audit))) {
      // Lost a race: someone marked it paid, or it was cancelled, between the read and the write.
      const latest = await this.bookings.findById(id);
      throw latest?.status === 'cancelled' ? this.alreadyCancelled() : this.alreadyPaid();
    }
    return this.reservations.getReservation(id);
  }

  /**
   * An admin corrects where a booking came from (it was typed wrong). Only within the same group: the property's own
   * bookings among themselves, or channel bookings among themselves, because a move across would make the payment record
   * wrong. Audited with who, the old and the new source, in the same transaction.
   */
  public async changeSource(staff: StaffAccount, id: string, to: BookingSource): Promise<StaffReservation> {
    if (staff.role !== 'admin') {
      throw new ForbiddenException({ message: 'Only an admin can change where a booking came from.', code: 'FORBIDDEN_ROLE' });
    }
    const current = await this.bookings.sourceOf(staff.organizationId, id);
    if (current === null) {
      throw this.notFound();
    }
    if (current === to) {
      throw new ConflictException({ message: 'The booking already has that source.', code: 'NO_CHANGE' });
    }
    if (isChannelSource(current) !== isChannelSource(to)) {
      throw new ConflictException({
        message: 'A booking made on another site cannot become one of your own (or the other way round): its payment was handled on that site. Cancel it and add it again instead.',
        code: 'SOURCE_GROUP_CHANGE',
      });
    }
    const audit: AuditInTransaction = (client) =>
      this.audit.recordInTransaction(client, { organizationId: staff.organizationId, staffUserId: staff.id }, 'booking.source_changed', {
        targetType: 'booking',
        targetId: id,
        metadata: sourceChangedAuditMetadata(staff, id, current, to),
      });
    if (!(await this.bookings.changeSource(staff.organizationId, id, current, to, audit))) {
      throw new ConflictException({ message: 'This booking was just changed by someone else. Reload it and try again.', code: 'BOOKING_CHANGED' });
    }
    return this.reservations.getReservation(id);
  }

  /**
   * Money decisions need money access. Without it a person may cancel only under the guest policy ("guest_request"),
   * never with "property_cancelled" (full refund), "goodwill" (any amount) or an explicit amount.
   */
  private requireMoneyAccessForCancel(staff: StaffAccount, request: StaffCancelRequest): void {
    if (request.reason !== 'guest_request' || (request.refundCents !== null && request.refundCents !== undefined)) {
      this.requireMoneyAccess(staff);
    }
  }

  /** Waiving the rebook fee writes off money, so it needs money access. */
  private requireMoneyAccessForFeeWaiver(staff: StaffAccount, waiveFee: boolean): void {
    if (waiveFee) {
      this.requireMoneyAccess(staff);
    }
  }

  /**
   * Without money access, a booking whose check-in is today or past (property time) is cancelled with NO refund: the
   * ladder is skipped because the day-of money call belongs to an admin or a refund-access holder.
   */
  private isSameDayLockedFor(staff: StaffAccount, row: BookingRow): boolean {
    return !hasMoneyAccess(staff) && isCheckInTodayOrPast(row.check_in, this.reader.todayFor(row));
  }

  /** Changing dates on such a booking is a money difference, so it stays blocked without money access. */
  private requireNotSameDayWithoutMoneyAccess(staff: StaffAccount, row: BookingRow): void {
    if (this.isSameDayLockedFor(staff, row)) {
      throw new ForbiddenException({ message: SAME_DAY_ADMIN_ONLY_MESSAGE, code: 'SAME_DAY_ADMIN_ONLY' });
    }
  }

  private requireMoneyAccess(staff: StaffAccount): void {
    if (!hasMoneyAccess(staff)) {
      throw new ForbiddenException({ message: MONEY_ACCESS_MESSAGE, code: 'FORBIDDEN_ROLE' });
    }
  }

  private async cancelInput(staff: StaffAccount, row: BookingRow, request: StaffCancelRequest): Promise<CancelInput> {
    const paidCents = this.reader.paidCentsOf(row);
    const note = request.note.trim();
    const common = { reasonCode: request.reason, initiatedBy: 'staff' as const, staffId: staff.id, note, label: REASON_LABELS[request.reason] };

    if (row.payment_method === 'paid_by_channel') {
      // Another site collected the money: no refund of any size, and no refund row (docs/13 section 12).
      return { ...common, refundCents: 0, percent: 0, label: 'Staff cancelled a booking made on another site: refunds are handled there', skipRefundRow: true };
    }
    if (row.payment_status === 'pending') {
      // Nothing was paid (pay at hotel), so there is nothing to give back; the percent says so instead of quoting the ladder.
      if (request.refundCents !== null && request.refundCents !== undefined && request.refundCents > 0) {
        throw new BadRequestException({ message: 'Nothing has been paid for this booking, so there is nothing to refund.', code: 'INVALID_REFUND_AMOUNT' });
      }
      return { ...common, refundCents: 0, percent: 0 };
    }
    if (this.isSameDayLockedFor(staff, row)) {
      // Only guest_request can get here (the other reasons need money access): forced to zero, and the text says why.
      return { ...common, refundCents: 0, percent: 0, label: SAME_DAY_NO_REFUND_LABEL };
    }
    if (request.reason === 'property_cancelled') {
      return { ...common, refundCents: paidCents, percent: paidCents > 0 ? 100 : 0 };
    }
    if (request.reason === 'goodwill') {
      const refundCents = request.refundCents;
      if (refundCents === null || !Number.isInteger(refundCents) || refundCents < 0 || refundCents > paidCents) {
        throw new BadRequestException({
          message: 'Enter a refund between 0 and the amount the guest paid.',
          code: 'INVALID_REFUND_AMOUNT',
        });
      }
      return { ...common, refundCents, percent: paidCents > 0 ? Math.round((refundCents / paidCents) * 100) : 0 };
    }
    const policy = await this.reader.policyFor(row);
    const calculation = calculateRefund(paidCents, row.check_in, this.reader.todayFor(row), policy.tiers);
    return { ...common, refundCents: calculation.refundCents, percent: calculation.percent };
  }

  /** The booking, only if it is the organization's and still confirmed. */
  private async requireConfirmed(staff: StaffAccount, id: string): Promise<BookingRow> {
    const row = await this.bookings.findById(id);
    if (row === null) {
      throw await this.notFoundOrNotABooking(staff, id);
    }
    this.requireSameOrganization(staff, row.organization_id);
    if (row.status === 'cancelled') {
      throw this.alreadyCancelled();
    }
    return row;
  }

  /** A hold or another kind of block is explained; an unknown or foreign id is a plain 404. */
  private async previewForOther(staff: StaffAccount, id: string): Promise<StaffCancelPreview> {
    const kind = await this.bookings.findKind(id);
    if (kind === null || kind.organization_id !== staff.organizationId) {
      throw this.notFound();
    }
    return {
      reservationId: id,
      reference: referenceFor(id),
      paidCents: 0,
      currencyCode: kind.currency_code ?? 'EUR',
      canCancel: false,
      blockedReason:
        kind.kind === 'hold'
          ? 'This is a hold, not a confirmed booking. It frees itself when the guest does not finish.'
          : 'Only confirmed bookings can be cancelled.',
      notice: null,
      policyRefund: null,
    };
  }

  private async notFoundOrNotABooking(staff: StaffAccount, id: string): Promise<Error> {
    const kind = await this.bookings.findKind(id);
    if (kind === null || kind.organization_id !== staff.organizationId) {
      return this.notFound();
    }
    return new ConflictException({ message: 'Only confirmed bookings can be changed.', code: 'BOOKING_NOT_CONFIRMED' });
  }

  private requireSameOrganization(staff: StaffAccount, organizationId: string): void {
    if (organizationId !== staff.organizationId) {
      throw this.notFound();
    }
  }

  private async refundOrNull(refundId: string | null): Promise<StaffRefund | null> {
    return refundId === null ? null : this.refunds.getStaffRefund(refundId);
  }

  private notFound(): NotFoundException {
    return new NotFoundException({ message: BOOKING_NOT_FOUND, code: 'BOOKING_NOT_FOUND' });
  }

  private alreadyPaid(): ConflictException {
    return new ConflictException({ message: 'This booking is already marked as paid.', code: 'ALREADY_PAID' });
  }

  private alreadyCancelled(): ConflictException {
    return new ConflictException({ message: 'This booking is already cancelled.', code: 'BOOKING_CANCELLED' });
  }
}
