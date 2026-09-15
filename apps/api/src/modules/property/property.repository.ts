/**
 * @file apps/api/src/modules/property/property.repository.ts
 * @feature property
 * @dependencies DatabaseService
 */

import { Injectable } from '@nestjs/common';
import type { HouseDetail, HouseSummary, Photo, PropertyDetail, PropertySummary } from '@resort-booking/shared-types';
import { DatabaseService } from '../../shared/database/database.service';

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
  property_city: string;
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
   * Lists properties. Guest callers must pass publishedOnly true.
   */
  public async listProperties(publishedOnly: boolean): Promise<PropertySummary[]> {
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
      ORDER BY p.name ASC
      `,
      [publishedOnly],
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
    propertySlug: string,
    publishedOnly: boolean,
  ): Promise<HouseSummary[]> {
    const result = await this.database.query<HouseRow>(
      `
      SELECT h.*, p.slug AS property_slug, p.name AS property_name,
        p.phone AS property_phone, p.email AS property_email,
        p.latitude AS property_latitude, p.longitude AS property_longitude,
        p.address_line AS property_address_line, p.city AS property_city,
        (
          SELECT hp.url FROM house_photos hp
          WHERE hp.house_id = h.id
          ORDER BY hp.sort_order ASC
          LIMIT 1
        ) AS cover_photo_url
      FROM houses h
      INNER JOIN properties p ON p.id = h.property_id
      WHERE p.slug = $1
        AND ($2::boolean = false OR (p.published = true AND h.published = true))
      ORDER BY h.name ASC
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
        p.address_line AS property_address_line, p.city AS property_city,
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
    return mapHouseDetail(row, photos);
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
        p.address_line AS property_address_line, p.city AS property_city,
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
    return mapHouseDetail(row, photos);
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
  };
}

function mapHouseSummary(row: HouseRow): HouseSummary {
  return {
    id: row.id,
    organizationId: row.organization_id,
    propertyId: row.property_id,
    propertySlug: row.property_slug,
    slug: row.slug,
    name: row.name,
    description: row.description,
    capacity: row.capacity,
    published: row.published,
    nightlyRateCents: row.nightly_rate_cents,
    currencyCode: row.currency_code,
    coverPhotoUrl: row.cover_photo_url,
  };
}

function mapHouseDetail(row: HouseRow, photos: Photo[]): HouseDetail {
  return {
    ...mapHouseSummary(row),
    latitude: row.latitude === null ? null : Number.parseFloat(row.latitude),
    longitude: row.longitude === null ? null : Number.parseFloat(row.longitude),
    photos,
    propertyName: row.property_name,
    propertyPhone: row.property_phone,
    propertyEmail: row.property_email,
    propertyLatitude: Number.parseFloat(row.property_latitude),
    propertyLongitude: Number.parseFloat(row.property_longitude),
    propertyAddressLine: row.property_address_line,
    propertyCity: row.property_city,
  };
}
