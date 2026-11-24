/**
 * @file apps/api/src/modules/reservations/reservations.service.ts
 * @feature reservations
 * @dependencies ReservationsRepository
 */

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  ArrivalStatus,
  CalendarDayOccupancy,
  CancellationPolicy,
  CancellationPolicyTier,
  HouseReportRow,
  PaymentMethodSlice,
  PropertyBookingConfig,
  PropertyReportRow,
  ReportSeriesPoint,
  SavePropertyBookingConfigRequest,
  StaffCalendar,
  StaffReport,
  StaffReservation,
} from '@resort-booking/shared-types';
import { nightsBetween } from '../inventory/inventory.rules';
import { PropertyService } from '../property/property.service';
import type { StaffDayQueryDto } from './dto/staff-day.query.dto';
import type { StaffRangeQueryDto } from './dto/staff-range.query.dto';
import { ReservationsRepository } from './reservations.repository';
import {
  calendarDayCounts,
  classifyPipelineRow,
  eachIsoDate,
  hasInvertedRefundLadder,
  isInHouseNow,
  isUpcomingArrival,
  overlapNights,
  reportAsOfDate,
  sortCalendarDayStays,
  stayOccupiesDate,
  uniquePropertyCount,
  validateCancellationTiers,
  type PolicySnapshot,
} from './reservations.rules';

@Injectable()
export class ReservationsService {
  public constructor(
    private readonly reservations: ReservationsRepository,
    private readonly properties: PropertyService,
  ) {}

  /**
   * Occupancy counts per day. Admin UI only renders this.
   */
  public async getCalendar(query: StaffRangeQueryDto): Promise<StaffCalendar> {
    this.assertRange(query.from, query.to);
    const propertyId = query.propertyId ?? null;
    const stays = await this.reservations.listPipelineOverlapping(query.from, query.to, propertyId);
    const days: CalendarDayOccupancy[] = eachIsoDate(query.from, query.to).map(
      (date: string): CalendarDayOccupancy => calendarDayCounts(stays, date),
    );
    return { from: query.from, to: query.to, days };
  }

  /**
   * Who is in-house on this date, including cancelled and rebooked stays.
   */
  public async listOnDate(query: StaffDayQueryDto): Promise<StaffReservation[]> {
    const rows = await this.reservations.listPipelineOnDate(query.onDate, query.propertyId ?? null);
    return sortCalendarDayStays(rows);
  }

  /**
   * One booking as staff see it, with its refunds and change history. 404 when there is none.
   */
  public async getReservation(id: string): Promise<StaffReservation> {
    const reservation = await this.reservations.getById(id);
    if (reservation === null) {
      throw new NotFoundException({ message: 'Booking not found', code: 'BOOKING_NOT_FOUND' });
    }
    return reservation;
  }

  /**
   * Occupied nights, revenue, occupancy, and daily series. UI only renders this.
   */
  public async getReport(query: StaffRangeQueryDto): Promise<StaffReport> {
    this.assertRange(query.from, query.to);
    const propertyId = query.propertyId ?? null;
    const stays = await this.reservations.listConfirmedOverlapping(query.from, query.to, propertyId);
    const pipeline = await this.reservations.listPipelineOverlapping(query.from, query.to, propertyId);
    const houseCount = await this.reservations.countHouses(propertyId);
    const span = nightsBetween(query.from, query.to) ?? 0;
    const availableNights = houseCount * span;
    const dates = eachIsoDate(query.from, query.to);
    const dailyMap = new Map<string, ReportSeriesPoint>();
    for (const date of dates) {
      dailyMap.set(date, {
        date,
        revenueCents: 0,
        occupiedNights: 0,
        stayCount: 0,
        pendingCount: 0,
        cancelledCount: 0,
      });
    }

    const byProperty = new Map<string, PropertyReportRow>();
    const paymentMap = new Map<PaymentMethodSlice['paymentMethod'], PaymentMethodSlice>();
    let occupiedNights = 0;
    let revenueCents = 0;
    let guestCount = 0;
    const asOfDate = reportAsOfDate();

    for (const stay of stays) {
      const stayNights = nightsBetween(stay.checkIn, stay.checkOut) ?? 1;
      const nightly = Math.round(stay.totalCents / stayNights);
      const nights = overlapNights(stay.checkIn, stay.checkOut, query.from, query.to);
      const rangedRevenue = nightly * nights;
      occupiedNights += nights;
      revenueCents += rangedRevenue;
      guestCount += stay.guestCount;

      const method: PaymentMethodSlice['paymentMethod'] = stay.paymentMethod ?? 'unknown';
      const slice = paymentMap.get(method) ?? {
        paymentMethod: method,
        reservationCount: 0,
        revenueCents: 0,
      };
      slice.reservationCount += 1;
      slice.revenueCents += rangedRevenue;
      paymentMap.set(method, slice);

      for (const date of dates) {
        if (!stayOccupiesDate(stay.checkIn, stay.checkOut, date)) {
          continue;
        }
        const point = dailyMap.get(date);
        if (point === undefined) {
          continue;
        }
        point.occupiedNights += 1;
        point.stayCount += 1;
        point.revenueCents += nightly;
      }

      let property = byProperty.get(stay.propertyId);
      if (property === undefined) {
        property = {
          propertyId: stay.propertyId,
          propertyName: stay.propertyName,
          reservationCount: 0,
          occupiedNights: 0,
          revenueCents: 0,
          currencyCode: stay.currencyCode,
          houses: [],
        };
        byProperty.set(stay.propertyId, property);
      }
      property.reservationCount += 1;
      property.occupiedNights += nights;
      property.revenueCents += rangedRevenue;

      let house = property.houses.find((row: HouseReportRow): boolean => row.houseId === stay.houseId);
      if (house === undefined) {
        house = {
          houseId: stay.houseId,
          houseName: stay.houseName,
          reservationCount: 0,
          occupiedNights: 0,
          revenueCents: 0,
        };
        property.houses.push(house);
      }
      house.reservationCount += 1;
      house.occupiedNights += nights;
      house.revenueCents += rangedRevenue;
    }

    let pendingPaymentCount = 0;
    let cancelledCount = 0;
    let expiredHoldCount = 0;
    let rebookCount = 0;
    for (const row of pipeline) {
      if (row.rebookOfId !== null) {
        rebookCount += 1;
      }
      const bucket = classifyPipelineRow(row.kind, row.status);
      if (bucket === 'pending_payment') {
        pendingPaymentCount += 1;
      }
      if (bucket === 'cancelled') {
        cancelledCount += 1;
      }
      if (bucket === 'expired') {
        expiredHoldCount += 1;
      }
      for (const date of dates) {
        if (!stayOccupiesDate(row.checkIn, row.checkOut, date)) {
          continue;
        }
        const point = dailyMap.get(date);
        if (point === undefined) {
          continue;
        }
        if (bucket === 'pending_payment') {
          point.pendingCount += 1;
        }
        if (bucket === 'cancelled') {
          point.cancelledCount += 1;
        }
      }
    }

    const firstProperty = [...byProperty.values()][0];
    return {
      from: query.from,
      to: query.to,
      asOfDate,
      propertyId,
      currencyCode: firstProperty?.currencyCode ?? 'EUR',
      houseCount,
      availableNights,
      reservationCount: stays.length,
      occupiedNights,
      revenueCents,
      averageNightlyCents: occupiedNights === 0 ? 0 : Math.round(revenueCents / occupiedNights),
      occupancyPercent: availableNights === 0 ? 0 : Math.round((occupiedNights / availableNights) * 1000) / 10,
      upcomingStayCount: stays.filter((stay: StaffReservation): boolean => isUpcomingArrival(stay, asOfDate)).length,
      inHouseStayCount: stays.filter((stay: StaffReservation): boolean => isInHouseNow(stay, asOfDate)).length,
      guestCount,
      propertyBookedCount: uniquePropertyCount(stays),
      pendingPaymentCount,
      cancelledCount,
      rebookCount,
      expiredHoldCount,
      pipeline,
      properties: [...byProperty.values()],
      daily: dates.map((date: string): ReportSeriesPoint => dailyMap.get(date) ?? {
        date,
        revenueCents: 0,
        occupiedNights: 0,
        stayCount: 0,
        pendingCount: 0,
        cancelledCount: 0,
      }),
      paymentMethods: [...paymentMap.values()],
      stays,
    };
  }

  /**
   * Live cancellation / rebook settings from Postgres.
   */
  public listConfig(): Promise<PropertyBookingConfig[]> {
    return this.reservations.listBookingConfig();
  }

  /**
   * The property's CURRENT policy, to save with a new booking. The booking keeps this copy, so later
   * edits to the ladder never change what that guest was promised.
   */
  public async getPolicySnapshot(propertyId: string): Promise<PolicySnapshot> {
    const snapshot = await this.reservations.getPolicySnapshot(propertyId);
    if (snapshot === null) {
      throw new NotFoundException({ message: 'Property not found', code: 'PROPERTY_NOT_FOUND' });
    }
    return snapshot;
  }

  /**
   * What a guest may read about cancelling and changing dates for a published property.
   * Unpublished properties are a 404, and nothing internal is exposed.
   */
  public async getPublicPolicy(slug: string): Promise<CancellationPolicy> {
    const property = await this.properties.getPublishedProperty(slug);
    const config = await this.reservations.getBookingConfig(property.id);
    if (config === null) {
      throw new NotFoundException({ message: 'Property not found', code: 'PROPERTY_NOT_FOUND' });
    }
    return {
      propertyId: property.id,
      tiers: config.tiers
        .map((tier): CancellationPolicyTier => ({
          minDaysBeforeCheckIn: tier.minDaysBeforeCheckIn,
          refundPercent: tier.refundPercent,
        }))
        .sort((a, b): number => b.minDaysBeforeCheckIn - a.minDaysBeforeCheckIn),
      rebookable: config.rebookable,
      rebookFeeType: config.rebookFeeType,
      rebookFeeValue: config.rebookFeeValue,
    };
  }

  /**
   * One property's ladder (staff editor).
   */
  public async getConfig(propertyId: string): Promise<PropertyBookingConfig> {
    const config = await this.reservations.getBookingConfig(propertyId);
    if (config === null) {
      throw new NotFoundException({ message: 'Property not found', code: 'PROPERTY_NOT_FOUND' });
    }
    return config;
  }

  /**
   * Staff save. Code only stores and later calculates; it does not own the percents.
   */
  public async saveConfig(
    propertyId: string,
    input: SavePropertyBookingConfigRequest,
  ): Promise<{ config: PropertyBookingConfig; invertedWarning: boolean }> {
    const property = await this.properties.getStaffProperty(propertyId);
    const invalid = validateCancellationTiers(input.tiers);
    if (invalid !== null) {
      throw new BadRequestException({ message: invalid, code: 'INVALID_CANCELLATION_TIERS' });
    }
    const config = await this.reservations.saveBookingConfig(
      propertyId,
      property.organizationId,
      input.rebookable,
      input.rebookFeeType,
      input.rebookFeeValue,
      input.tiers,
    );
    return { config, invertedWarning: hasInvertedRefundLadder(input.tiers) };
  }

  /**
   * Staff mark check-in or check-out. Confirmed payment status stays confirmed.
   */
  public async setArrival(id: string, arrivalStatus: ArrivalStatus): Promise<StaffReservation> {
    const existing = await this.reservations.getById(id);
    if (existing === null) {
      throw new NotFoundException({ message: 'Booking not found', code: 'STAY_NOT_FOUND' });
    }
    if (existing.kind !== 'reservation' || existing.status !== 'confirmed') {
      throw new BadRequestException({
        message: 'Check-in and check-out are only for confirmed bookings',
        code: 'STAY_NOT_CONFIRMED',
      });
    }
    const updated = await this.reservations.updateArrivalStatus(id, arrivalStatus);
    if (updated === null) {
      throw new NotFoundException({ message: 'Booking not found', code: 'STAY_NOT_FOUND' });
    }
    return updated;
  }

  private assertRange(from: string, to: string): void {
    if (nightsBetween(from, to) === null) {
      throw new BadRequestException({
        message: 'Report/calendar range must have a check-out after check-in',
        code: 'INVALID_DATES',
      });
    }
  }
}
