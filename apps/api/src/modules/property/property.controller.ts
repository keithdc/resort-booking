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
  StaffProfile,
} from '@resort-booking/shared-types';
import { PublicRateLimit } from '../../shared/http/public-rate-limit';
import { CurrentStaff } from '../../shared/tenancy/current-staff.decorator';
import { StaffGuard } from '../identity/staff.guard';
import { GeocodeLimiter } from './geocode-limiter';
import { GeocodeQueryDto } from './dto/geocode.query.dto';
import { GeocodeReverseQueryDto } from './dto/geocode-reverse.query.dto';
import { UpsertHouseDto } from './dto/upsert-house.dto';
import { UpsertPropertyDto } from './dto/upsert-property.dto';
import { UpsertRequestOptionDto } from './dto/upsert-request-option.dto';
import { PropertyService } from './property.service';
import { Audited } from '../../shared/audit/audited.decorator';
import { RoleGuard } from '../../shared/roles/role.guard';
import { AllowRoles, RequireRole } from '../../shared/roles/roles.decorator';
import { TenantGuard } from '../../shared/tenancy/tenant.guard';
import { TenantExempt, TenantScoped } from '../../shared/tenancy/tenant-scope.decorator';

@Controller()
export class PropertyController {
  public constructor(
    private readonly properties: PropertyService,
    private readonly geocodeLimiter: GeocodeLimiter,
  ) {}

  @Get('properties')
  @PublicRateLimit('read')
  public async listProperties(): Promise<ApiOkBody<PropertySummary[]>> {
    return { status: 'ok', data: await this.properties.listPublishedProperties() };
  }

  @Get('staff/geocode/reverse')
  @RequireRole('admin')
  @UseGuards(StaffGuard, RoleGuard)
  @TenantExempt('no tenant data: only forwards an address search')
  public async reverseGeocode(
    @CurrentStaff() staff: StaffProfile,
    @Query() query: GeocodeReverseQueryDto,
  ): Promise<ApiOkBody<GeocodeHit | null>> {
    await this.geocodeLimiter.check(staff.id);
    return { status: 'ok', data: await this.properties.reverseAddress(query.lat, query.lon) };
  }

  @Get('staff/geocode')
  @RequireRole('admin')
  @UseGuards(StaffGuard, RoleGuard)
  @TenantExempt('no tenant data: only forwards an address search')
  public async geocode(@CurrentStaff() staff: StaffProfile, @Query() query: GeocodeQueryDto): Promise<ApiOkBody<GeocodeHit[]>> {
    await this.geocodeLimiter.check(staff.id);
    return { status: 'ok', data: await this.properties.searchAddress(query.q) };
  }

  @Get('staff/properties')
  @AllowRoles('admin', 'employee')
  @UseGuards(StaffGuard, RoleGuard)
  @TenantExempt('the list is filtered by the caller organization in SQL')
  public async listStaffProperties(@CurrentStaff() staff: StaffProfile): Promise<ApiOkBody<PropertySummary[]>> {
    return { status: 'ok', data: await this.properties.listStaffProperties(staff.organizationId) };
  }

  @Post('staff/properties')
  @RequireRole('admin')
  @Audited({ action: 'property.created', targetType: 'property', targetFromResult: 'id' })
  @UseGuards(StaffGuard, RoleGuard)
  @TenantExempt('the property is created in the caller organization')
  public async createStaffProperty(
    @CurrentStaff() staff: StaffProfile,
    @Body() body: UpsertPropertyDto,
  ): Promise<ApiOkBody<PropertyDetail>> {
    return { status: 'ok', data: await this.properties.createStaffProperty(staff.organizationId, body) };
  }

  @Get('staff/properties/:propertyId')
  @RequireRole('admin')
  @UseGuards(StaffGuard, TenantGuard, RoleGuard)
  @TenantScoped({ resource: 'property', from: 'param', key: 'propertyId' })
  public async getStaffProperty(
    @Param('propertyId') propertyId: string,
  ): Promise<ApiOkBody<PropertyDetail>> {
    return { status: 'ok', data: await this.properties.getStaffProperty(propertyId) };
  }

  @Get('staff/properties/:propertyId/houses')
  @RequireRole('admin')
  @UseGuards(StaffGuard, TenantGuard, RoleGuard)
  @TenantScoped({ resource: 'property', from: 'param', key: 'propertyId' })
  public async listStaffHouses(
    @Param('propertyId') propertyId: string,
  ): Promise<ApiOkBody<HouseSummary[]>> {
    return { status: 'ok', data: await this.properties.listStaffHouses(propertyId) };
  }

  @Post('staff/properties/:propertyId/houses')
  @RequireRole('admin')
  @Audited({ action: 'house.created', targetType: 'house', targetFromResult: 'id' })
  @UseGuards(StaffGuard, TenantGuard, RoleGuard)
  @TenantScoped({ resource: 'property', from: 'param', key: 'propertyId' })
  public async createStaffHouse(
    @Param('propertyId') propertyId: string,
    @Body() body: UpsertHouseDto,
  ): Promise<ApiOkBody<HouseDetail>> {
    return { status: 'ok', data: await this.properties.createStaffHouse(propertyId, body) };
  }

  @Get('staff/houses/:houseId')
  @RequireRole('admin')
  @UseGuards(StaffGuard, TenantGuard, RoleGuard)
  @TenantScoped({ resource: 'house', from: 'param', key: 'houseId' })
  public async getStaffHouse(@Param('houseId') houseId: string): Promise<ApiOkBody<HouseDetail>> {
    return { status: 'ok', data: await this.properties.getStaffHouse(houseId) };
  }

  @Patch('staff/houses/:houseId')
  @RequireRole('admin')
  @Audited({ action: 'house.updated', targetType: 'house', targetParam: 'houseId' })
  @UseGuards(StaffGuard, TenantGuard, RoleGuard)
  @TenantScoped({ resource: 'house', from: 'param', key: 'houseId' })
  public async updateStaffHouse(
    @Param('houseId') houseId: string,
    @Body() body: UpsertHouseDto,
  ): Promise<ApiOkBody<HouseDetail>> {
    return { status: 'ok', data: await this.properties.updateStaffHouse(houseId, body) };
  }

  @Get('staff/properties/:propertyId/request-options')
  @RequireRole('admin')
  @UseGuards(StaffGuard, TenantGuard, RoleGuard)
  @TenantScoped({ resource: 'property', from: 'param', key: 'propertyId' })
  public async listStaffRequestOptions(
    @Param('propertyId') propertyId: string,
  ): Promise<ApiOkBody<HouseRequestOption[]>> {
    return { status: 'ok', data: await this.properties.listRequestOptions(propertyId, false) };
  }

  @Post('staff/properties/:propertyId/request-options')
  @RequireRole('admin')
  @Audited({ action: 'property.request_option_created', targetType: 'request_option', targetFromResult: 'id' })
  @UseGuards(StaffGuard, TenantGuard, RoleGuard)
  @TenantScoped({ resource: 'property', from: 'param', key: 'propertyId' })
  public async createRequestOption(
    @Param('propertyId') propertyId: string,
    @Body() body: UpsertRequestOptionDto,
  ): Promise<ApiOkBody<HouseRequestOption>> {
    return { status: 'ok', data: await this.properties.createRequestOption(propertyId, body) };
  }

  @Patch('staff/request-options/:optionId')
  @RequireRole('admin')
  @Audited({ action: 'property.request_option_updated', targetType: 'request_option', targetParam: 'optionId' })
  @UseGuards(StaffGuard, TenantGuard, RoleGuard)
  @TenantScoped({ resource: 'requestOption', from: 'param', key: 'optionId' })
  public async updateRequestOption(
    @Param('optionId') optionId: string,
    @Body() body: UpsertRequestOptionDto,
  ): Promise<ApiOkBody<HouseRequestOption>> {
    return { status: 'ok', data: await this.properties.updateRequestOption(optionId, body) };
  }

  @Delete('staff/request-options/:optionId')
  @RequireRole('admin')
  @Audited({ action: 'property.request_option_deleted', targetType: 'request_option', targetParam: 'optionId' })
  @UseGuards(StaffGuard, TenantGuard, RoleGuard)
  @TenantScoped({ resource: 'requestOption', from: 'param', key: 'optionId' })
  public async deleteRequestOption(
    @Param('optionId') optionId: string,
  ): Promise<ApiOkBody<{ deleted: true }>> {
    await this.properties.deleteRequestOption(optionId);
    return { status: 'ok', data: { deleted: true } };
  }

  @Patch('staff/properties/:propertyId')
  @RequireRole('admin')
  @Audited({ action: 'property.updated', targetType: 'property', targetParam: 'propertyId' })
  @UseGuards(StaffGuard, TenantGuard, RoleGuard)
  @TenantScoped({ resource: 'property', from: 'param', key: 'propertyId' })
  public async updateStaffProperty(
    @Param('propertyId') propertyId: string,
    @Body() body: UpsertPropertyDto,
  ): Promise<ApiOkBody<PropertyDetail>> {
    return { status: 'ok', data: await this.properties.updateStaffProperty(propertyId, body) };
  }

  @Get('properties/:slug')
  @PublicRateLimit('read')
  public async getProperty(@Param('slug') slug: string): Promise<ApiOkBody<PropertyDetail>> {
    return { status: 'ok', data: await this.properties.getPublishedProperty(slug) };
  }

  @Get('properties/:slug/houses')
  @PublicRateLimit('read')
  public async listHouses(@Param('slug') slug: string): Promise<ApiOkBody<HouseSummary[]>> {
    return { status: 'ok', data: await this.properties.listPublishedHouses(slug) };
  }

  @Get('properties/:slug/request-options')
  @PublicRateLimit('read')
  public async listRequestOptions(
    @Param('slug') slug: string,
  ): Promise<ApiOkBody<HouseRequestOption[]>> {
    return { status: 'ok', data: await this.properties.listPublishedRequestOptions(slug) };
  }

  @Get('properties/:slug/houses/:houseSlug')
  @PublicRateLimit('read')
  public async getHouse(
    @Param('slug') slug: string,
    @Param('houseSlug') houseSlug: string,
  ): Promise<ApiOkBody<HouseDetail>> {
    return { status: 'ok', data: await this.properties.getPublishedHouse(slug, houseSlug) };
  }
}
