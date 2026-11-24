/**
 * @file apps/api/src/modules/discounts/discounts.controller.ts
 * @feature discounts
 * @dependencies DiscountsService, StaffGuard
 */

import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import type { ApiOkBody, Discount } from '@resort-booking/shared-types';
import { StaffGuard } from '../identity/staff.guard';
import { DiscountWriteDto } from './dto/discount-write.dto';
import { DiscountsService } from './discounts.service';

@Controller('staff')
@UseGuards(StaffGuard)
export class DiscountsController {
  public constructor(private readonly discounts: DiscountsService) {}

  @Get('properties/:propertyId/discounts')
  public async list(@Param('propertyId') propertyId: string): Promise<ApiOkBody<Discount[]>> {
    return { status: 'ok', data: await this.discounts.list(propertyId) };
  }

  @Post('properties/:propertyId/discounts')
  public async create(
    @Param('propertyId') propertyId: string,
    @Body() body: DiscountWriteDto,
  ): Promise<ApiOkBody<Discount>> {
    return { status: 'ok', data: await this.discounts.create(propertyId, body) };
  }

  @Patch('discounts/:discountId')
  public async update(
    @Param('discountId') discountId: string,
    @Body() body: DiscountWriteDto,
  ): Promise<ApiOkBody<Discount>> {
    return { status: 'ok', data: await this.discounts.update(discountId, body) };
  }

  @Delete('discounts/:discountId')
  public async remove(@Param('discountId') discountId: string): Promise<ApiOkBody<null>> {
    await this.discounts.remove(discountId);
    return { status: 'ok', data: null };
  }
}
