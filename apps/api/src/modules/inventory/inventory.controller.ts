/**
 * @file apps/api/src/modules/inventory/inventory.controller.ts
 * @feature inventory
 * @dependencies InventoryService
 */

import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import type { ApiOkBody, Hold, Quote } from '@resort-booking/shared-types';
import { CreateHoldDto } from './dto/create-hold.dto';
import { QuoteQueryDto } from './dto/quote-query.dto';
import { InventoryService } from './inventory.service';

@Controller()
export class InventoryController {
  public constructor(private readonly inventory: InventoryService) {}

  /**
   * Guest quote: API owns nights, total, and availability.
   */
  @Get('quotes')
  public async getQuote(@Query() query: QuoteQueryDto): Promise<ApiOkBody<Quote>> {
    return { status: 'ok', data: await this.inventory.getQuote(query, true) };
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
