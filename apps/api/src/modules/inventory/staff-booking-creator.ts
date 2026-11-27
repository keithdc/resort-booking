/**
 * @file apps/api/src/modules/inventory/staff-booking-creator.ts
 * @feature inventory
 * @dependencies PropertyRepository, InventoryService, InventoryRepository, DiscountsService, ReservationsService
 */

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  StaffBookingExtraChoice,
  StaffBookingQuote,
  StaffBookingQuoteRequest,
  StaffCreateBookingRequest,
  StaffReservation,
} from '@resort-booking/shared-types';
import { AuditService } from '../../shared/audit/audit.service';
import { LIMITS } from '../../shared/validation/limits';
import { DatabaseService } from '../../shared/database/database.service';
import type { StaffAccount } from '../../shared/roles/staff-role';
import { createBookingAuditMetadata } from '../bookings/staff-audit-details';
import { DiscountsService } from '../discounts/discounts.service';
import { priceExtras, type PricedExtras } from '../extras/booking-extras';
import { ExtrasRepository } from '../extras/extras.repository';
import { ReservationExtrasRepository } from '../extras/reservation-extras.repository';
import { PropertyRepository } from '../property/property.repository';
import { ReservationsService } from '../reservations/reservations.service';
import { InventoryRepository } from './inventory.repository';
import {
  daysFromToday,
  isChannelSource,
  isCheckInBeforeToday,
  isoDateInTimeZone,
  isPgUniqueViolation,
  MAX_BOOKING_ADVANCE_DAYS,
  snapshotOf,
} from './inventory.rules';
import { InventoryService } from './inventory.service';
import { StaffBookingLimiter } from './staff-booking-limiter';

/** A booking above this (one million euros, the same ceiling as any single price) is refused: amounts are 32-bit, and report sums add many bookings. */
export const MAX_STAFF_BOOKING_TOTAL_CENTS = LIMITS.maxCents;

/**
 * Bookings made by staff for a guest who will pay at the property (pay at hotel).
 *
 * The booking is confirmed straight away: there is no hold and no timer, because nobody is paying online. Payment
 * status is `pending` and nothing is counted as paid until a person marks it paid. The price is the one a guest would
 * be quoted (seasonal rates, then automatic discounts) and is saved with the booking, together with today's
 * cancellation policy, so later edits never change it. A guest of the booking can still look it up with the
 * reference and email. A card payment link is a later step: it will add a second payment method here, not a new route.
 */
@Injectable()
export class StaffBookingCreator {
  public constructor(
    private readonly houses: PropertyRepository,
    private readonly quotes: InventoryService,
    private readonly inventory: InventoryRepository,
    private readonly database: DatabaseService,
    private readonly discounts: DiscountsService,
    private readonly reservations: ReservationsService,
    private readonly extras: ExtrasRepository,
    private readonly bookingExtras: ReservationExtrasRepository,
    private readonly limiter: StaffBookingLimiter,
    private readonly audit: AuditService,
  ) {}

  /**
   * What the booking would cost, and whether the dates are free. Unlike a guest quote it also works for a stay that is
   * not published yet; a check-in in the past (property time) or too far ahead is still refused. Chosen extras are
   * priced in: an instant extra adds its price to the total, an on-request one adds nothing (see `StaffBookingQuote`).
   */
  public async quote(staff: StaffAccount, request: StaffBookingQuoteRequest): Promise<StaffBookingQuote> {
    await this.limiter.checkQuote(staff.id);
    return this.priceBooking(staff, request);
  }

  private async priceBooking(staff: StaffAccount, request: StaffBookingQuoteRequest): Promise<StaffBookingQuote> {
    const house = await this.houses.getHouseById(request.houseId);
    if (house === null || house.organizationId !== staff.organizationId) {
      throw new NotFoundException({ message: 'Stay not found', code: 'HOUSE_NOT_FOUND' });
    }
    const today = isoDateInTimeZone(new Date(), house.propertyTimezone);
    if (isCheckInBeforeToday(request.checkIn, today)) {
      throw new BadRequestException({ message: 'Check-in cannot be in the past', code: 'PAST_CHECK_IN' });
    }
    if (daysFromToday(today, request.checkIn) > MAX_BOOKING_ADVANCE_DAYS) {
      throw new BadRequestException({ message: 'That date is too far ahead to book yet', code: 'CHECK_IN_TOO_FAR' });
    }
    const stay = await this.quotes.getQuote(
      {
        houseId: request.houseId,
        checkIn: request.checkIn,
        checkOut: request.checkOut,
        guestCount: request.guestCount,
        ...(request.promoCode === undefined || request.promoCode.trim() === '' ? {} : { promoCode: request.promoCode.trim() }),
      },
      false,
    );
    const priced = await this.priceChosenExtras(house.propertyId, house.organizationId, request.extras ?? [], stay.currencyCode);
    const totalCents = stay.totalCents + priced.extrasCents;
    if (totalCents > MAX_STAFF_BOOKING_TOTAL_CENTS) {
      throw new BadRequestException({ message: 'That booking is too large. Check the extras and their quantities', code: 'BOOKING_TOO_LARGE' });
    }
    return { ...stay, totalCents, extras: priced.lines, extrasCents: priced.extrasCents };
  }

  /**
   * Makes the booking. A clash with another booking (even one made a moment ago) is a 409 and nothing is saved.
   */
  public async create(staff: StaffAccount, request: StaffCreateBookingRequest): Promise<StaffReservation> {
    await this.limiter.checkCreate(staff.id);
    const channel = this.assertSourceRules(request);
    // A channel booking has no extras and is not priced from our rates (the other site collected the money): the
    // quote is used only to check that the dates are free and the stay and dates are acceptable.
    const priced = await this.priceBooking(staff, channel ? { ...request, extras: [] } : request);
    if (!priced.available) {
      throw this.datesUnavailable();
    }
    const channelTotal = channel ? (request.channelTotalCents ?? 0) : 0;
    const quote: StaffBookingQuote = channel
      ? { ...priced, totalCents: channelTotal, subtotalCents: channelTotal, discountCents: 0, discounts: [], lines: [], extras: [], extrasCents: 0, promoCode: null }
      : priced;
    const house = await this.houses.getHouseById(request.houseId);
    if (house === null) {
      throw new NotFoundException({ message: 'Stay not found', code: 'HOUSE_NOT_FOUND' });
    }
    const policy = await this.reservations.getPolicySnapshot(house.propertyId);
    // The saved price keeps the stay's own figures (nights, discounts, stay total) and the extras on top: the booking's
    // `total_cents` is the whole of it, so what is owed and what is refunded later both include the extras.
    const stayTotalCents = quote.totalCents - quote.extrasCents;
    try {
      const id = await this.database.withClient(async (client): Promise<string> => {
        await client.query('BEGIN');
        try {
          // A guest's checkout that ran out of time but has not been swept yet would still block these dates (the same
          // clean-up the guest hold does first), and the staff member would be told "no longer available" for free dates.
          await client.query(
            `UPDATE inventory_blocks SET status = 'expired'
             WHERE house_id = $1 AND kind = 'hold' AND status = 'active' AND expires_at IS NOT NULL AND expires_at < now()`,
            [house.id],
          );
          const bookingId = await this.inventory.insertStaffBooking(client, {
            organizationId: house.organizationId,
            propertyId: house.propertyId,
            houseId: house.id,
            checkIn: request.checkIn,
            checkOut: request.checkOut,
            guestCount: request.guestCount,
            bookerName: request.bookerName.trim(),
            bookerEmail: request.bookerEmail.trim(),
            bookerPhone: request.bookerPhone.trim(),
            guestNote: request.guestNote.trim(),
            totalCents: quote.totalCents,
            currencyCode: quote.currencyCode,
            priceSnapshot: JSON.stringify({ ...snapshotOf({ ...quote, totalCents: stayTotalCents }), extrasCents: quote.extrasCents }),
            policySnapshot: JSON.stringify(policy),
            createdByStaffId: staff.id,
            bookingSource: request.bookingSource,
            paymentMethod: channel ? 'paid_by_channel' : 'pay_at_hotel',
          });
          await this.bookingExtras.insertAll(client, {
            organizationId: house.organizationId,
            propertyId: house.propertyId,
            bookingId,
            lines: quote.extras,
          });
          // Discounts count toward their use limits once a booking exists, whoever made it.
          await this.discounts.recordRedemptions(client, bookingId, quote.discounts);
          // The audit row is part of the same transaction: no booking without its row, no row for a booking that did not happen.
          await this.audit.recordInTransaction(client, { organizationId: staff.organizationId, staffUserId: staff.id }, 'booking.created_by_staff', {
            targetType: 'booking',
            targetId: bookingId,
            metadata: createBookingAuditMetadata(staff, {
              id: bookingId,
              houseId: house.id,
              checkIn: request.checkIn,
              checkOut: request.checkOut,
              guestCount: request.guestCount,
              totalCents: quote.totalCents,
              currencyCode: quote.currencyCode,
              extras: quote.extras,
              bookingSource: request.bookingSource,
              paymentMethod: channel ? 'paid_by_channel' : 'pay_at_hotel',
              paymentStatus: channel ? 'paid' : 'pending',
            }),
          });
          await client.query('COMMIT');
          return bookingId;
        } catch (error: unknown) {
          await client.query('ROLLBACK');
          throw error;
        }
      });
      return await this.reservations.getReservation(id);
    } catch (error: unknown) {
      if (isPgUniqueViolation(error)) {
        throw this.datesUnavailable();
      }
      throw error;
    }
  }

  /**
   * The source decides how the booking is paid and priced. A channel source (Airbnb, Booking.com, another site) needs
   * `paid_by_channel`, the total the guest paid there and no extras; a booking of the property's own (our website,
   * phone or email, walk-in) is `pay_at_hotel` with no typed total. Anything else is a plain 400. Returns true for a channel booking.
   */
  private assertSourceRules(request: StaffCreateBookingRequest): boolean {
    const channel = isChannelSource(request.bookingSource);
    const bad = (message: string, code: string): BadRequestException => new BadRequestException({ message, code });
    if (channel) {
      if (request.paymentMethod !== 'paid_by_channel') {
        throw bad('A booking from another site is recorded as paid on that site.', 'SOURCE_PAYMENT_MISMATCH');
      }
      if (request.channelTotalCents === null || request.channelTotalCents === undefined || request.channelTotalCents < 1) {
        throw bad('Enter the total the guest paid on that site.', 'CHANNEL_TOTAL_REQUIRED');
      }
      if ((request.extras ?? []).length > 0) {
        throw bad('Extras are not added to a booking made on another site.', 'CHANNEL_NO_EXTRAS');
      }
      return true;
    }
    if (request.paymentMethod !== 'pay_at_hotel') {
      throw bad('A booking of your own is paid at the property.', 'SOURCE_PAYMENT_MISMATCH');
    }
    if (request.channelTotalCents !== null && request.channelTotalCents !== undefined) {
      throw bad('A total typed by hand is only for a booking made on another site.', 'CHANNEL_TOTAL_NOT_ALLOWED');
    }
    return false;
  }

  /**
   * The chosen extras priced against what the stay's property offers (published extras of that property and
   * organization only). Anything else, a repeat, or a currency that does not match the stay is refused.
   */
  private async priceChosenExtras(
    propertyId: string,
    organizationId: string,
    choices: readonly StaffBookingExtraChoice[],
    currencyCode: string,
  ): Promise<Extract<PricedExtras, { ok: true }>> {
    if (choices.length === 0) {
      return { ok: true, lines: [], extrasCents: 0 };
    }
    const offered = await this.extras.listPublishedForBooking(propertyId, organizationId);
    const priced = priceExtras(offered, choices, currencyCode);
    if (!priced.ok) {
      if (priced.problem.code === 'EXTRA_NOT_FOUND') {
        throw new NotFoundException({ message: priced.problem.message, code: priced.problem.code });
      }
      throw new BadRequestException({ message: priced.problem.message, code: priced.problem.code });
    }
    return priced;
  }

  private datesUnavailable(): ConflictException {
    return new ConflictException({ message: 'Those dates are no longer available', code: 'DATES_UNAVAILABLE' });
  }
}
