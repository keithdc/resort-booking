/**
 * @file apps/api/src/modules/discounts/offers.service.ts
 * @feature discounts
 * @dependencies DiscountsRepository, PropertyService
 */

import { Injectable } from '@nestjs/common';
import type { PromotedOffer } from '@resort-booking/shared-types';
import { isoDateInTimeZone } from '../../shared/dates/iso-date';
import { PropertyService } from '../property/property.service';
import { DiscountsRepository } from './discounts.repository';
import { buildPromotedOffers } from './promoted-offers.rules';

@Injectable()
export class OffersService {
  public constructor(
    private readonly discounts: DiscountsRepository,
    private readonly properties: PropertyService,
  ) {}

  /**
   * Offers a guest can see on a published property: three queries (property, stays, discounts), no per-offer lookups.
   * "Today" is the property's own date so a booking window opens and closes at the right midnight.
   */
  public async listForProperty(slug: string, now: Date = new Date()): Promise<PromotedOffer[]> {
    const property = await this.properties.getPublishedProperty(slug);
    const [houses, discounts] = await Promise.all([
      this.properties.listPublishedHouses(slug),
      this.discounts.listPromotedForProperty(property.id),
    ]);
    return buildPromotedOffers(discounts, houses, isoDateInTimeZone(now, property.timezone));
  }
}
