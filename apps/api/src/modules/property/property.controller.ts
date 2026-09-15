/**
 * @file apps/api/src/modules/property/property.controller.ts
 * @feature property
 * @dependencies PropertyService, StaffGuard
 */

import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import type { ApiOkBody, HouseDetail, HouseSummary, PropertyDetail, PropertySummary } from '@resort-booking/shared-types';
import { StaffGuard } from '../identity/staff.guard';
import { PropertyService } from './property.service';

@Controller()
export class PropertyController {
  public constructor(private readonly properties: PropertyService) {}

  /**
   * Published properties for the guest site.
   */
  @Get('properties')
  public async listProperties(): Promise<ApiOkBody<PropertySummary[]>> {
    return { status: 'ok', data: await this.properties.listPublishedProperties() };
  }

  /**
   * Staff property list (includes unpublished).
   */
  @Get('staff/properties')
  @UseGuards(StaffGuard)
  public async listStaffProperties(): Promise<ApiOkBody<PropertySummary[]>> {
    return { status: 'ok', data: await this.properties.listStaffProperties() };
  }

  /**
   * Published property by slug.
   */
  @Get('properties/:slug')
  public async getProperty(@Param('slug') slug: string): Promise<ApiOkBody<PropertyDetail>> {
    return { status: 'ok', data: await this.properties.getPublishedProperty(slug) };
  }

  /**
   * Published houses at a property.
   */
  @Get('properties/:slug/houses')
  public async listHouses(@Param('slug') slug: string): Promise<ApiOkBody<HouseSummary[]>> {
    return { status: 'ok', data: await this.properties.listPublishedHouses(slug) };
  }

  /**
   * Published house page payload.
   */
  @Get('properties/:slug/houses/:houseSlug')
  public async getHouse(
    @Param('slug') slug: string,
    @Param('houseSlug') houseSlug: string,
  ): Promise<ApiOkBody<HouseDetail>> {
    return { status: 'ok', data: await this.properties.getPublishedHouse(slug, houseSlug) };
  }
}
