/**
 * @file apps/api/src/modules/property/property.service.ts
 * @feature property
 * @dependencies PropertyRepository, GeocodeService
 */

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreatePropertyRequest,
  GeocodeHit,
  HouseDetail,
  HouseRequestOption,
  HouseRequestOptionWrite,
  HouseSummary,
  HouseWrite,
  PropertyDetail,
  PropertySummary,
  UpdatePropertyRequest,
} from '@resort-booking/shared-types';
import { GeocodeService } from './geocode.service';
import { PropertyRepository } from './property.repository';
import { slugifyPropertyName } from './property.rules';

@Injectable()
export class PropertyService {
  public constructor(
    private readonly properties: PropertyRepository,
    private readonly geocode: GeocodeService,
  ) {}

  /**
   * Guest catalog: published properties only.
   */
  public listPublishedProperties(): Promise<PropertySummary[]> {
    return this.properties.listProperties(true);
  }

  /**
   * Staff catalog: every property of the caller's organization (and no other).
   */
  public listStaffProperties(organizationId: string): Promise<PropertySummary[]> {
    return this.properties.listProperties(false, organizationId);
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
   * Staff property editor payload.
   */
  public async getStaffProperty(propertyId: string): Promise<PropertyDetail> {
    const property = await this.properties.getPropertyById(propertyId);
    if (property === null) {
      throw new NotFoundException({ message: 'Property not found', code: 'PROPERTY_NOT_FOUND' });
    }
    return property;
  }

  /**
   * Houses for staff at one property (past unpublished included).
   */
  public async listStaffHouses(propertyId: string): Promise<HouseSummary[]> {
    await this.getStaffProperty(propertyId);
    return this.properties.listHousesByPropertyId(propertyId);
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
      throw new NotFoundException({ message: 'Stay not found', code: 'HOUSE_NOT_FOUND' });
    }
    return house;
  }

  /**
   * Adds a property under the caller's organization and seeds a refund ladder.
   */
  public async createStaffProperty(organizationId: string, input: CreatePropertyRequest): Promise<PropertyDetail> {
    const slug =
      input.slug === ''
        ? await this.derivedSlug(slugifyPropertyName(input.name))
        : await this.requireFreeSlug(input.slug, null);
    if (input.published) {
      throw new BadRequestException({
        message: 'New properties start unpublished until listing and refunds are reviewed',
        code: 'PROPERTY_PUBLISH_ON_CREATE',
      });
    }
    return this.guardSlugRace(() => this.properties.createProperty(organizationId, { ...input, slug, published: false }));
  }

  /**
   * Updates listing fields. Cannot publish without a cancellation ladder.
   */
  public async updateStaffProperty(propertyId: string, input: UpdatePropertyRequest): Promise<PropertyDetail> {
    await this.getStaffProperty(propertyId); // 404 when it is not there
    const slug = await this.requireFreeSlug(input.slug, propertyId);
    if (input.published) {
      const tiers = await this.properties.countCancellationTiers(propertyId);
      if (tiers === 0) {
        throw new BadRequestException({
          message: 'Cannot publish a property with zero cancellation tiers',
          code: 'MISSING_CANCELLATION_TIERS',
        });
      }
    }
    const updated = await this.guardSlugRace(() => this.properties.updateProperty(propertyId, { ...input, slug }));
    if (updated === null) {
      throw new NotFoundException({ message: 'Property not found', code: 'PROPERTY_NOT_FOUND' });
    }
    return updated;
  }

  /**
   * OSM address search for staff map pins.
   */
  public searchAddress(query: string): Promise<GeocodeHit[]> {
    return this.geocode.search(query);
  }

  /**
   * Fills street fields after staff place a pin.
   */
  public reverseAddress(latitude: number, longitude: number): Promise<GeocodeHit | null> {
    return this.geocode.reverse(latitude, longitude);
  }

  /**
   * Staff house editor.
   */
  public async getStaffHouse(houseId: string): Promise<HouseDetail> {
    const house = await this.properties.getHouseById(houseId);
    if (house === null) {
      throw new NotFoundException({ message: 'Stay not found', code: 'HOUSE_NOT_FOUND' });
    }
    return house;
  }

  /**
   * Adds a house under a property.
   */
  public async createStaffHouse(propertyId: string, input: HouseWrite): Promise<HouseDetail> {
    const property = await this.getStaffProperty(propertyId);
    const slug = await this.uniqueHouseSlug(propertyId, input.slug === '' ? slugifyPropertyName(input.name) : input.slug, null);
    return this.properties.createHouse(property.organizationId, propertyId, { ...input, slug });
  }

  /**
   * Updates a house and its mattress/pillow (amenity) list.
   */
  public async updateStaffHouse(houseId: string, input: HouseWrite): Promise<HouseDetail> {
    const existing = await this.getStaffHouse(houseId);
    const slug = await this.uniqueHouseSlug(
      existing.propertyId,
      input.slug,
      houseId,
    );
    const updated = await this.properties.updateHouse(houseId, { ...input, slug });
    if (updated === null) {
      throw new NotFoundException({ message: 'Stay not found', code: 'HOUSE_NOT_FOUND' });
    }
    return updated;
  }

  public listRequestOptions(propertyId: string, publishedOnly: boolean): Promise<HouseRequestOption[]> {
    return this.properties.listRequestOptions(propertyId, publishedOnly);
  }

  public async listPublishedRequestOptions(propertySlug: string): Promise<HouseRequestOption[]> {
    const property = await this.getPublishedProperty(propertySlug);
    return this.properties.listRequestOptions(property.id, true);
  }

  public async createRequestOption(propertyId: string, input: HouseRequestOptionWrite): Promise<HouseRequestOption> {
    const property = await this.getStaffProperty(propertyId);
    return this.properties.createRequestOption(property.organizationId, propertyId, input);
  }

  public async updateRequestOption(optionId: string, input: HouseRequestOptionWrite): Promise<HouseRequestOption> {
    const updated = await this.properties.updateRequestOption(optionId, input);
    if (updated === null) {
      throw new NotFoundException({ message: 'Request option not found', code: 'REQUEST_OPTION_NOT_FOUND' });
    }
    return updated;
  }

  public async deleteRequestOption(optionId: string): Promise<void> {
    const deleted = await this.properties.deleteRequestOption(optionId);
    if (!deleted) {
      throw new NotFoundException({ message: 'Request option not found', code: 'REQUEST_OPTION_NOT_FOUND' });
    }
  }

  private async uniqueHouseSlug(
    propertyId: string,
    slug: string,
    exceptHouseId: string | null,
  ): Promise<string> {
    const base = slug === '' ? 'house' : slug;
    if (!(await this.properties.houseSlugTaken(propertyId, base, exceptHouseId))) {
      return base;
    }
    return `${base}-${Date.now().toString(36)}`;
  }

  /**
   * The slug the staff member typed, when no other property anywhere uses it. A taken slug is a 409 they can fix by
   * typing another one: silently changing a public address would be worse.
   */
  private async requireFreeSlug(slug: string, exceptPropertyId: string | null): Promise<string> {
    if (await this.properties.slugTaken(slug, exceptPropertyId)) {
      throw this.slugTakenError();
    }
    return slug;
  }

  /** A slug made from the name: when it is taken, a short unique suffix is added so the name still works. */
  private async derivedSlug(slug: string): Promise<string> {
    const base = slug === '' ? 'property' : slug;
    if (!(await this.properties.slugTaken(base, null))) {
      return base;
    }
    return `${base}-${Date.now().toString(36)}`;
  }

  /** Two requests can pass the check together; the database index then refuses the second, and it gets the same 409. */
  private async guardSlugRace<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error: unknown) {
      if (isSlugViolation(error)) {
        throw this.slugTakenError();
      }
      throw error;
    }
  }

  private slugTakenError(): ConflictException {
    return new ConflictException({
      message: 'That web address is already used by another property. Please choose a different one.',
      code: 'SLUG_TAKEN',
    });
  }
}

/** True for the database's unique-violation on a property slug (per organization or global). */
export function isSlugViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const candidate = error as { code?: unknown; constraint?: unknown };
  return (
    candidate.code === '23505' &&
    (candidate.constraint === 'properties_slug_lower_key' || candidate.constraint === 'properties_organization_id_slug_key')
  );
}
