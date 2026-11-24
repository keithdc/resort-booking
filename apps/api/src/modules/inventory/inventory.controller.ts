/**
 * @file apps/api/src/modules/inventory/inventory.controller.ts
 * @feature inventory
 * @dependencies InventoryService
 */

import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import type {
  ApiOkBody,
  Hold,
  HouseAvailability,
  HouseSearchResult,
  PropertyAvailability,
  Quote,
} from '@resort-booking/shared-types';
import { AvailabilityService } from './availability.service';
import {
  HouseAvailabilityQueryDto,
  PropertyAvailabilityQueryDto,
} from './dto/availability-query.dto';
import { CreateHoldDto } from './dto/create-hold.dto';
import { QuoteQueryDto } from './dto/quote-query.dto';
import { SearchQueryDto } from './dto/search-query.dto';
import { InventoryService } from './inventory.service';

@Controller()
export class InventoryController {
  public constructor(
    private readonly inventory: InventoryService,
    private readonly availability: AvailabilityService,
  ) {}

  /**
   * Guest quote: API owns nights, total, and availability.
   */
  @Get('quotes')
  public async getQuote(@Query() query: QuoteQueryDto): Promise<ApiOkBody<Quote>> {
    return { status: 'ok', data: await this.inventory.getQuote(query, true) };
  }

  /**
   * Guest stay search across one property or all properties.
   */
  @Get('search')
  public async searchStays(@Query() query: SearchQueryDto): Promise<ApiOkBody<HouseSearchResult[]>> {
    return { status: 'ok', data: await this.inventory.searchStays(query) };
  }

  /**
   * Unavailable dates for one house so guest pickers can disable them.
   */
  @Get('properties/:slug/houses/:houseSlug/availability')
  public async getHouseAvailability(
    @Param('slug') slug: string,
    @Param('houseSlug') houseSlug: string,
    @Query() query: HouseAvailabilityQueryDto,
  ): Promise<ApiOkBody<HouseAvailability>> {
    return { status: 'ok', data: await this.availability.getHouseAvailability(slug, houseSlug, query) };
  }

  /**
   * Nights when no house at the property is free.
   */
  @Get('properties/:slug/availability')
  public async getPropertyAvailability(
    @Param('slug') slug: string,
    @Query() query: PropertyAvailabilityQueryDto,
  ): Promise<ApiOkBody<PropertyAvailability>> {
    return { status: 'ok', data: await this.availability.getPropertyAvailability(slug, query) };
  }

  /**
   * Starts a house freeze. TTL depends on payment method.
   */
  @Post('holds')
  public async createHold(@Body() body: CreateHoldDto): Promise<ApiOkBody<Hold>> {
    return { status: 'ok', data: await this.inventory.createHold(body, true) };
  }

  /**
   * Reads a hold, including expired ones so the guest form can stay filled.
   */
  @Get('holds/:id')
  public async getHold(@Param('id') id: string): Promise<ApiOkBody<Hold>> {
    return { status: 'ok', data: await this.inventory.getHold(id) };
  }
}
