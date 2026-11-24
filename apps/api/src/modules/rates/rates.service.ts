/**
 * @file apps/api/src/modules/rates/rates.service.ts
 * @feature rates
 * @dependencies RatesRepository, PropertyRepository
 */

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  BulkRatePeriodHouseResult,
  BulkRatePeriodPreview,
  BulkRatePeriodRequest,
  BulkRatePeriodResult,
  HouseSummary,
  RatePeriod,
  RatePeriodConflict,
  RatePeriodWrite,
  StaffProfile,
} from '@resort-booking/shared-types';
import { addDaysIso } from '../../shared/dates/iso-date';
import { PropertyRepository } from '../property/property.repository';
import { RatesRepository, type HouseScope } from './rates.repository';
import {
  describeConflict,
  findPeriodConflict,
  priceStay,
  stayNights,
  validatePeriodWrite,
  type PricedStay,
} from './rates.rules';

interface PgErrorLike {
  code?: string;
}

/** Periods grouped by house, loaded once per request. */
export type PeriodsByHouse = Map<string, RatePeriod[]>;

@Injectable()
export class RatesService {
  public constructor(
    private readonly rates: RatesRepository,
    private readonly houses: PropertyRepository,
  ) {}

  // --- Pricing (guest quote and search) ---

  /**
   * Loads the periods for many houses in one query, for the nights of one stay.
   */
  public async loadPeriods(houseIds: readonly string[], checkIn: string, checkOut: string): Promise<PeriodsByHouse> {
    const grouped: PeriodsByHouse = new Map();
    if (stayNights(checkIn, checkOut).length === 0) {
      return grouped;
    }
    const periods = await this.rates.listForHouses(houseIds, checkIn, addDaysIso(checkOut, -1));
    for (const period of periods) {
      const list = grouped.get(period.houseId);
      if (list === undefined) {
        grouped.set(period.houseId, [period]);
      } else {
        list.push(period);
      }
    }
    return grouped;
  }

  /**
   * Prices one stay for a house from already-loaded periods (no query).
   */
  public priceHouseStay(
    house: { id: string; nightlyRateCents: number },
    checkIn: string,
    checkOut: string,
    periodsByHouse: PeriodsByHouse,
  ): PricedStay {
    return priceStay(stayNights(checkIn, checkOut), house.nightlyRateCents, periodsByHouse.get(house.id) ?? []);
  }

  // --- Staff: periods on one house ---

  /**
   * Every period on every house of a property, in one query. Each house's periods stay in date order.
   */
  public async listForProperty(propertyId: string): Promise<RatePeriod[]> {
    if ((await this.houses.getPropertyById(propertyId)) === null) {
      throw new NotFoundException({ message: 'Property not found', code: 'PROPERTY_NOT_FOUND' });
    }
    return this.rates.listForProperty(propertyId);
  }

  /**
   * Periods on a house, soonest first.
   */
  public async list(houseId: string): Promise<RatePeriod[]> {
    await this.requireHouse(houseId);
    return this.rates.listForHouse(houseId);
  }

  /**
   * Adds a period. Rejects a date clash with the period it collides with.
   */
  public async create(houseId: string, write: RatePeriodWrite): Promise<RatePeriod> {
    const house = await this.requireHouse(houseId);
    this.requireValid(write);
    const existing = await this.rates.listForHouse(houseId);
    this.rejectConflict(findPeriodConflict(existing, write, null));
    try {
      return await this.rates.insert(scopeOf(house), write);
    } catch (error: unknown) {
      throw this.mapRace(error);
    }
  }

  /**
   * Edits a period. It may keep or move its own dates, but never clash with another.
   */
  public async update(periodId: string, write: RatePeriodWrite): Promise<RatePeriod> {
    const current = await this.rates.getById(periodId);
    if (current === null) {
      throw new NotFoundException({ message: 'Rate period not found', code: 'RATE_PERIOD_NOT_FOUND' });
    }
    this.requireValid(write);
    const existing = await this.rates.listForHouse(current.houseId);
    this.rejectConflict(findPeriodConflict(existing, write, periodId));
    try {
      const updated = await this.rates.update(periodId, write);
      if (updated === null) {
        throw new NotFoundException({ message: 'Rate period not found', code: 'RATE_PERIOD_NOT_FOUND' });
      }
      return updated;
    } catch (error: unknown) {
      throw this.mapRace(error);
    }
  }

  /**
   * Removes a period. Existing reservations keep the price they were quoted.
   */
  public async remove(periodId: string): Promise<void> {
    if (!(await this.rates.delete(periodId))) {
      throw new NotFoundException({ message: 'Rate period not found', code: 'RATE_PERIOD_NOT_FOUND' });
    }
  }

  // --- Staff: apply to many houses ---

  /**
   * Dry run: per house, will it be added or does it clash. Writes nothing.
   */
  public async previewBulk(propertyId: string, request: BulkRatePeriodRequest): Promise<BulkRatePeriodPreview> {
    this.requireValid(request);
    const targets = await this.targetHouses(propertyId, request.houseIds);
    const conflicts = await this.rates.listConflictsForHouses(
      targets.map((house): string => house.id),
      request.startDate,
      request.endDate,
    );
    const conflictByHouse = new Map<string, RatePeriodConflict>(
      conflicts.map((row): [string, RatePeriodConflict] => [
        row.house_id,
        { label: row.label, startDate: row.start_date, endDate: row.end_date },
      ]),
    );
    const results = targets.map((house): BulkRatePeriodHouseResult => {
      const conflict = conflictByHouse.get(house.id) ?? null;
      return {
        houseId: house.id,
        houseName: house.name,
        status: conflict === null ? 'will_add' : 'conflict',
        conflict,
      };
    });
    const conflictCount = results.filter((result): boolean => result.status === 'conflict').length;
    return { propertyId, results, addCount: results.length - conflictCount, conflictCount };
  }

  /**
   * Applies the period to every house WITHOUT a clash, in one transaction, and logs who did it.
   * Houses with a clash are skipped, never overwritten. Needs `confirmed: true`.
   */
  public async applyBulk(
    propertyId: string,
    request: BulkRatePeriodRequest,
    staff: StaffProfile | undefined,
  ): Promise<BulkRatePeriodResult> {
    if (!request.confirmed) {
      throw new BadRequestException({
        message: 'Confirm the change before applying it to several houses',
        code: 'CONFIRMATION_REQUIRED',
      });
    }
    const preview = await this.previewBulk(propertyId, request);
    const targets = await this.targetHouses(propertyId, request.houseIds);
    const addIds = new Set(
      preview.results.filter((result): boolean => result.status === 'will_add').map((result): string => result.houseId),
    );
    const toAdd = targets.filter((house): boolean => addIds.has(house.id));
    const skipped = targets.filter((house): boolean => !addIds.has(house.id));

    try {
      await this.rates.inTransaction(async (client): Promise<void> => {
        await this.rates.insertForHouses(client, toAdd.map(scopeOf), request);
        const first = targets[0];
        if (first !== undefined) {
          await this.rates.insertBulkAudit(client, {
            organizationId: first.organizationId,
            propertyId,
            staffAccountId: staff?.id ?? null,
            write: request,
            addedHouseIds: toAdd.map((house): string => house.id),
            skippedHouseIds: skipped.map((house): string => house.id),
          });
        }
      });
    } catch (error: unknown) {
      throw this.mapRace(error);
    }
    return {
      propertyId,
      addedHouseIds: toAdd.map((house): string => house.id),
      skippedHouseIds: skipped.map((house): string => house.id),
    };
  }

  // --- Helpers ---

  private async requireHouse(houseId: string): Promise<HouseScopeSource> {
    const house = await this.houses.getHouseById(houseId);
    if (house === null) {
      throw new NotFoundException({ message: 'House not found', code: 'HOUSE_NOT_FOUND' });
    }
    return house;
  }

  private async targetHouses(propertyId: string, houseIds: readonly string[]): Promise<HouseSummary[]> {
    const all = await this.houses.listHousesByPropertyId(propertyId);
    if (all.length === 0) {
      throw new NotFoundException({ message: 'Property not found', code: 'PROPERTY_NOT_FOUND' });
    }
    const wanted = new Set(houseIds);
    const targets = all.filter((house): boolean => wanted.has(house.id));
    if (targets.length !== wanted.size) {
      throw new BadRequestException({
        message: 'One of the houses does not belong to this property',
        code: 'UNKNOWN_HOUSE',
      });
    }
    return targets;
  }

  private requireValid(write: RatePeriodWrite): void {
    const problem = validatePeriodWrite(write);
    if (problem !== null) {
      throw new BadRequestException({ message: problem, code: 'INVALID_RATE_PERIOD' });
    }
  }

  private rejectConflict(conflict: RatePeriodConflict | null): void {
    if (conflict !== null) {
      throw new ConflictException({ message: describeConflict(conflict), code: 'RATE_PERIOD_OVERLAP' });
    }
  }

  /**
   * Two staff saving at once can both pass the check; the database constraint is the last guard.
   */
  private mapRace(error: unknown): unknown {
    if (typeof error === 'object' && error !== null && (error as PgErrorLike).code === '23P01') {
      return new ConflictException({
        message: 'These dates were just taken by another rate period. Refresh and try again.',
        code: 'RATE_PERIOD_OVERLAP',
      });
    }
    return error;
  }
}

interface HouseScopeSource {
  id: string;
  organizationId: string;
  propertyId: string;
}

function scopeOf(house: HouseScopeSource): HouseScope {
  return { organizationId: house.organizationId, propertyId: house.propertyId, houseId: house.id };
}
