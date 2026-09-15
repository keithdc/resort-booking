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
import type { Hold, HouseSearchResult, Quote } from '@resort-booking/shared-types';
import { DatabaseService } from '../../shared/database/database.service';
import { RedisService } from '../../shared/redis/redis.service';
import { PropertyRepository } from '../property/property.repository';
import type { CreateHoldDto } from './dto/create-hold.dto';
import type { QuoteQueryDto } from './dto/quote-query.dto';
import type { SearchQueryDto } from './dto/search-query.dto';
import type { HoldRow } from './inventory.repository';
import { InventoryRepository } from './inventory.repository';
import {
  HOLD_WARNING_REMAINING_SECONDS,
  holdTtlSeconds,
  isCheckInBeforeToday,
  isoDateInTimeZone,
  nightsBetween,
  quoteTotalCents,
} from './inventory.rules';

@Injectable()
export class InventoryService {
  public constructor(
    private readonly houses: PropertyRepository,
    private readonly inventory: InventoryRepository,
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Prices a stay and reports whether the house is free.
   */
  public async getQuote(
    query: QuoteQueryDto,
    rejectPastCheckIn: boolean,
    excludeHoldId: string | null = null,
  ): Promise<Quote> {
    const house = await this.houses.getHouseById(query.houseId);
    if (house === null || (rejectPastCheckIn && !house.published)) {
      throw new NotFoundException({ message: 'House not found', code: 'HOUSE_NOT_FOUND' });
    }

    const nights = nightsBetween(query.checkIn, query.checkOut);
    if (nights === null) {
      throw new BadRequestException({ message: 'Check-out must be after check-in', code: 'INVALID_DATES' });
    }

    if (query.guestCount > house.capacity) {
      throw new BadRequestException({
        message: 'Guest count exceeds house capacity',
        code: 'CAPACITY_EXCEEDED',
      });
    }

    if (rejectPastCheckIn) {
      const today = isoDateInTimeZone(new Date(), 'Europe/Paris');
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

    return {
      houseId: house.id,
      checkIn: query.checkIn,
      checkOut: query.checkOut,
      guestCount: query.guestCount,
      nights,
      nightlyRateCents: house.nightlyRateCents,
      totalCents: quoteTotalCents(nights, house.nightlyRateCents),
      currencyCode: house.currencyCode,
      available: !overlapping,
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

    for (const house of houses) {
      if (query.guestCount > house.capacity) {
        continue;
      }
      const quote = await this.getQuote(
        {
          houseId: house.id,
          checkIn: query.checkIn,
          checkOut: query.checkOut,
          guestCount: query.guestCount,
        },
        true,
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
    const quote = await this.getQuote(dto, rejectPastCheckIn);
    if (!quote.available) {
      throw new ConflictException({
        message: 'Those dates are no longer available',
        code: 'DATES_UNAVAILABLE',
      });
    }

    const house = await this.houses.getHouseById(dto.houseId);
    if (house === null) {
      throw new NotFoundException({ message: 'House not found', code: 'HOUSE_NOT_FOUND' });
    }

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
          });
          const optionIds = dto.requestOptionIds ?? [];
          const allowed = await this.houses.listRequestOptions(house.propertyId, true);
          const allowedIds = new Set(allowed.map((row): string => row.id));
          for (const optionId of optionIds) {
            if (!allowedIds.has(optionId)) {
              throw new BadRequestException({
                message: 'Unknown house request option',
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
        expired.id,
      );
      return this.toHold(expired, quote, holdTtlSeconds(expired.payment_method));
    }

    const quote = await this.getQuote(
      {
        houseId: row.house_id,
        checkIn: row.check_in,
        checkOut: row.check_out,
        guestCount: row.guest_count,
      },
      false,
      row.id,
    );
    return this.toHold(row, quote, holdTtlSeconds(row.payment_method));
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
