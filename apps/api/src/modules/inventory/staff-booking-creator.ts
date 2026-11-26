/**
 * @file apps/api/src/modules/inventory/staff-booking-creator.ts
 * @feature inventory
 * @dependencies PropertyRepository, InventoryService, InventoryRepository, DiscountsService, ReservationsService
 */

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  Quote,
  StaffBookingQuoteRequest,
  StaffCreateBookingRequest,
  StaffReservation,
} from '@resort-booking/shared-types';
import { DatabaseService } from '../../shared/database/database.service';
import type { StaffAccount } from '../../shared/roles/staff-role';
import { DiscountsService } from '../discounts/discounts.service';
import { PropertyRepository } from '../property/property.repository';
import { ReservationsService } from '../reservations/reservations.service';
import { InventoryRepository } from './inventory.repository';
import {
  daysFromToday,
  isCheckInBeforeToday,
  isoDateInTimeZone,
  isPgUniqueViolation,
  MAX_BOOKING_ADVANCE_DAYS,
  snapshotOf,
} from './inventory.rules';
import { InventoryService } from './inventory.service';

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
  ) {}

  /**
   * What the stay would cost, and whether the dates are free. Unlike a guest quote it also works for a stay that is
   * not published yet; a check-in in the past (property time) or too far ahead is still refused.
   */
  public async quote(staff: StaffAccount, request: StaffBookingQuoteRequest): Promise<Quote> {
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
    return this.quotes.getQuote(
      { houseId: request.houseId, checkIn: request.checkIn, checkOut: request.checkOut, guestCount: request.guestCount },
      false,
    );
  }

  /**
   * Makes the booking. A clash with another booking (even one made a moment ago) is a 409 and nothing is saved.
   */
  public async create(staff: StaffAccount, request: StaffCreateBookingRequest): Promise<StaffReservation> {
    const quote = await this.quote(staff, request);
    if (!quote.available) {
      throw this.datesUnavailable();
    }
    const house = await this.houses.getHouseById(request.houseId);
    if (house === null) {
      throw new NotFoundException({ message: 'Stay not found', code: 'HOUSE_NOT_FOUND' });
    }
    const policy = await this.reservations.getPolicySnapshot(house.propertyId);
    try {
      const id = await this.database.withClient(async (client): Promise<string> => {
        await client.query('BEGIN');
        try {
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
            priceSnapshot: JSON.stringify(snapshotOf(quote)),
            policySnapshot: JSON.stringify(policy),
            createdByStaffId: staff.id,
          });
          // Discounts count toward their use limits once a booking exists, whoever made it.
          await this.discounts.recordRedemptions(client, bookingId, quote.discounts);
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

  private datesUnavailable(): ConflictException {
    return new ConflictException({ message: 'Those dates are no longer available', code: 'DATES_UNAVAILABLE' });
  }
}
