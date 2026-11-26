/**
 * @file apps/api/src/modules/inventory/inventory.controller.ts
 * @feature inventory
 * @dependencies InventoryService
 */

import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type {
  ApiOkBody,
  Hold,
  HouseAvailability,
  HouseSearchResult,
  PropertyAvailability,
  Quote,
} from '@resort-booking/shared-types';
import type { Request } from 'express';
import { AvailabilityService } from './availability.service';
import {
  HouseAvailabilityQueryDto,
  PropertyAvailabilityQueryDto,
} from './dto/availability-query.dto';
import { CreateHoldDto } from './dto/create-hold.dto';
import { QuoteQueryDto } from './dto/quote-query.dto';
import { SearchQueryDto } from './dto/search-query.dto';
import { clientIp } from '../../shared/http/client-ip';
import { HoldRateLimiter } from './hold-rate-limiter';
import { InventoryService } from './inventory.service';
import { PromoRateLimiter } from './promo-rate-limiter';

@Controller()
export class InventoryController {
  public constructor(
    private readonly inventory: InventoryService,
    private readonly availability: AvailabilityService,
    private readonly promoLimiter: PromoRateLimiter,
    private readonly holdLimiter: HoldRateLimiter,
  ) {}

  /**
   * Guest quote: API owns nights, total, and availability.
   */
  @Get('quotes')
  public async getQuote(@Query() query: QuoteQueryDto, @Req() request: Request): Promise<ApiOkBody<Quote>> {
    await this.holdLimiter.checkBrowse(clientIp(request));
    await this.promoLimiter.check(clientIp(request), query.promoCode);
    return { status: 'ok', data: await this.inventory.getQuote(query, true) };
  }

  /**
   * Guest stay search across one property or all properties.
   */
  @Get('search')
  public async searchStays(@Query() query: SearchQueryDto, @Req() request: Request): Promise<ApiOkBody<HouseSearchResult[]>> {
    await this.holdLimiter.checkBrowse(clientIp(request));
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
    @Req() request: Request,
  ): Promise<ApiOkBody<HouseAvailability>> {
    await this.holdLimiter.checkBrowse(clientIp(request));
    return { status: 'ok', data: await this.availability.getHouseAvailability(slug, houseSlug, query) };
  }

  /**
   * Nights when no house at the property is free.
   */
  @Get('properties/:slug/availability')
  public async getPropertyAvailability(
    @Param('slug') slug: string,
    @Query() query: PropertyAvailabilityQueryDto,
    @Req() request: Request,
  ): Promise<ApiOkBody<PropertyAvailability>> {
    await this.holdLimiter.checkBrowse(clientIp(request));
    return { status: 'ok', data: await this.availability.getPropertyAvailability(slug, query) };
  }

  /**
   * Starts a house freeze. TTL depends on payment method.
   */
  @Post('holds')
  public async createHold(@Body() body: CreateHoldDto, @Req() request: Request): Promise<ApiOkBody<Hold>> {
    const ip = clientIp(request);
    await this.holdLimiter.checkHold(ip, body.bookerEmail);
    await this.promoLimiter.check(ip, body.promoCode);
    const ipHash = this.holdLimiter.hashIp(ip);
    await this.inventory.assertHoldCapacity(body.bookerEmail, ipHash, this.holdLimiter.holdCaps());
    return { status: 'ok', data: await this.inventory.createHold(body, true, { ipHash }) };
  }

  /**
   * Reads a hold, including expired ones so the guest form can stay filled.
   */
  @Get('holds/:id')
  public async getHold(@Param('id') id: string): Promise<ApiOkBody<Hold>> {
    return { status: 'ok', data: await this.inventory.getHold(id) };
  }
}
