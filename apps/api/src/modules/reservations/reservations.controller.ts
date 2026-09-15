/**
 * @file apps/api/src/modules/reservations/reservations.controller.ts
 * @feature reservations
 * @dependencies ReservationsService, StaffGuard
 */

import { Body, Controller, Get, Param, Patch, Put, Query, UseGuards } from '@nestjs/common';
import type {
  ApiOkBody,
  PropertyBookingConfig,
  StaffCalendar,
  StaffReport,
  StaffReservation,
} from '@resort-booking/shared-types';
import { StaffGuard } from '../identity/staff.guard';
import { SaveBookingConfigDto } from './dto/save-booking-config.dto';
import { StaffDayQueryDto } from './dto/staff-day.query.dto';
import { StaffRangeQueryDto } from './dto/staff-range.query.dto';
import { UpdateArrivalDto } from './dto/update-arrival.dto';
import { ReservationsService } from './reservations.service';

@Controller('staff')
@UseGuards(StaffGuard)
export class ReservationsController {
  public constructor(private readonly reservations: ReservationsService) {}

  /**
   * Month occupancy for the admin calendar.
   */
  @Get('calendar')
  public async getCalendar(@Query() query: StaffRangeQueryDto): Promise<ApiOkBody<StaffCalendar>> {
    return { status: 'ok', data: await this.reservations.getCalendar(query) };
  }

  /**
   * Bookings occupying a given night.
   */
  @Get('reservations')
  public async listDay(@Query() query: StaffDayQueryDto): Promise<ApiOkBody<StaffReservation[]>> {
    return { status: 'ok', data: await this.reservations.listOnDate(query) };
  }

  /**
   * Occupancy and revenue rollup.
   */
  @Get('reports')
  public async getReport(@Query() query: StaffRangeQueryDto): Promise<ApiOkBody<StaffReport>> {
    return { status: 'ok', data: await this.reservations.getReport(query) };
  }

  /**
   * Staff check-in or check-out. Confirmed stays only.
   */
  @Patch('reservations/:id/arrival')
  public async setArrival(
    @Param('id') id: string,
    @Body() body: UpdateArrivalDto,
  ): Promise<ApiOkBody<StaffReservation>> {
    return { status: 'ok', data: await this.reservations.setArrival(id, body.arrivalStatus) };
  }

  /**
   * Cancellation ladder and rebook flags (API calculates refunds later).
   */
  @Get('configuration')
  public async getConfig(): Promise<ApiOkBody<PropertyBookingConfig[]>> {
    return { status: 'ok', data: await this.reservations.listConfig() };
  }

  /**
   * Refund ladder for one property.
   */
  @Get('properties/:propertyId/configuration')
  public async getPropertyConfig(
    @Param('propertyId') propertyId: string,
  ): Promise<ApiOkBody<PropertyBookingConfig>> {
    return { status: 'ok', data: await this.reservations.getConfig(propertyId) };
  }

  /**
   * Replace that property's refund + rebook settings.
   */
  @Put('properties/:propertyId/configuration')
  public async savePropertyConfig(
    @Param('propertyId') propertyId: string,
    @Body() body: SaveBookingConfigDto,
  ): Promise<ApiOkBody<{ config: PropertyBookingConfig; invertedWarning: boolean }>> {
    return { status: 'ok', data: await this.reservations.saveConfig(propertyId, body) };
  }
}
