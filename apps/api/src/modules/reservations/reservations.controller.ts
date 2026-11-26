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
  StaffProfile,
  StaffReservation,
} from '@resort-booking/shared-types';
import { CurrentStaff } from '../../shared/tenancy/current-staff.decorator';
import { StaffGuard } from '../identity/staff.guard';
import { SaveBookingConfigDto } from './dto/save-booking-config.dto';
import { StaffDayQueryDto } from './dto/staff-day.query.dto';
import { StaffRangeQueryDto } from './dto/staff-range.query.dto';
import { UpdateArrivalDto } from './dto/update-arrival.dto';
import { ReservationsService } from './reservations.service';
import { Audited } from '../../shared/audit/audited.decorator';
import { keepReportForAdmin, redactReportForEmployee, type RoleAwareReport } from '../../shared/roles/redact-report';
import { RoleGuard } from '../../shared/roles/role.guard';
import { AllowRoles, RequireRole } from '../../shared/roles/roles.decorator';
import { hasMoneyAccess, type StaffAccount } from '../../shared/roles/staff-role';
import { TenantGuard } from '../../shared/tenancy/tenant.guard';
import { TenantExempt, TenantScoped } from '../../shared/tenancy/tenant-scope.decorator';

@Controller('staff')
@UseGuards(StaffGuard, TenantGuard, RoleGuard)
export class ReservationsController {
  public constructor(private readonly reservations: ReservationsService) {}

  /**
   * Month occupancy for the admin calendar.
   */
  @Get('calendar')
  @AllowRoles('admin', 'employee')
  @TenantScoped({ resource: 'property', from: 'query', key: 'propertyId', optional: true })
  public async getCalendar(
    @Query() query: StaffRangeQueryDto,
    @CurrentStaff() staff: StaffProfile,
  ): Promise<ApiOkBody<StaffCalendar>> {
    return { status: 'ok', data: await this.reservations.getCalendar(query, staff.organizationId) };
  }

  /**
   * Bookings occupying a given night.
   */
  @Get('reservations')
  @AllowRoles('admin', 'employee')
  @TenantScoped({ resource: 'property', from: 'query', key: 'propertyId', optional: true })
  public async listDay(
    @Query() query: StaffDayQueryDto,
    @CurrentStaff() staff: StaffProfile,
  ): Promise<ApiOkBody<StaffReservation[]>> {
    return { status: 'ok', data: await this.reservations.listOnDate(query, staff.organizationId) };
  }

  /**
   * Occupancy and revenue rollup.
   */
  @Get('reports')
  @AllowRoles('admin', 'employee')
  @TenantScoped({ resource: 'property', from: 'query', key: 'propertyId', optional: true })
  public async getReport(
    @Query() query: StaffRangeQueryDto,
    @CurrentStaff() staff: StaffAccount,
  ): Promise<ApiOkBody<RoleAwareReport>> {
    const report = await this.reservations.getReport(query, staff.organizationId);
    // An employee without money access sees how busy the properties are, not the money (see redactReportForEmployee).
    return { status: 'ok', data: hasMoneyAccess(staff) ? keepReportForAdmin(report) : redactReportForEmployee(report) };
  }

  /**
   * Staff check-in or check-out. Confirmed stays only.
   */
  @Patch('reservations/:id/arrival')
  @Audited({ action: 'booking.arrival_changed', targetType: 'booking', targetParam: 'id' })
  @AllowRoles('admin', 'employee')
  @TenantScoped({ resource: 'booking', from: 'param', key: 'id' })
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
  @AllowRoles('admin', 'employee')
  @TenantExempt('the list is filtered by the caller organization in SQL')
  public async getConfig(@CurrentStaff() staff: StaffProfile): Promise<ApiOkBody<PropertyBookingConfig[]>> {
    return { status: 'ok', data: await this.reservations.listConfig(staff.organizationId) };
  }

  /**
   * Refund ladder for one property.
   */
  @Get('properties/:propertyId/configuration')
  @RequireRole('admin')
  @TenantScoped({ resource: 'property', from: 'param', key: 'propertyId' })
  public async getPropertyConfig(
    @Param('propertyId') propertyId: string,
  ): Promise<ApiOkBody<PropertyBookingConfig>> {
    return { status: 'ok', data: await this.reservations.getConfig(propertyId) };
  }

  /**
   * Replace that property's refund + rebook settings.
   */
  @Put('properties/:propertyId/configuration')
  @RequireRole('admin')
  @Audited({ action: 'property.configuration_updated', targetType: 'property', targetParam: 'propertyId' })
  @TenantScoped({ resource: 'property', from: 'param', key: 'propertyId' })
  public async savePropertyConfig(
    @Param('propertyId') propertyId: string,
    @Body() body: SaveBookingConfigDto,
  ): Promise<ApiOkBody<{ config: PropertyBookingConfig; invertedWarning: boolean }>> {
    return { status: 'ok', data: await this.reservations.saveConfig(propertyId, body) };
  }
}
