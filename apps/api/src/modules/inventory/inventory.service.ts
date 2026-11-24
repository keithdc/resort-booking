/**
 * @file apps/api/src/modules/inventory/inventory.service.ts
 * @feature inventory
 * @dependencies PropertyRepository, InventoryRepository, RedisService
 */

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  Discount,
  Hold,
  HouseSearchResult,
  PaymentMethod,
  Quote,
  QuoteDiscountLine,
  ReservationConfirmation,
} from '@resort-booking/shared-types';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../shared/database/database.service';
import { RedisService } from '../../shared/redis/redis.service';
import { DiscountsService } from '../discounts/discounts.service';
import { PropertyRepository } from '../property/property.repository';
import { RatesService, type PeriodsByHouse } from '../rates/rates.service';
import { ReservationsService } from '../reservations/reservations.service';
import type { CreateHoldDto } from './dto/create-hold.dto';
import type { QuoteQueryDto } from './dto/quote-query.dto';
import type { SearchQueryDto } from './dto/search-query.dto';
import type { HoldRow, StayRow } from './inventory.repository';
import { InventoryRepository } from './inventory.repository';
import {
  HOLD_WARNING_REMAINING_SECONDS,
  holdTtlSeconds,
  isCheckInBeforeToday,
  isoDateInTimeZone,
  isPriceSnapshot,
  nightsBetween,
  referenceFor,
  type PriceSnapshot,
} from './inventory.rules';

/** A hold that can be paid right now: still active, not timed out, with the price it was quoted. */
export interface PayableHold {
  id: string;
  organizationId: string;
  propertyId: string;
  houseId: string;
  paymentMethod: PaymentMethod;
  totalCents: number;
  currencyCode: string;
  /** Discounts applied when it was quoted, so they can be counted once it is paid. */
  discounts: QuoteDiscountLine[];
}

/** Optional inputs that let search price many houses without a query per house. */
export interface QuoteOptions {
  /** A hold to ignore when checking the calendar (the hold being viewed). */
  excludeHoldId?: string | null;
  /** Seasonal periods already loaded for the houses being priced. */
  periods?: PeriodsByHouse;
  /** Active discounts already loaded for the properties being priced. */
  discounts?: readonly Discount[];
}

@Injectable()
export class InventoryService {
  public constructor(
    private readonly houses: PropertyRepository,
    private readonly inventory: InventoryRepository,
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
    private readonly rates: RatesService,
    private readonly discounts: DiscountsService,
    private readonly reservations: ReservationsService,
  ) {}

  /**
   * Prices a stay (seasonal rates, then discounts) and reports whether the house is free.
   */
  public async getQuote(
    query: QuoteQueryDto,
    rejectPastCheckIn: boolean,
    options: QuoteOptions = {},
  ): Promise<Quote> {
    const excludeHoldId = options.excludeHoldId ?? null;
    const house = await this.houses.getHouseById(query.houseId);
    if (house === null || (rejectPastCheckIn && !house.published)) {
      throw new NotFoundException({ message: 'Stay not found', code: 'HOUSE_NOT_FOUND' });
    }

    const nights = nightsBetween(query.checkIn, query.checkOut);
    if (nights === null) {
      throw new BadRequestException({ message: 'Check-out must be after check-in', code: 'INVALID_DATES' });
    }

    if (query.guestCount > house.capacity) {
      throw new BadRequestException({
        message: 'Guest count exceeds stay capacity',
        code: 'CAPACITY_EXCEEDED',
      });
    }

    if (rejectPastCheckIn) {
      // "Today" is the property's today (a stay in another timezone must not be judged by Paris time).
      const today = isoDateInTimeZone(new Date(), house.propertyTimezone);
      if (isCheckInBeforeToday(query.checkIn, today)) {
        throw new BadRequestException({
          message: 'Check-in cannot be in the past',
          code: 'PAST_CHECK_IN',
        });
      }
    }

    await this.inventory.expireOverdueHolds(house.id);
    const overlapping = await this.inventory.hasOverlap(
      house.id,
      query.checkIn,
      query.checkOut,
      excludeHoldId,
    );

    // Search preloads periods and discounts for every house in one query each; a single quote loads its own.
    const periods =
      options.periods ?? (await this.rates.loadPeriods([house.id], query.checkIn, query.checkOut));
    const price = this.rates.priceHouseStay(house, query.checkIn, query.checkOut, periods);
    const discounts = options.discounts ?? (await this.discounts.loadActive([house.propertyId]));
    const discounted = this.discounts.evaluate({
      house,
      nights: this.rates.nightsOf(query.checkIn, query.checkOut),
      subtotalCents: price.totalCents,
      promoCode: query.promoCode ?? null,
      discounts,
    });

    return {
      houseId: house.id,
      checkIn: query.checkIn,
      checkOut: query.checkOut,
      guestCount: query.guestCount,
      nights,
      nightlyRateCents: house.nightlyRateCents,
      lines: price.lines,
      subtotalCents: price.totalCents,
      discounts: discounted.lines,
      discountCents: discounted.discountCents,
      totalCents: price.totalCents - discounted.discountCents,
      currencyCode: house.currencyCode,
      available: !overlapping,
      promoCode: discounted.promoCode,
    };
  }

  /**
   * Stay search: API decides which houses fit the dates, guests, and calendar.
   */
  public async searchStays(query: SearchQueryDto): Promise<HouseSearchResult[]> {
    const propertySlug =
      query.propertySlug !== undefined && query.propertySlug.trim() !== ''
        ? query.propertySlug.trim()
        : null;
    const houses = await this.houses.listHousesByPropertySlug(propertySlug, true);
    const matches: HouseSearchResult[] = [];
    const fitting = houses.filter((house): boolean => query.guestCount <= house.capacity);
    // One query each for every candidate house's seasonal periods and discounts, not one per house.
    const periods = await this.rates.loadPeriods(
      fitting.map((house): string => house.id),
      query.checkIn,
      query.checkOut,
    );
    const discounts = await this.discounts.loadActive([...new Set(fitting.map((house): string => house.propertyId))]);

    for (const house of fitting) {
      const quote = await this.getQuote(
        {
          houseId: house.id,
          checkIn: query.checkIn,
          checkOut: query.checkOut,
          guestCount: query.guestCount,
        },
        true,
        { periods, discounts },
      );
      if (quote.available) {
        matches.push({ house, quote });
      }
    }

    return matches;
  }

  /**
   * Creates a per-house hold. Redis TTL is secondary to the Postgres row.
   */
  public async createHold(dto: CreateHoldDto, rejectPastCheckIn: boolean): Promise<Hold> {
    // The request check already refuses this; the rule is repeated here so no other caller can skip it.
    if (!dto.termsAccepted) {
      throw new BadRequestException({
        message: 'You must confirm you have read the cancellation terms before booking',
        code: 'TERMS_NOT_ACCEPTED',
      });
    }
    const quote = await this.getQuote(dto, rejectPastCheckIn);
    if (!quote.available) {
      throw new ConflictException({
        message: 'Those dates are no longer available',
        code: 'DATES_UNAVAILABLE',
      });
    }

    const house = await this.houses.getHouseById(dto.houseId);
    if (house === null) {
      throw new NotFoundException({ message: 'Stay not found', code: 'HOUSE_NOT_FOUND' });
    }

    // The guest books under today's policy. They keep this copy for any later cancel or refund.
    const policy = await this.reservations.getPolicySnapshot(house.propertyId);
    const ttl = holdTtlSeconds(dto.paymentMethod);
    const expiresAt = new Date(Date.now() + ttl * 1000);

    try {
      const row = await this.database.withClient(async (client): Promise<HoldRow> => {
        await client.query('BEGIN');
        try {
          await client.query(
            `
            UPDATE inventory_blocks
            SET status = 'expired'
            WHERE house_id = $1
              AND kind = 'hold'
              AND status = 'active'
              AND expires_at IS NOT NULL
              AND expires_at < now()
            `,
            [house.id],
          );
          const inserted = await this.inventory.insertHold(client, {
            organizationId: house.organizationId,
            propertyId: house.propertyId,
            houseId: house.id,
            checkIn: dto.checkIn,
            checkOut: dto.checkOut,
            guestCount: dto.guestCount,
            paymentMethod: dto.paymentMethod,
            expiresAt,
            bookerName: dto.bookerName.trim(),
            bookerEmail: dto.bookerEmail.trim(),
            bookerPhone: dto.bookerPhone.trim(),
            guestNote: (dto.guestNote ?? '').trim(),
            totalCents: quote.totalCents,
            currencyCode: quote.currencyCode,
            // The quoted price travels with the hold so later rate or discount edits never change it.
            priceSnapshot: JSON.stringify(snapshotOf(quote)),
            policySnapshot: JSON.stringify(policy),
            // The server clock, not the browser's, records when the terms were accepted.
            termsAcceptedAt: new Date(),
          });
          const optionIds = dto.requestOptionIds ?? [];
          const allowed = await this.houses.listRequestOptions(house.propertyId, true);
          const allowedIds = new Set(allowed.map((row): string => row.id));
          for (const optionId of optionIds) {
            if (!allowedIds.has(optionId)) {
              throw new BadRequestException({
                message: 'Unknown stay request option',
                code: 'INVALID_REQUEST_OPTION',
              });
            }
          }
          await this.inventory.insertBlockRequests(client, inserted.id, optionIds);
          await client.query('COMMIT');
          return inserted;
        } catch (error: unknown) {
          await client.query('ROLLBACK');
          throw error;
        }
      });

      await this.redis.setHoldTtl(row.id, ttl);
      return this.toHold(row, quote, ttl);
    } catch (error: unknown) {
      if (isPgUniqueViolation(error)) {
        throw new ConflictException({
          message: 'Those dates are no longer available',
          code: 'DATES_UNAVAILABLE',
        });
      }
      throw error;
    }
  }

  /**
   * Returns a hold, marking it expired if the clock has passed.
   */
  public async getHold(holdId: string): Promise<Hold> {
    const row = await this.inventory.getHoldById(holdId);
    if (row === null) {
      throw new NotFoundException({ message: 'Hold not found', code: 'HOLD_NOT_FOUND' });
    }

    if (row.status === 'active' && row.expires_at.getTime() < Date.now()) {
      await this.inventory.expireOverdueHolds(row.house_id);
      await this.redis.deleteHoldTtl(row.id);
      const expired = await this.inventory.getHoldById(holdId);
      if (expired === null) {
        throw new NotFoundException({ message: 'Hold not found', code: 'HOLD_NOT_FOUND' });
      }
      const quote = await this.getQuote(
        {
          houseId: expired.house_id,
          checkIn: expired.check_in,
          checkOut: expired.check_out,
          guestCount: expired.guest_count,
        },
        false,
        { excludeHoldId: expired.id },
      );
      return this.toHold(expired, withSnapshotPrice(quote, expired.price_snapshot), holdTtlSeconds(expired.payment_method));
    }

    const quote = await this.getQuote(
      {
        houseId: row.house_id,
        checkIn: row.check_in,
        checkOut: row.check_out,
        guestCount: row.guest_count,
      },
      false,
      { excludeHoldId: row.id },
    );
    return this.toHold(row, withSnapshotPrice(quote, row.price_snapshot), holdTtlSeconds(row.payment_method));
  }

  /**
   * The hold to charge for. Throws 404 if it does not exist, 409 if it already ended or timed out
   * (nobody is ever charged for dates they no longer hold). The amount is the quoted price.
   */
  public async getPayableHold(holdId: string): Promise<PayableHold> {
    const row = await this.inventory.getHoldById(holdId);
    if (row === null) {
      throw new NotFoundException({ message: 'Hold not found', code: 'HOLD_NOT_FOUND' });
    }
    if (row.status !== 'active') {
      throw new ConflictException({ message: 'This hold is no longer active', code: 'HOLD_NOT_ACTIVE' });
    }
    if (row.expires_at.getTime() <= Date.now()) {
      throw new ConflictException({
        message: 'Time ran out before payment. Hold the dates again to continue.',
        code: 'HOLD_EXPIRED',
      });
    }
    const stored = row.price_snapshot;
    const priced = isPriceSnapshot(stored)
      ? stored
      : snapshotOf(
          await this.getQuote(
            { houseId: row.house_id, checkIn: row.check_in, checkOut: row.check_out, guestCount: row.guest_count },
            false,
            { excludeHoldId: row.id },
          ),
        );
    return {
      id: row.id,
      organizationId: row.organization_id,
      propertyId: row.property_id,
      houseId: row.house_id,
      paymentMethod: row.payment_method,
      totalCents: priced.totalCents,
      currencyCode: priced.currencyCode,
      discounts: priced.discounts,
    };
  }

  /**
   * Turns a paid hold into a confirmed reservation inside the caller's transaction. Throws 409 if
   * the hold timed out in the meantime, so a late payment never confirms dates that are gone.
   */
  public async confirmPaidHold(client: PoolClient, holdId: string): Promise<ReservationConfirmation> {
    const stay = await this.inventory.confirmPaidHold(client, holdId);
    if (stay === null) {
      throw new ConflictException({
        message: 'Time ran out before payment. Hold the dates again to continue.',
        code: 'HOLD_EXPIRED',
      });
    }
    return toConfirmation(stay);
  }

  /**
   * The confirmation for an already-confirmed stay, or null.
   */
  public async getConfirmation(stayId: string): Promise<ReservationConfirmation | null> {
    const stay = await this.inventory.getConfirmedStay(stayId);
    return stay === null ? null : toConfirmation(stay);
  }

  /**
   * Gives the dates back (for example after a declined payment).
   */
  public async releaseHold(holdId: string): Promise<void> {
    await this.inventory.releaseHold(holdId);
    await this.redis.deleteHoldTtl(holdId);
  }

  private toHold(row: HoldRow, quote: Quote, ttlSeconds: number): Hold {
    const expiresAt = row.expires_at.toISOString();
    const warningAt = new Date(
      row.expires_at.getTime() - HOLD_WARNING_REMAINING_SECONDS * 1000,
    ).toISOString();
    return {
      id: row.id,
      houseId: row.house_id,
      propertyId: row.property_id,
      organizationId: row.organization_id,
      checkIn: row.check_in,
      checkOut: row.check_out,
      guestCount: row.guest_count,
      paymentMethod: row.payment_method,
      status: row.status,
      expiresAt,
      warningAt,
      holdTtlSeconds: ttlSeconds,
      bookerName: row.booker_name,
      bookerEmail: row.booker_email,
      bookerPhone: row.booker_phone,
      guestNote: row.guest_note,
      quote,
    };
  }
}

function toConfirmation(stay: StayRow): ReservationConfirmation {
  return {
    reservationId: stay.id,
    reference: referenceFor(stay.id),
    houseId: stay.house_id,
    propertyId: stay.property_id,
    checkIn: stay.check_in,
    checkOut: stay.check_out,
    guestCount: stay.guest_count,
    totalCents: stay.total_cents ?? 0,
    currencyCode: stay.currency_code ?? 'EUR',
    bookerName: stay.booker_name ?? '',
    bookerEmail: stay.booker_email ?? '',
  };
}

/**
 * The price fields of a quote, as saved with the hold.
 */
function snapshotOf(quote: Quote): PriceSnapshot {
  return {
    lines: quote.lines,
    subtotalCents: quote.subtotalCents,
    discounts: quote.discounts,
    discountCents: quote.discountCents,
    totalCents: quote.totalCents,
    currencyCode: quote.currencyCode,
    promoCode: quote.promoCode,
  };
}

/**
 * A hold shows the price the guest was quoted, not today's. Availability stays live (it tells the
 * guest whether the dates are still free). Holds saved before snapshots existed keep the live price.
 */
function withSnapshotPrice(live: Quote, stored: unknown): Quote {
  if (!isPriceSnapshot(stored)) {
    return live;
  }
  return {
    ...live,
    lines: stored.lines,
    subtotalCents: stored.subtotalCents,
    discounts: stored.discounts,
    discountCents: stored.discountCents,
    totalCents: stored.totalCents,
    currencyCode: stored.currencyCode,
    promoCode: stored.promoCode,
  };
}

interface PgErrorLike {
  code?: string;
}

function isPgUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const candidate = error as PgErrorLike;
  return candidate.code === '23P01' || candidate.code === '23505';
}
