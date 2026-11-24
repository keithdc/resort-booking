/**
 * @file apps/api/src/modules/bookings/staff-bookings.service.ts
 * @feature bookings
 * @dependencies BookingsRepository, BookingsService, RebookService, BookingReader, ReservationsService
 */

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  RebookQuote,
  StaffCancelPreview,
  StaffCancelReason,
  StaffCancelRequest,
  StaffCancelResult,
  StaffChangeDatesRequest,
  StaffChangeQuoteRequest,
  StaffChangeResult,
  StaffProfile,
  StaffRefund,
} from '@resort-booking/shared-types';
import { referenceFor } from '../inventory/inventory.rules';
import { ReservationsService } from '../reservations/reservations.service';
import { BookingReader } from './booking-reader';
import { BookingsRepository, type BookingRow } from './bookings.repository';
import { calculateRefund } from './bookings.rules';
import { BookingsService, type CancelInput } from './bookings.service';
import { RebookService } from './rebook.service';
import { StaffRefundsRepository } from './staff-refunds.repository';

const BOOKING_NOT_FOUND = 'Booking not found';

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
  ) {}

  /**
   * What cancelling would do right now, so staff can see the numbers before choosing. A confirmed
   * booking can be cancelled even after the stay began; cancelled ones and holds cannot.
   */
  public async cancelPreview(staff: StaffProfile, id: string): Promise<StaffCancelPreview> {
    const row = await this.bookings.findById(id);
    if (row === null) {
      return this.previewForOther(staff, id);
    }
    this.requireSameOrganization(staff, row.organization_id);

    const currencyCode = row.currency_code ?? 'EUR';
    const paidCents = this.reader.paidCentsOf(row);
    const base = { reservationId: row.id, reference: referenceFor(row.id), paidCents, currencyCode };
    if (row.status === 'cancelled') {
      return { ...base, canCancel: false, blockedReason: 'This booking is already cancelled.', policyRefund: null };
    }

    const policy = await this.reader.policyFor(row);
    if (policy.tiers.length === 0) {
      return { ...base, canCancel: true, blockedReason: null, policyRefund: null };
    }
    const calculation = calculateRefund(paidCents, row.check_in, this.reader.todayFor(row), policy.tiers);
    return {
      ...base,
      canCancel: true,
      blockedReason: null,
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
  public async cancel(staff: StaffProfile, id: string, request: StaffCancelRequest): Promise<StaffCancelResult> {
    const row = await this.requireConfirmed(staff, id);
    const input = await this.cancelInput(staff, row, request);
    const outcome = await this.bookingsService.cancelRow(row, input);
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
  public async changeQuote(staff: StaffProfile, id: string, request: StaffChangeQuoteRequest): Promise<RebookQuote> {
    const row = await this.requireConfirmed(staff, id);
    return this.rebook.staffQuote(row, request);
  }

  /**
   * Moves the booking to other dates in one step. A cheaper stay refunds the difference; a dearer one
   * needs staff to confirm the guest paid it outside the system.
   */
  public async changeDates(staff: StaffProfile, id: string, request: StaffChangeDatesRequest): Promise<StaffChangeResult> {
    const row = await this.requireConfirmed(staff, id);
    const outcome = await this.rebook.staffChange(row, request, staff);
    return {
      reservation: await this.reservations.getReservation(outcome.newBookingId),
      refund: await this.refundOrNull(outcome.refund?.id ?? null),
    };
  }

  private async cancelInput(staff: StaffProfile, row: BookingRow, request: StaffCancelRequest): Promise<CancelInput> {
    const paidCents = this.reader.paidCentsOf(row);
    const note = request.note.trim();
    const common = { reasonCode: request.reason, initiatedBy: 'staff' as const, staffId: staff.id, note, label: REASON_LABELS[request.reason] };

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
  private async requireConfirmed(staff: StaffProfile, id: string): Promise<BookingRow> {
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
  private async previewForOther(staff: StaffProfile, id: string): Promise<StaffCancelPreview> {
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
      policyRefund: null,
    };
  }

  private async notFoundOrNotABooking(staff: StaffProfile, id: string): Promise<Error> {
    const kind = await this.bookings.findKind(id);
    if (kind === null || kind.organization_id !== staff.organizationId) {
      return this.notFound();
    }
    return new ConflictException({ message: 'Only confirmed bookings can be changed.', code: 'BOOKING_NOT_CONFIRMED' });
  }

  private requireSameOrganization(staff: StaffProfile, organizationId: string): void {
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

  private alreadyCancelled(): ConflictException {
    return new ConflictException({ message: 'This booking is already cancelled.', code: 'BOOKING_CANCELLED' });
  }
}
