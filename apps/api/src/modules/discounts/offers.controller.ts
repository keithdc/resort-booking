/**
 * @file apps/api/src/modules/discounts/offers.controller.ts
 * @feature discounts
 * @dependencies OffersService
 */

import { Controller, Get, Param } from '@nestjs/common';
import type { ApiOkBody, PromotedOffer } from '@resort-booking/shared-types';
import { OffersService } from './offers.service';

@Controller()
export class OffersController {
  public constructor(private readonly offers: OffersService) {}

  /**
   * Public: the discounts staff chose to advertise at a published property. No codes, no internals.
   */
  @Get('properties/:slug/offers')
  public async list(@Param('slug') slug: string): Promise<ApiOkBody<PromotedOffer[]>> {
    return { status: 'ok', data: await this.offers.listForProperty(slug) };
  }
}
