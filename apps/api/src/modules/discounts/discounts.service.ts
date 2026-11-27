/**
 * @file apps/api/src/modules/discounts/discounts.service.ts
 * @feature discounts
 * @dependencies DiscountsRepository, PropertyRepository
 */

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Discount, DiscountWrite, QuoteDiscountLine } from '@resort-booking/shared-types';
import type { PoolClient } from 'pg';
import { isoDateInTimeZone } from '../../shared/dates/iso-date';
import { PropertyRepository } from '../property/property.repository';
import type { DiscountWriteDto } from './dto/discount-write.dto';
import { DiscountsRepository, type RedemptionRow } from './discounts.repository';
import { GuestEmailKeyService } from './guest-email-key';
import {
  applyDiscounts,
  DEFAULT_PRIORITY,
  parseConditions,
  parseEffect,
  validateDiscountWrite,
  type DiscountOutcome,
} from './discounts.rules';

export interface DiscountEvaluationInput {
  house: { id: string; propertyId: string; propertyTimezone: string };
  /** Each night of the stay, YYYY-MM-DD. */
  nights: readonly string[];
  subtotalCents: number;
  promoCode: string | null;
  /** The property's active discounts, loaded once per request. */
  discounts: readonly Discount[];
  now?: Date;
}

/** What a guest is told when a once-per-guest code was already used with their email address. */
export const PROMO_ALREADY_USED_MESSAGE = 'This code has already been used with this email address';
const PROMO_ALREADY_USED_INDEX = 'discount_redemptions_one_use_per_email_key';

function promoAlreadyUsed(): ConflictException {
  return new ConflictException({ message: PROMO_ALREADY_USED_MESSAGE, code: 'PROMO_ALREADY_USED' });
}

/** The unique index that keeps one use per (discount, email key): two checkouts racing with one address cannot both win. */
function isEmailKeyViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const candidate = error as { code?: string; constraint?: string };
  return candidate.code === '23505' && candidate.constraint === PROMO_ALREADY_USED_INDEX;
}

@Injectable()
export class DiscountsService {
  public constructor(
    private readonly discounts: DiscountsRepository,
    private readonly houses: PropertyRepository,
    private readonly emailKeys: GuestEmailKeyService,
  ) {}

  // --- Quoting (guest) ---

  /**
   * Active discounts for many properties in one query, to price a quote or a whole search.
   */
  public loadActive(propertyIds: readonly string[]): Promise<Discount[]> {
    return this.discounts.listForProperties(propertyIds, true);
  }

  /**
   * Discounts for one stay from already-loaded discounts (no query). "Today" is the property's.
   */
  public evaluate(input: DiscountEvaluationInput): DiscountOutcome {
    const checkIn = input.nights[0];
    if (checkIn === undefined) {
      return { lines: [], discountCents: 0, promoCode: null };
    }
    // Discounts for several properties can be loaded together (search); only this property's apply.
    const forProperty = input.discounts.filter((discount): boolean => discount.propertyId === input.house.propertyId);
    return applyDiscounts(input.subtotalCents, forProperty, {
      houseId: input.house.id,
      nights: input.nights,
      checkIn,
      today: isoDateInTimeZone(input.now ?? new Date(), input.house.propertyTimezone),
      promoCode: input.promoCode,
    });
  }

  /**
   * Before a booking is held or made: refuses with `PROMO_ALREADY_USED` (409) when one of the discounts it got is
   * limited to one use per guest and this email address already used it. The quote cannot do this check (it does not
   * know the email), so it happens when the guest presses Pay, and when staff make a booking. `exceptBookingId` is a
   * booking that is being replaced, whose own use does not count against its replacement.
   */
  public async assertGuestMayUse(
    lines: readonly QuoteDiscountLine[],
    email: string | null | undefined,
    exceptBookingId: string | null = null,
  ): Promise<void> {
    if (lines.length === 0 || email === null || email === undefined || email.trim() === '') {
      return;
    }
    const used = await this.discounts.usedByKey(
      undefined,
      lines.map((line): string => line.discountId),
      this.emailKeys.keyFor(email),
      exceptBookingId,
    );
    if (used.size > 0) {
      throw promoAlreadyUsed();
    }
  }

  /**
   * Notes which discounts a confirmed stay used (counts toward use limits). A discount limited to one use per guest also
   * records the guest's email key and is re-checked here, inside the caller's transaction: a second use by the same
   * email, even one racing the first, is refused with `PROMO_ALREADY_USED` and the transaction rolls back.
   */
  public async recordRedemptions(
    client: PoolClient,
    inventoryBlockId: string,
    lines: readonly QuoteDiscountLine[],
  ): Promise<void> {
    const rows = await this.redemptionRows(client, inventoryBlockId, lines, null);
    try {
      await this.discounts.recordRedemptions(client, inventoryBlockId, rows);
    } catch (error: unknown) {
      throw isEmailKeyViolation(error) ? promoAlreadyUsed() : error;
    }
  }

  /**
   * When a booking's dates change, discount use moves to the new booking (with the discounts it got). The guest's own
   * earlier use is the booking being replaced, so it never blocks the replacement and is never counted twice.
   */
  public async moveRedemptions(
    client: PoolClient,
    fromBookingId: string,
    toBookingId: string,
    lines: readonly QuoteDiscountLine[],
  ): Promise<void> {
    const rows = await this.redemptionRows(client, toBookingId, lines, fromBookingId);
    try {
      await this.discounts.replaceRedemptions(client, fromBookingId, toBookingId, rows);
    } catch (error: unknown) {
      throw isEmailKeyViolation(error) ? promoAlreadyUsed() : error;
    }
  }

  /**
   * The rows to record: each discount with its amount, and the booking's email key for the ones limited to one use per
   * guest. Throws `PROMO_ALREADY_USED` when that key already used one of them in another booking.
   */
  private async redemptionRows(
    client: PoolClient,
    bookingId: string,
    lines: readonly QuoteDiscountLine[],
    exceptBookingId: string | null,
  ): Promise<RedemptionRow[]> {
    if (lines.length === 0) {
      return [];
    }
    const limited = await this.discounts.onceOnlyIds(client, lines.map((line): string => line.discountId));
    let key: string | null = null;
    if (limited.size > 0) {
      const email = await this.discounts.bookerEmailOf(client, bookingId);
      key = email === null ? null : this.emailKeys.keyFor(email);
      if (key !== null) {
        const used = await this.discounts.usedByKey(client, [...limited], key, exceptBookingId);
        if (used.size > 0) {
          throw promoAlreadyUsed();
        }
      }
    }
    return lines.map((line): RedemptionRow => ({
      discountId: line.discountId,
      amountCents: line.amountCents,
      emailKey: limited.has(line.discountId) ? key : null,
    }));
  }

  // --- Staff ---

  /**
   * Every discount at a property, active or not, soonest priority first.
   */
  public async list(propertyId: string): Promise<Discount[]> {
    await this.requireProperty(propertyId);
    return this.discounts.listForProperties([propertyId], false);
  }

  /**
   * Adds a discount after checking its rules and that its houses belong to the property.
   */
  public async create(propertyId: string, dto: DiscountWriteDto): Promise<Discount> {
    const property = await this.requireProperty(propertyId);
    const write = this.toWrite(dto);
    await this.requireHousesInProperty(propertyId, write.houseIds);
    return this.discounts.insert({ organizationId: property.organizationId, propertyId }, write);
  }

  /**
   * Edits a discount. Booked stays are not affected: they keep the price they were quoted.
   */
  public async update(discountId: string, dto: DiscountWriteDto): Promise<Discount> {
    const current = await this.discounts.getById(discountId);
    if (current === null) {
      throw new NotFoundException({ message: 'Discount not found', code: 'DISCOUNT_NOT_FOUND' });
    }
    const write = this.toWrite(dto);
    await this.requireHousesInProperty(current.propertyId, write.houseIds);
    const updated = await this.discounts.update(discountId, write);
    if (updated === null) {
      throw new NotFoundException({ message: 'Discount not found', code: 'DISCOUNT_NOT_FOUND' });
    }
    return updated;
  }

  /**
   * Removes a discount.
   */
  public async remove(discountId: string): Promise<void> {
    if (!(await this.discounts.delete(discountId))) {
      throw new NotFoundException({ message: 'Discount not found', code: 'DISCOUNT_NOT_FOUND' });
    }
  }

  // --- Helpers ---

  private async requireProperty(propertyId: string): Promise<{ organizationId: string }> {
    const property = await this.houses.getPropertyById(propertyId);
    if (property === null) {
      throw new NotFoundException({ message: 'Property not found', code: 'PROPERTY_NOT_FOUND' });
    }
    return property;
  }

  private async requireHousesInProperty(propertyId: string, houseIds: readonly string[] | null): Promise<void> {
    if (houseIds === null) {
      return;
    }
    const inProperty = new Set((await this.houses.listHousesByPropertyId(propertyId)).map((house): string => house.id));
    if (houseIds.some((id): boolean => !inProperty.has(id))) {
      throw new BadRequestException({
        message: 'One of the stays does not belong to this property',
        code: 'UNKNOWN_HOUSE',
      });
    }
  }

  private toWrite(dto: DiscountWriteDto): DiscountWrite {
    const effect = parseEffect(dto.effect);
    const conditions = parseConditions(dto.conditions);
    if (effect === null || conditions === null) {
      throw new BadRequestException({ message: 'The discount rules are not valid', code: 'INVALID_DISCOUNT' });
    }
    const write: DiscountWrite = {
      label: dto.label,
      effect,
      conditions,
      alwaysOn: dto.alwaysOn,
      houseIds: dto.houseIds,
      combinable: dto.combinable,
      priority: dto.priority ?? DEFAULT_PRIORITY,
      active: dto.active,
      maxRedemptions: dto.maxRedemptions,
      promoted: dto.promoted ?? false,
      oncePerGuest: dto.oncePerGuest ?? false,
    };
    const problem = validateDiscountWrite(write);
    if (problem !== null) {
      throw new BadRequestException({ message: problem, code: 'INVALID_DISCOUNT' });
    }
    return write;
  }
}
