/**
 * @file apps/api/src/modules/property/property.service.ts
 * @feature property
 * @dependencies PropertyRepository
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import type { HouseDetail, HouseSummary, PropertyDetail, PropertySummary } from '@resort-booking/shared-types';
import { PropertyRepository } from './property.repository';

@Injectable()
export class PropertyService {
  public constructor(private readonly properties: PropertyRepository) {}

  /**
   * Guest catalog: published properties only.
   */
  public listPublishedProperties(): Promise<PropertySummary[]> {
    return this.properties.listProperties(true);
  }

  /**
   * Staff catalog: all properties.
   */
  public listStaffProperties(): Promise<PropertySummary[]> {
    return this.properties.listProperties(false);
  }

  /**
   * Guest property page.
   */
  public async getPublishedProperty(slug: string): Promise<PropertyDetail> {
    const property = await this.properties.getPropertyBySlug(slug, true);
    if (property === null) {
      throw new NotFoundException({ message: 'Property not found', code: 'PROPERTY_NOT_FOUND' });
    }
    return property;
  }

  /**
   * Published houses for a property.
   */
  public listPublishedHouses(propertySlug: string): Promise<HouseSummary[]> {
    return this.properties.listHousesByPropertySlug(propertySlug, true);
  }

  /**
   * Guest house page.
   */
  public async getPublishedHouse(propertySlug: string, houseSlug: string): Promise<HouseDetail> {
    const house = await this.properties.getHouseBySlugs(propertySlug, houseSlug, true);
    if (house === null) {
      throw new NotFoundException({ message: 'House not found', code: 'HOUSE_NOT_FOUND' });
    }
    return house;
  }
}
