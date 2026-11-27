/**
 * @file apps/api/src/modules/discounts/staff-promotions.controller.ts
 * @feature discounts
 * @dependencies DiscountsService, StaffGuard
 */

import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import type { ApiOkBody, Discount } from '@resort-booking/shared-types';
import { StaffGuard } from '../identity/staff.guard';
import { DiscountsService } from './discounts.service';
import { RoleGuard } from '../../shared/roles/role.guard';
import { AllowRoles } from '../../shared/roles/roles.decorator';
import { TenantGuard } from '../../shared/tenancy/tenant.guard';
import { TenantScoped } from '../../shared/tenancy/tenant-scope.decorator';

/**
 * Read-only list of a property's promotions for the New booking form, so staff can pick a coupon without opening the
 * property's Discounts tab. Admins and employees both may read it; changing a discount stays admin only
 * (`DiscountsController`). It shows what the admin already sees: names, codes, size, use counts. Nothing about guests.
 */
@Controller('staff')
@UseGuards(StaffGuard, TenantGuard, RoleGuard)
export class StaffPromotionsController {
  public constructor(private readonly discounts: DiscountsService) {}

  @Get('properties/:propertyId/promotions')
  @AllowRoles('admin', 'employee')
  @TenantScoped({ resource: 'property', from: 'param', key: 'propertyId' })
  public async list(@Param('propertyId') propertyId: string): Promise<ApiOkBody<Discount[]>> {
    return { status: 'ok', data: await this.discounts.list(propertyId) };
  }
}
