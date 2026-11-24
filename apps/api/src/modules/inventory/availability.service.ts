/**
 * @file apps/api/src/modules/inventory/availability.service.ts
 * @feature inventory
 * @dependencies PropertyRepository, InventoryRepository
 */

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  DateRange,
  HouseAvailability,
  PropertyAvailability,
} from '@resort-booking/shared-types';
import { PropertyRepository } from '../property/property.repository';
import {
  type AvailabilityWindow,
  intersectRangeLists,
  isNightOccupied,
  maxCheckOutDate,
  mergeRanges,
  resolveAvailabilityWindow,
} from './availability.rules';
import type { HouseAvailabilityQueryDto, PropertyAvailabilityQueryDto } from './dto/availability-query.dto';
import { InventoryRepository, type OccupiedRangeRow } from './inventory.repository';
import { isoDateInTimeZone } from './inventory.rules';

@Injectable()
export class AvailabilityService {
  public constructor(
    private readonly properties: PropertyRepository,
    private readonly inventory: InventoryRepository,
  ) {}

  /**
   * Guest-safe unavailable dates for one published house. Dates only, no guest data.
   * With `checkIn`, also returns the latest valid check-out for that day.
   */
  public async getHouseAvailability(
    propertySlug: string,
    houseSlug: string,
    query: HouseAvailabilityQueryDto,
  ): Promise<HouseAvailability> {
    const house = await this.properties.getHouseBySlugs(propertySlug, houseSlug, true);
    if (house === null) {
      throw new NotFoundException({ message: 'Stay not found', code: 'HOUSE_NOT_FOUND' });
    }

    const window = this.resolveWindow(query, house.propertyTimezone);
    const rows = await this.inventory.listOccupiedRanges([house.id], window.from, window.to);
    const unavailable = mergeRanges(rows.map(toRange), window);

    let checkOutLimit: string | null = null;
    if (query.checkIn !== undefined) {
      if (query.checkIn < window.from || query.checkIn >= window.to) {
        throw new BadRequestException({
          message: 'Check-in must fall inside the requested window and not in the past',
          code: 'INVALID_DATES',
        });
      }
      if (isNightOccupied(unavailable, query.checkIn)) {
        throw new ConflictException({
          message: 'That check-in date is not available',
          code: 'CHECK_IN_UNAVAILABLE',
        });
      }
      checkOutLimit = maxCheckOutDate(unavailable, query.checkIn, window.to);
    }

    return {
      houseId: house.id,
      from: window.from,
      to: window.to,
      unavailable,
      maxCheckOutDate: checkOutLimit,
    };
  }

  /**
   * Nights when every published house at the property is taken. One query for all houses.
   */
  public async getPropertyAvailability(
    propertySlug: string,
    query: PropertyAvailabilityQueryDto,
  ): Promise<PropertyAvailability> {
    const property = await this.properties.getPropertyBySlug(propertySlug, true);
    if (property === null) {
      throw new NotFoundException({ message: 'Property not found', code: 'PROPERTY_NOT_FOUND' });
    }

    const window = this.resolveWindow(query, property.timezone);
    const houses = await this.properties.listHousesByPropertySlug(propertySlug, true);
    const rows = await this.inventory.listOccupiedRanges(
      houses.map((house): string => house.id),
      window.from,
      window.to,
    );

    const byHouse = groupRangesByHouse(rows);
    const perHouse = houses.map((house): DateRange[] =>
      mergeRanges(byHouse.get(house.id) ?? [], window),
    );

    return {
      propertyId: property.id,
      from: window.from,
      to: window.to,
      fullyBookedNights: intersectRangeLists(perHouse),
    };
  }

  /**
   * The unavailable ranges of ONE stay for a guest who is changing the dates of a booking on it:
   * the booking's own row is left out, so shifting the dates by a day is possible. Same window and
   * merge rules as the public endpoint. Dates only; no guest data.
   */
  public async getStayAvailabilityExcluding(
    houseId: string,
    timeZone: string,
    excludeBlockId: string,
    query: PropertyAvailabilityQueryDto = {},
  ): Promise<HouseAvailability> {
    const window = this.resolveWindow(query, timeZone);
    const rows = await this.inventory.listOccupiedRanges([houseId], window.from, window.to, excludeBlockId);
    return {
      houseId,
      from: window.from,
      to: window.to,
      unavailable: mergeRanges(rows.map(toRange), window),
      maxCheckOutDate: null,
    };
  }

  private resolveWindow(
    query: PropertyAvailabilityQueryDto,
    timeZone: string,
  ): AvailabilityWindow {
    const today = isoDateInTimeZone(new Date(), timeZone);
    const resolved = resolveAvailabilityWindow(query.from, query.to, today);
    if (!resolved.ok) {
      throw new BadRequestException({ message: resolved.message, code: resolved.code });
    }
    return resolved.window;
  }
}

function toRange(row: OccupiedRangeRow): DateRange {
  return { startDate: row.check_in, endDate: row.check_out };
}

function groupRangesByHouse(rows: readonly OccupiedRangeRow[]): Map<string, DateRange[]> {
  const grouped = new Map<string, DateRange[]>();
  for (const row of rows) {
    const list = grouped.get(row.house_id);
    if (list === undefined) {
      grouped.set(row.house_id, [toRange(row)]);
    } else {
      list.push(toRange(row));
    }
  }
  return grouped;
}
