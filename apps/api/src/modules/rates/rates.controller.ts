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

@Controller('staff')
@UseGuards(StaffGuard)
export class RatesController {
  public constructor(private readonly rates: RatesService) {}

  @Get('properties/:propertyId/rate-periods')
  public async listForProperty(@Param('propertyId') propertyId: string): Promise<ApiOkBody<RatePeriod[]>> {
    return { status: 'ok', data: await this.rates.listForProperty(propertyId) };
  }

  @Get('houses/:houseId/rate-periods')
  public async list(@Param('houseId') houseId: string): Promise<ApiOkBody<RatePeriod[]>> {
    return { status: 'ok', data: await this.rates.list(houseId) };
  }

  @Post('houses/:houseId/rate-periods')
  public async create(
    @Param('houseId') houseId: string,
    @Body() body: RatePeriodWriteDto,
  ): Promise<ApiOkBody<RatePeriod>> {
    return { status: 'ok', data: await this.rates.create(houseId, body) };
  }

  @Patch('rate-periods/:periodId')
  public async update(
    @Param('periodId') periodId: string,
    @Body() body: RatePeriodWriteDto,
  ): Promise<ApiOkBody<RatePeriod>> {
    return { status: 'ok', data: await this.rates.update(periodId, body) };
  }

  @Delete('rate-periods/:periodId')
  public async remove(@Param('periodId') periodId: string): Promise<ApiOkBody<null>> {
    await this.rates.remove(periodId);
    return { status: 'ok', data: null };
  }

  /**
   * Dry run of "apply to several houses". Writes nothing.
   */
  @Post('properties/:propertyId/rate-periods/bulk/preview')
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
  public async applyBulk(
    @Param('propertyId') propertyId: string,
    @Body() body: BulkRatePeriodDto,
    @Req() request: StaffRequest,
  ): Promise<ApiOkBody<BulkRatePeriodResult>> {
    return { status: 'ok', data: await this.rates.applyBulk(propertyId, body, request.staff) };
  }
}
