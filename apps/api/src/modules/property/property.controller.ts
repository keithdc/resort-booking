/**
 * @file apps/api/src/modules/property/property.controller.ts
 * @feature property
 * @dependencies PropertyService, StaffGuard
 */

import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type {
  ApiOkBody,
  GeocodeHit,
  HouseDetail,
  HouseRequestOption,
  HouseSummary,
  PropertyDetail,
  PropertySummary,
} from '@resort-booking/shared-types';
import { StaffGuard } from '../identity/staff.guard';
import { GeocodeQueryDto } from './dto/geocode.query.dto';
import { GeocodeReverseQueryDto } from './dto/geocode-reverse.query.dto';
import { UpsertHouseDto } from './dto/upsert-house.dto';
import { UpsertPropertyDto } from './dto/upsert-property.dto';
import { UpsertRequestOptionDto } from './dto/upsert-request-option.dto';
import { PropertyService } from './property.service';

@Controller()
export class PropertyController {
  public constructor(private readonly properties: PropertyService) {}

  @Get('properties')
  public async listProperties(): Promise<ApiOkBody<PropertySummary[]>> {
    return { status: 'ok', data: await this.properties.listPublishedProperties() };
  }

  @Get('staff/geocode/reverse')
  @UseGuards(StaffGuard)
  public async reverseGeocode(@Query() query: GeocodeReverseQueryDto): Promise<ApiOkBody<GeocodeHit | null>> {
    return { status: 'ok', data: await this.properties.reverseAddress(query.lat, query.lon) };
  }

  @Get('staff/geocode')
  @UseGuards(StaffGuard)
  public async geocode(@Query() query: GeocodeQueryDto): Promise<ApiOkBody<GeocodeHit[]>> {
    return { status: 'ok', data: await this.properties.searchAddress(query.q) };
  }

  @Get('staff/properties')
  @UseGuards(StaffGuard)
  public async listStaffProperties(): Promise<ApiOkBody<PropertySummary[]>> {
    return { status: 'ok', data: await this.properties.listStaffProperties() };
  }

  @Post('staff/properties')
  @UseGuards(StaffGuard)
  public async createStaffProperty(@Body() body: UpsertPropertyDto): Promise<ApiOkBody<PropertyDetail>> {
    return { status: 'ok', data: await this.properties.createStaffProperty(body) };
  }

  @Get('staff/properties/:propertyId')
  @UseGuards(StaffGuard)
  public async getStaffProperty(
    @Param('propertyId') propertyId: string,
  ): Promise<ApiOkBody<PropertyDetail>> {
    return { status: 'ok', data: await this.properties.getStaffProperty(propertyId) };
  }

  @Get('staff/properties/:propertyId/houses')
  @UseGuards(StaffGuard)
  public async listStaffHouses(
    @Param('propertyId') propertyId: string,
  ): Promise<ApiOkBody<HouseSummary[]>> {
    return { status: 'ok', data: await this.properties.listStaffHouses(propertyId) };
  }

  @Post('staff/properties/:propertyId/houses')
  @UseGuards(StaffGuard)
  public async createStaffHouse(
    @Param('propertyId') propertyId: string,
    @Body() body: UpsertHouseDto,
  ): Promise<ApiOkBody<HouseDetail>> {
    return { status: 'ok', data: await this.properties.createStaffHouse(propertyId, body) };
  }

  @Get('staff/houses/:houseId')
  @UseGuards(StaffGuard)
  public async getStaffHouse(@Param('houseId') houseId: string): Promise<ApiOkBody<HouseDetail>> {
    return { status: 'ok', data: await this.properties.getStaffHouse(houseId) };
  }

  @Patch('staff/houses/:houseId')
  @UseGuards(StaffGuard)
  public async updateStaffHouse(
    @Param('houseId') houseId: string,
    @Body() body: UpsertHouseDto,
  ): Promise<ApiOkBody<HouseDetail>> {
    return { status: 'ok', data: await this.properties.updateStaffHouse(houseId, body) };
  }

  @Get('staff/properties/:propertyId/request-options')
  @UseGuards(StaffGuard)
  public async listStaffRequestOptions(
    @Param('propertyId') propertyId: string,
  ): Promise<ApiOkBody<HouseRequestOption[]>> {
    return { status: 'ok', data: await this.properties.listRequestOptions(propertyId, false) };
  }

  @Post('staff/properties/:propertyId/request-options')
  @UseGuards(StaffGuard)
  public async createRequestOption(
    @Param('propertyId') propertyId: string,
    @Body() body: UpsertRequestOptionDto,
  ): Promise<ApiOkBody<HouseRequestOption>> {
    return { status: 'ok', data: await this.properties.createRequestOption(propertyId, body) };
  }

  @Patch('staff/request-options/:optionId')
  @UseGuards(StaffGuard)
  public async updateRequestOption(
    @Param('optionId') optionId: string,
    @Body() body: UpsertRequestOptionDto,
  ): Promise<ApiOkBody<HouseRequestOption>> {
    return { status: 'ok', data: await this.properties.updateRequestOption(optionId, body) };
  }

  @Delete('staff/request-options/:optionId')
  @UseGuards(StaffGuard)
  public async deleteRequestOption(
    @Param('optionId') optionId: string,
  ): Promise<ApiOkBody<{ deleted: true }>> {
    await this.properties.deleteRequestOption(optionId);
    return { status: 'ok', data: { deleted: true } };
  }

  @Patch('staff/properties/:propertyId')
  @UseGuards(StaffGuard)
  public async updateStaffProperty(
    @Param('propertyId') propertyId: string,
    @Body() body: UpsertPropertyDto,
  ): Promise<ApiOkBody<PropertyDetail>> {
    return { status: 'ok', data: await this.properties.updateStaffProperty(propertyId, body) };
  }

  @Get('properties/:slug')
  public async getProperty(@Param('slug') slug: string): Promise<ApiOkBody<PropertyDetail>> {
    return { status: 'ok', data: await this.properties.getPublishedProperty(slug) };
  }

  @Get('properties/:slug/houses')
  public async listHouses(@Param('slug') slug: string): Promise<ApiOkBody<HouseSummary[]>> {
    return { status: 'ok', data: await this.properties.listPublishedHouses(slug) };
  }

  @Get('properties/:slug/request-options')
  public async listRequestOptions(
    @Param('slug') slug: string,
  ): Promise<ApiOkBody<HouseRequestOption[]>> {
    return { status: 'ok', data: await this.properties.listPublishedRequestOptions(slug) };
  }

  @Get('properties/:slug/houses/:houseSlug')
  public async getHouse(
    @Param('slug') slug: string,
    @Param('houseSlug') houseSlug: string,
  ): Promise<ApiOkBody<HouseDetail>> {
    return { status: 'ok', data: await this.properties.getPublishedHouse(slug, houseSlug) };
  }
}
