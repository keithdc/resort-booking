/**
 * @file apps/api/src/modules/discounts/discounts.service.ts
 * @feature discounts
 * @dependencies DiscountsRepository, PropertyRepository
 */

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Discount, DiscountWrite, QuoteDiscountLine } from '@resort-booking/shared-types';
import type { PoolClient } from 'pg';
import { isoDateInTimeZone } from '../../shared/dates/iso-date';
import { PropertyRepository } from '../property/property.repository';
import type { DiscountWriteDto } from './dto/discount-write.dto';
import { DiscountsRepository } from './discounts.repository';
import {
  applyDiscounts,
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

@Injectable()
export class DiscountsService {
  public constructor(
    private readonly discounts: DiscountsRepository,
    private readonly houses: PropertyRepository,
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
   * Notes which discounts a confirmed stay used (counts toward use limits).
   */
  public recordRedemptions(
    client: PoolClient,
    inventoryBlockId: string,
    lines: readonly QuoteDiscountLine[],
  ): Promise<void> {
    return this.discounts.recordRedemptions(client, inventoryBlockId, lines);
  }

  /**
   * When a booking's dates change, discount use moves to the new booking (with the discounts it got).
   */
  public moveRedemptions(
    client: PoolClient,
    fromBookingId: string,
    toBookingId: string,
    lines: readonly QuoteDiscountLine[],
  ): Promise<void> {
    return this.discounts.replaceRedemptions(client, fromBookingId, toBookingId, lines);
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
      priority: dto.priority,
      active: dto.active,
      maxRedemptions: dto.maxRedemptions,
    };
    const problem = validateDiscountWrite(write);
    if (problem !== null) {
      throw new BadRequestException({ message: problem, code: 'INVALID_DISCOUNT' });
    }
    return write;
  }
}
