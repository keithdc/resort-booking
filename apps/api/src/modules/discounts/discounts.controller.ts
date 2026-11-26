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
import { Audited } from '../../shared/audit/audited.decorator';
import { RoleGuard } from '../../shared/roles/role.guard';
import { RequireRole } from '../../shared/roles/roles.decorator';
import { TenantGuard } from '../../shared/tenancy/tenant.guard';
import { TenantScoped } from '../../shared/tenancy/tenant-scope.decorator';

@Controller('staff')
@UseGuards(StaffGuard, TenantGuard, RoleGuard)
@RequireRole('admin')
export class DiscountsController {
  public constructor(private readonly discounts: DiscountsService) {}

  @Get('properties/:propertyId/discounts')
  @TenantScoped({ resource: 'property', from: 'param', key: 'propertyId' })
  public async list(@Param('propertyId') propertyId: string): Promise<ApiOkBody<Discount[]>> {
    return { status: 'ok', data: await this.discounts.list(propertyId) };
  }

  @Post('properties/:propertyId/discounts')
  @Audited({ action: 'discount.created', targetType: 'discount', targetFromResult: 'id' })
  @TenantScoped({ resource: 'property', from: 'param', key: 'propertyId' }, { resource: 'house', from: 'body', key: 'houseIds' })
  public async create(
    @Param('propertyId') propertyId: string,
    @Body() body: DiscountWriteDto,
  ): Promise<ApiOkBody<Discount>> {
    return { status: 'ok', data: await this.discounts.create(propertyId, body) };
  }

  @Patch('discounts/:discountId')
  @Audited({ action: 'discount.updated', targetType: 'discount', targetParam: 'discountId' })
  @TenantScoped({ resource: 'discount', from: 'param', key: 'discountId' }, { resource: 'house', from: 'body', key: 'houseIds' })
  public async update(
    @Param('discountId') discountId: string,
    @Body() body: DiscountWriteDto,
  ): Promise<ApiOkBody<Discount>> {
    return { status: 'ok', data: await this.discounts.update(discountId, body) };
  }

  @Delete('discounts/:discountId')
  @Audited({ action: 'discount.deleted', targetType: 'discount', targetParam: 'discountId' })
  @TenantScoped({ resource: 'discount', from: 'param', key: 'discountId' })
  public async remove(@Param('discountId') discountId: string): Promise<ApiOkBody<null>> {
    await this.discounts.remove(discountId);
    return { status: 'ok', data: null };
  }
}
