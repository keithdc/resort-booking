/**
 * @file apps/api/src/modules/property/property.repository.ts
 * @feature property
 * @dependencies DatabaseService
 */

import { Injectable } from '@nestjs/common';
import type {
  CreatePropertyRequest,
  HouseAmenity,
  HouseAmenityWrite,
  HouseDetail,
  HouseRequestOption,
  HouseRequestOptionWrite,
  HouseSummary,
  HouseWrite,
  Photo,
  PhotoWrite,
  PropertyDetail,
  PropertySummary,
  UpdatePropertyRequest,
} from '@resort-booking/shared-types';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../shared/database/database.service';
import { DEFAULT_CANCELLATION_TIERS } from '../reservations/reservations.rules';
import { resolveMapPoint } from './property.rules';

interface PropertyRow {
  id: string;
  organization_id: string;
  slug: string;
  name: string;
  description: string;
  address_line: string;
  city: string;
  country_code: string;
  postal_code: string;
  latitude: string;
  longitude: string;
  phone: string;
  email: string;
  published: boolean;
  timezone: string;
  custom_requests_enabled: boolean;
  cover_photo_url: string | null;
}

interface HouseRow {
  id: string;
  organization_id: string;
  property_id: string;
  property_slug: string;
  property_name: string;
  property_phone: string;
  property_email: string;
  property_latitude: string;
  property_longitude: string;
  property_address_line: string;
  property_postal_code: string;
  property_city: string;
  property_country_code: string;
  property_timezone: string;
  slug: string;
  name: string;
  description: string;
  capacity: number;
  published: boolean;
  nightly_rate_cents: number;
  currency_code: string;
  latitude: string | null;
  longitude: string | null;
  cover_photo_url: string | null;
}

interface PhotoRow {
  id: string;
  url: string;
  alt_text: string;
  sort_order: number;
}

@Injectable()
export class PropertyRepository {
  public constructor(private readonly database: DatabaseService) {}

  /**
   * Lists properties. Guest callers must pass publishedOnly true and no organization (the public catalog);
   * staff callers always pass their organization, so they only ever see their own properties.
   */
  public async listProperties(publishedOnly: boolean, organizationId: string | null = null): Promise<PropertySummary[]> {
    const result = await this.database.query<PropertyRow>(
      `
      SELECT p.*,
        (
          SELECT pp.url FROM property_photos pp
          WHERE pp.property_id = p.id
          ORDER BY pp.sort_order ASC
          LIMIT 1
        ) AS cover_photo_url
      FROM properties p
      WHERE ($1::boolean = false OR p.published = true)
        AND ($2::uuid IS NULL OR p.organization_id = $2::uuid)
      ORDER BY p.name ASC
      `,
      [publishedOnly, organizationId],
    );
    return result.rows.map(mapPropertySummary);
  }

  /**
   * Loads a property by slug.
   */
  public async getPropertyBySlug(
    slug: string,
    publishedOnly: boolean,
  ): Promise<PropertyDetail | null> {
    const result = await this.database.query<PropertyRow>(
      `
      SELECT p.*,
        (
          SELECT pp.url FROM property_photos pp
          WHERE pp.property_id = p.id
          ORDER BY pp.sort_order ASC
          LIMIT 1
        ) AS cover_photo_url
      FROM properties p
      WHERE p.slug = $1
        AND ($2::boolean = false OR p.published = true)
      `,
      [slug, publishedOnly],
    );
    const row = result.rows[0];
    if (row === undefined) {
      return null;
    }
    const photos = await this.listPropertyPhotos(row.id);
    return {
      ...mapPropertySummary(row),
      addressLine: row.address_line,
      postalCode: row.postal_code,
      photos,
    };
  }

  /**
   * Lists houses for a property slug.
   */
  public async listHousesByPropertySlug(
    propertySlug: string | null,
    publishedOnly: boolean,
  ): Promise<HouseSummary[]> {
    const result = await this.database.query<HouseRow>(
      `
      SELECT h.*, p.slug AS property_slug, p.name AS property_name,
        p.phone AS property_phone, p.email AS property_email,
        p.latitude AS property_latitude, p.longitude AS property_longitude,
        p.address_line AS property_address_line, p.postal_code AS property_postal_code, p.city AS property_city,
        p.country_code AS property_country_code, p.timezone AS property_timezone,
        (
          SELECT hp.url FROM house_photos hp
          WHERE hp.house_id = h.id
          ORDER BY hp.sort_order ASC
          LIMIT 1
        ) AS cover_photo_url
      FROM houses h
      INNER JOIN properties p ON p.id = h.property_id
      WHERE ($1::text IS NULL OR p.slug = $1)
        AND ($2::boolean = false OR (p.published = true AND h.published = true))
      ORDER BY p.name ASC, h.name ASC
      `,
      [propertySlug, publishedOnly],
    );
    return result.rows.map(mapHouseSummary);
  }

  /**
   * Loads a published or staff house by slugs.
   */
  public async getHouseBySlugs(
    propertySlug: string,
    houseSlug: string,
    publishedOnly: boolean,
  ): Promise<HouseDetail | null> {
    const result = await this.database.query<HouseRow>(
      `
      SELECT h.*, p.slug AS property_slug, p.name AS property_name,
        p.phone AS property_phone, p.email AS property_email,
        p.latitude AS property_latitude, p.longitude AS property_longitude,
        p.address_line AS property_address_line, p.postal_code AS property_postal_code, p.city AS property_city,
        p.country_code AS property_country_code, p.timezone AS property_timezone,
        (
          SELECT hp.url FROM house_photos hp
          WHERE hp.house_id = h.id
          ORDER BY hp.sort_order ASC
          LIMIT 1
        ) AS cover_photo_url
      FROM houses h
      INNER JOIN properties p ON p.id = h.property_id
      WHERE p.slug = $1 AND h.slug = $2
        AND ($3::boolean = false OR (p.published = true AND h.published = true))
      `,
      [propertySlug, houseSlug, publishedOnly],
    );
    const row = result.rows[0];
    if (row === undefined) {
      return null;
    }
    const photos = await this.listHousePhotos(row.id);
    const amenities = await this.listHouseAmenities(row.id);
    return mapHouseDetail(row, photos, amenities);
  }

  /**
   * Loads a house by id (holds and quotes).
   */
  public async getHouseById(houseId: string): Promise<HouseDetail | null> {
    const result = await this.database.query<HouseRow>(
      `
      SELECT h.*, p.slug AS property_slug, p.name AS property_name,
        p.phone AS property_phone, p.email AS property_email,
        p.latitude AS property_latitude, p.longitude AS property_longitude,
        p.address_line AS property_address_line, p.postal_code AS property_postal_code, p.city AS property_city,
        p.country_code AS property_country_code, p.timezone AS property_timezone,
        (
          SELECT hp.url FROM house_photos hp
          WHERE hp.house_id = h.id
          ORDER BY hp.sort_order ASC
          LIMIT 1
        ) AS cover_photo_url
      FROM houses h
      INNER JOIN properties p ON p.id = h.property_id
      WHERE h.id = $1
      `,
      [houseId],
    );
    const row = result.rows[0];
    if (row === undefined) {
      return null;
    }
    const photos = await this.listHousePhotos(row.id);
    const amenities = await this.listHouseAmenities(row.id);
    return mapHouseDetail(row, photos, amenities);
  }

  /**
   * Staff property by id, including unpublished.
   */
  public async getPropertyById(propertyId: string): Promise<PropertyDetail | null> {
    const result = await this.database.query<PropertyRow>(
      `
      SELECT p.*,
        (
          SELECT pp.url FROM property_photos pp
          WHERE pp.property_id = p.id
          ORDER BY pp.sort_order ASC
          LIMIT 1
        ) AS cover_photo_url
      FROM properties p
      WHERE p.id = $1
      `,
      [propertyId],
    );
    const row = result.rows[0];
    if (row === undefined) {
      return null;
    }
    const photos = await this.listPropertyPhotos(row.id);
    return {
      ...mapPropertySummary(row),
      addressLine: row.address_line,
      postalCode: row.postal_code,
      photos,
    };
  }

  /**
   * Houses for a property id (staff: unpublished included).
   */
  public async listHousesByPropertyId(propertyId: string): Promise<HouseSummary[]> {
    const result = await this.database.query<HouseRow>(
      `
      SELECT h.*, p.slug AS property_slug, p.name AS property_name,
        p.phone AS property_phone, p.email AS property_email,
        p.latitude AS property_latitude, p.longitude AS property_longitude,
        p.address_line AS property_address_line, p.postal_code AS property_postal_code, p.city AS property_city,
        p.country_code AS property_country_code, p.timezone AS property_timezone,
        (
          SELECT hp.url FROM house_photos hp
          WHERE hp.house_id = h.id
          ORDER BY hp.sort_order ASC
          LIMIT 1
        ) AS cover_photo_url
      FROM houses h
      INNER JOIN properties p ON p.id = h.property_id
      WHERE h.property_id = $1
      ORDER BY h.name ASC
      `,
      [propertyId],
    );
    return result.rows.map(mapHouseSummary);
  }

  /**
   * True when this org already uses the slug.
   */
  public async slugTaken(organizationId: string, slug: string, exceptPropertyId: string | null): Promise<boolean> {
    const result = await this.database.query<{ exists: boolean }>(
      `
      SELECT EXISTS (
        SELECT 1 FROM properties
        WHERE organization_id = $1 AND slug = $2 AND ($3::uuid IS NULL OR id <> $3)
      ) AS exists
      `,
      [organizationId, slug, exceptPropertyId],
    );
    return result.rows[0]?.exists === true;
  }

  /**
   * How many refund tiers this property has (publish gate).
   */
  public async countCancellationTiers(propertyId: string): Promise<number> {
    const result = await this.database.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM cancellation_tiers WHERE property_id = $1',
      [propertyId],
    );
    return Number.parseInt(result.rows[0]?.count ?? '0', 10);
  }

  /**
   * Inserts a property, seed refund ladder, and rebook flags in one transaction.
   */
  public async createProperty(
    organizationId: string,
    input: CreatePropertyRequest,
  ): Promise<PropertyDetail> {
    return this.database.withClient(async (client: PoolClient): Promise<PropertyDetail> => {
      await client.query('BEGIN');
      try {
        const inserted = await client.query<PropertyRow>(
          `
          INSERT INTO properties (
            organization_id, slug, name, description, address_line, city, country_code, postal_code,
            latitude, longitude, phone, email, published, timezone, custom_requests_enabled
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
          RETURNING *, NULL::text AS cover_photo_url
          `,
          [
            organizationId,
            input.slug,
            input.name,
            input.description,
            input.addressLine,
            input.city,
            input.countryCode,
            input.postalCode,
            input.latitude,
            input.longitude,
            input.phone,
            input.email,
            input.published,
            input.timezone,
            input.customRequestsEnabled,
          ],
        );
        const row = inserted.rows[0];
        if (row === undefined) {
          throw new Error('Property insert returned no row');
        }
        await client.query(
          `
          INSERT INTO property_rebook_settings (
            property_id, organization_id, rebookable, rebook_fee_type, rebook_fee_value
          ) VALUES ($1, $2, false, 'none', 0)
          `,
          [row.id, organizationId],
        );
        for (const tier of DEFAULT_CANCELLATION_TIERS) {
          await client.query(
            `
            INSERT INTO cancellation_tiers (
              organization_id, property_id, min_days_before_check_in, refund_percent
            ) VALUES ($1, $2, $3, $4)
            `,
            [organizationId, row.id, tier.minDaysBeforeCheckIn, tier.refundPercent],
          );
        }
        let sort = 0;
        for (const photo of input.photos) {
          await client.query(
            `
            INSERT INTO property_photos (organization_id, property_id, url, alt_text, sort_order)
            VALUES ($1,$2,$3,$4,$5)
            `,
            [organizationId, row.id, photo.url.trim(), photo.altText.trim(), sort],
          );
          sort += 1;
        }
        await client.query('COMMIT');
        const photos = await this.listPropertyPhotos(row.id);
        return {
          ...mapPropertySummary(row),
          addressLine: row.address_line,
          postalCode: row.postal_code,
          photos,
        };
      } catch (error: unknown) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  /**
   * Updates listing fields. Publish is allowed only when the caller already checked tiers.
   */
  public async updateProperty(propertyId: string, input: UpdatePropertyRequest): Promise<PropertyDetail | null> {
    const result = await this.database.query<PropertyRow>(
      `
      UPDATE properties SET
        slug = $2, name = $3, description = $4, address_line = $5, city = $6, country_code = $7,
        postal_code = $8, latitude = $9, longitude = $10, phone = $11, email = $12,
        published = $13, timezone = $14, custom_requests_enabled = $15
      WHERE id = $1
      RETURNING *,
        (
          SELECT pp.url FROM property_photos pp
          WHERE pp.property_id = properties.id
          ORDER BY pp.sort_order ASC
          LIMIT 1
        ) AS cover_photo_url
      `,
      [
        propertyId,
        input.slug,
        input.name,
        input.description,
        input.addressLine,
        input.city,
        input.countryCode,
        input.postalCode,
        input.latitude,
        input.longitude,
        input.phone,
        input.email,
        input.published,
        input.timezone,
        input.customRequestsEnabled,
      ],
    );
    const row = result.rows[0];
    if (row === undefined) {
      return null;
    }
    await this.replacePropertyPhotos(row.organization_id, row.id, input.photos);
    const photos = await this.listPropertyPhotos(row.id);
    return {
      ...mapPropertySummary(row),
      addressLine: row.address_line,
      postalCode: row.postal_code,
      photos,
    };
  }

  /**
   * House slug uniqueness inside one property.
   */
  public async houseSlugTaken(
    propertyId: string,
    slug: string,
    exceptHouseId: string | null,
  ): Promise<boolean> {
    const result = await this.database.query<{ exists: boolean }>(
      `
      SELECT EXISTS (
        SELECT 1 FROM houses
        WHERE property_id = $1 AND slug = $2 AND ($3::uuid IS NULL OR id <> $3)
      ) AS exists
      `,
      [propertyId, slug, exceptHouseId],
    );
    return result.rows[0]?.exists === true;
  }

  /**
   * Creates a house and its amenity list.
   */
  public async createHouse(
    organizationId: string,
    propertyId: string,
    input: HouseWrite,
  ): Promise<HouseDetail> {
    const inserted = await this.database.query<{ id: string }>(
      `
      INSERT INTO houses (
        organization_id, property_id, slug, name, description, capacity, published,
        nightly_rate_cents, currency_code
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING id
      `,
      [
        organizationId,
        propertyId,
        input.slug,
        input.name,
        input.description,
        input.capacity,
        input.published,
        input.nightlyRateCents,
        input.currencyCode,
      ],
    );
    const id = inserted.rows[0]?.id;
    if (id === undefined) {
      throw new Error('Stay insert returned no row');
    }
    await this.replaceAmenities(organizationId, propertyId, id, input.amenities);
    await this.replaceHousePhotos(organizationId, propertyId, id, input.photos);
    const house = await this.getHouseById(id);
    if (house === null) {
      throw new Error('Stay missing after insert');
    }
    return house;
  }

  /**
   * Updates a house and replaces amenities.
   */
  public async updateHouse(houseId: string, input: HouseWrite): Promise<HouseDetail | null> {
    const existing = await this.getHouseById(houseId);
    if (existing === null) {
      return null;
    }
    await this.database.query(
      `
      UPDATE houses SET
        slug = $2, name = $3, description = $4, capacity = $5, published = $6,
        nightly_rate_cents = $7, currency_code = $8
      WHERE id = $1
      `,
      [
        houseId,
        input.slug,
        input.name,
        input.description,
        input.capacity,
        input.published,
        input.nightlyRateCents,
        input.currencyCode,
      ],
    );
    await this.replaceAmenities(existing.organizationId, existing.propertyId, houseId, input.amenities);
    await this.replaceHousePhotos(existing.organizationId, existing.propertyId, houseId, input.photos);
    return this.getHouseById(houseId);
  }

  /**
   * Amenities shown on the guest house page.
   */
  public async listHouseAmenities(houseId: string): Promise<HouseAmenity[]> {
    const result = await this.database.query<{
      id: string;
      house_id: string;
      name: string;
      details: string;
    }>(
      `
      SELECT id, house_id, name, details
      FROM house_amenities
      WHERE house_id = $1
      ORDER BY sort_order ASC, name ASC
      `,
      [houseId],
    );
    return result.rows.map(
      (row): HouseAmenity => ({
        id: row.id,
        houseId: row.house_id,
        name: row.name,
        details: row.details,
      }),
    );
  }

  public async listRequestOptions(propertyId: string, publishedOnly: boolean): Promise<HouseRequestOption[]> {
    const result = await this.database.query<{
      id: string;
      organization_id: string;
      property_id: string;
      name: string;
      description: string;
      published: boolean;
    }>(
      `
      SELECT id, organization_id, property_id, name, description, published
      FROM property_request_options
      WHERE property_id = $1
        AND ($2::boolean = false OR published = true)
      ORDER BY name ASC
      `,
      [propertyId, publishedOnly],
    );
    return result.rows.map(
      (row): HouseRequestOption => ({
        id: row.id,
        organizationId: row.organization_id,
        propertyId: row.property_id,
        name: row.name,
        description: row.description,
        published: row.published,
      }),
    );
  }

  public async createRequestOption(
    organizationId: string,
    propertyId: string,
    input: HouseRequestOptionWrite,
  ): Promise<HouseRequestOption> {
    const result = await this.database.query<{
      id: string;
      organization_id: string;
      property_id: string;
      name: string;
      description: string;
      published: boolean;
    }>(
      `
      INSERT INTO property_request_options (organization_id, property_id, name, description, published)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING id, organization_id, property_id, name, description, published
      `,
      [organizationId, propertyId, input.name, input.description, input.published],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error('Request option insert returned no row');
    }
    return {
      id: row.id,
      organizationId: row.organization_id,
      propertyId: row.property_id,
      name: row.name,
      description: row.description,
      published: row.published,
    };
  }

  public async updateRequestOption(
    optionId: string,
    input: HouseRequestOptionWrite,
  ): Promise<HouseRequestOption | null> {
    const result = await this.database.query<{
      id: string;
      organization_id: string;
      property_id: string;
      name: string;
      description: string;
      published: boolean;
    }>(
      `
      UPDATE property_request_options
      SET name = $2, description = $3, published = $4
      WHERE id = $1
      RETURNING id, organization_id, property_id, name, description, published
      `,
      [optionId, input.name, input.description, input.published],
    );
    const row = result.rows[0];
    if (row === undefined) {
      return null;
    }
    return {
      id: row.id,
      organizationId: row.organization_id,
      propertyId: row.property_id,
      name: row.name,
      description: row.description,
      published: row.published,
    };
  }

  public async deleteRequestOption(optionId: string): Promise<boolean> {
    const result = await this.database.query('DELETE FROM property_request_options WHERE id = $1', [optionId]);
    return (result.rowCount ?? 0) > 0;
  }

  private async replaceAmenities(
    organizationId: string,
    propertyId: string,
    houseId: string,
    amenities: HouseAmenityWrite[],
  ): Promise<void> {
    await this.database.query('DELETE FROM house_amenities WHERE house_id = $1', [houseId]);
    let sort = 0;
    for (const amenity of amenities) {
      await this.database.query(
        `
        INSERT INTO house_amenities (organization_id, property_id, house_id, name, details, sort_order)
        VALUES ($1,$2,$3,$4,$5,$6)
        `,
        [organizationId, propertyId, houseId, amenity.name.trim(), amenity.details.trim(), sort],
      );
      sort += 1;
    }
  }

  private async replacePropertyPhotos(
    organizationId: string,
    propertyId: string,
    photos: PhotoWrite[],
  ): Promise<void> {
    await this.database.query('DELETE FROM property_photos WHERE property_id = $1', [propertyId]);
    let sort = 0;
    for (const photo of photos) {
      await this.database.query(
        `
        INSERT INTO property_photos (organization_id, property_id, url, alt_text, sort_order)
        VALUES ($1,$2,$3,$4,$5)
        `,
        [organizationId, propertyId, photo.url.trim(), photo.altText.trim(), sort],
      );
      sort += 1;
    }
  }

  private async replaceHousePhotos(
    organizationId: string,
    propertyId: string,
    houseId: string,
    photos: PhotoWrite[],
  ): Promise<void> {
    await this.database.query('DELETE FROM house_photos WHERE house_id = $1', [houseId]);
    let sort = 0;
    for (const photo of photos) {
      await this.database.query(
        `
        INSERT INTO house_photos (organization_id, property_id, house_id, url, alt_text, sort_order)
        VALUES ($1,$2,$3,$4,$5,$6)
        `,
        [organizationId, propertyId, houseId, photo.url.trim(), photo.altText.trim(), sort],
      );
      sort += 1;
    }
  }

  private async listPropertyPhotos(propertyId: string): Promise<Photo[]> {
    const result = await this.database.query<PhotoRow>(
      `
      SELECT id, url, alt_text, sort_order
      FROM property_photos
      WHERE property_id = $1
      ORDER BY sort_order ASC
      `,
      [propertyId],
    );
    return result.rows.map(mapPhoto);
  }

  private async listHousePhotos(houseId: string): Promise<Photo[]> {
    const result = await this.database.query<PhotoRow>(
      `
      SELECT id, url, alt_text, sort_order
      FROM house_photos
      WHERE house_id = $1
      ORDER BY sort_order ASC
      `,
      [houseId],
    );
    return result.rows.map(mapPhoto);
  }
}

function mapPhoto(row: PhotoRow): Photo {
  return {
    id: row.id,
    url: row.url,
    altText: row.alt_text,
    sortOrder: row.sort_order,
  };
}

function mapPropertySummary(row: PropertyRow): PropertySummary {
  return {
    id: row.id,
    organizationId: row.organization_id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    city: row.city,
    countryCode: row.country_code,
    latitude: Number.parseFloat(row.latitude),
    longitude: Number.parseFloat(row.longitude),
    phone: row.phone,
    email: row.email,
    published: row.published,
    timezone: row.timezone,
    coverPhotoUrl: row.cover_photo_url,
    customRequestsEnabled: row.custom_requests_enabled,
    addressLine: row.address_line,
    postalCode: row.postal_code,
  };
}

function mapHouseSummary(row: HouseRow): HouseSummary {
  const point = resolveMapPoint(row.latitude, row.longitude, row.property_latitude, row.property_longitude);
  return {
    id: row.id,
    organizationId: row.organization_id,
    propertyId: row.property_id,
    propertySlug: row.property_slug,
    propertyName: row.property_name,
    propertyCity: row.property_city,
    propertyCountryCode: row.property_country_code,
    propertyTimezone: row.property_timezone,
    propertyAddressLine: row.property_address_line,
    propertyPostalCode: row.property_postal_code,
    slug: row.slug,
    name: row.name,
    description: row.description,
    capacity: row.capacity,
    published: row.published,
    nightlyRateCents: row.nightly_rate_cents,
    currencyCode: row.currency_code,
    coverPhotoUrl: row.cover_photo_url,
    mapLatitude: point.latitude,
    mapLongitude: point.longitude,
  };
}

function mapHouseDetail(row: HouseRow, photos: Photo[], amenities: HouseAmenity[]): HouseDetail {
  return {
    ...mapHouseSummary(row),
    latitude: row.latitude === null ? null : Number.parseFloat(row.latitude),
    longitude: row.longitude === null ? null : Number.parseFloat(row.longitude),
    photos,
    amenities,
    propertyPhone: row.property_phone,
    propertyEmail: row.property_email,
    propertyLatitude: Number.parseFloat(row.property_latitude),
    propertyLongitude: Number.parseFloat(row.property_longitude),
  };
}
