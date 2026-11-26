/**
 * @file apps/api/src/modules/rates/rates.controller.ts
 * @feature rates
 * @dependencies RatesService, StaffGuard
 */

import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type {
  ApiOkBody,
  BulkRatePeriodPreview,
  BulkRatePeriodResult,
  RatePeriod,
} from '@resort-booking/shared-types';
import { StaffGuard, type StaffRequest } from '../identity/staff.guard';
import { BulkRatePeriodDto, RatePeriodWriteDto } from './dto/rate-period-write.dto';
import { RatesService } from './rates.service';
import { Audited } from '../../shared/audit/audited.decorator';
import { RoleGuard } from '../../shared/roles/role.guard';
import { RequireRole } from '../../shared/roles/roles.decorator';
import { TenantGuard } from '../../shared/tenancy/tenant.guard';
import { TenantScoped } from '../../shared/tenancy/tenant-scope.decorator';

@Controller('staff')
@UseGuards(StaffGuard, TenantGuard, RoleGuard)
@RequireRole('admin')
export class RatesController {
  public constructor(private readonly rates: RatesService) {}

  @Get('properties/:propertyId/rate-periods')
  @TenantScoped({ resource: 'property', from: 'param', key: 'propertyId' })
  public async listForProperty(@Param('propertyId') propertyId: string): Promise<ApiOkBody<RatePeriod[]>> {
    return { status: 'ok', data: await this.rates.listForProperty(propertyId) };
  }

  @Get('houses/:houseId/rate-periods')
  @TenantScoped({ resource: 'house', from: 'param', key: 'houseId' })
  public async list(@Param('houseId') houseId: string): Promise<ApiOkBody<RatePeriod[]>> {
    return { status: 'ok', data: await this.rates.list(houseId) };
  }

  @Post('houses/:houseId/rate-periods')
  @Audited({ action: 'rate.created', targetType: 'rate_period', targetFromResult: 'id' })
  @TenantScoped({ resource: 'house', from: 'param', key: 'houseId' })
  public async create(
    @Param('houseId') houseId: string,
    @Body() body: RatePeriodWriteDto,
  ): Promise<ApiOkBody<RatePeriod>> {
    return { status: 'ok', data: await this.rates.create(houseId, body) };
  }

  @Patch('rate-periods/:periodId')
  @Audited({ action: 'rate.updated', targetType: 'rate_period', targetParam: 'periodId' })
  @TenantScoped({ resource: 'ratePeriod', from: 'param', key: 'periodId' })
  public async update(
    @Param('periodId') periodId: string,
    @Body() body: RatePeriodWriteDto,
  ): Promise<ApiOkBody<RatePeriod>> {
    return { status: 'ok', data: await this.rates.update(periodId, body) };
  }

  @Delete('rate-periods/:periodId')
  @Audited({ action: 'rate.deleted', targetType: 'rate_period', targetParam: 'periodId' })
  @TenantScoped({ resource: 'ratePeriod', from: 'param', key: 'periodId' })
  public async remove(@Param('periodId') periodId: string): Promise<ApiOkBody<null>> {
    await this.rates.remove(periodId);
    return { status: 'ok', data: null };
  }

  /**
   * Dry run of "apply to several houses". Writes nothing.
   */
  @Post('properties/:propertyId/rate-periods/bulk/preview')
  @TenantScoped({ resource: 'property', from: 'param', key: 'propertyId' }, { resource: 'house', from: 'body', key: 'houseIds' })
  public async previewBulk(
    @Param('propertyId') propertyId: string,
    @Body() body: BulkRatePeriodDto,
  ): Promise<ApiOkBody<BulkRatePeriodPreview>> {
    return { status: 'ok', data: await this.rates.previewBulk(propertyId, body) };
  }

  /**
   * Applies to every house without a clash. Requires `confirmed: true`.
   */
  @Post('properties/:propertyId/rate-periods/bulk')
  @Audited({ action: 'rate.bulk_applied', targetType: 'property', targetParam: 'propertyId' })
  @TenantScoped({ resource: 'property', from: 'param', key: 'propertyId' }, { resource: 'house', from: 'body', key: 'houseIds' })
  public async applyBulk(
    @Param('propertyId') propertyId: string,
    @Body() body: BulkRatePeriodDto,
    @Req() request: StaffRequest,
  ): Promise<ApiOkBody<BulkRatePeriodResult>> {
    return { status: 'ok', data: await this.rates.applyBulk(propertyId, body, request.staff) };
  }
}
