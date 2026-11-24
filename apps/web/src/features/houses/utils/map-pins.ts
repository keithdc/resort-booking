/**
 * @file apps/web/src/features/houses/utils/map-pins.ts
 * @feature houses
 * @dependencies money, stay-query — groups API results for the map; prices come from the API
 */

import type { HouseSearchResult } from '@resort-booking/shared-types';
import { formatCents } from '@/shared/utils/money';
import { houseHref, type StayQuery } from '@/shared/utils/stay-query';

/** Stays pinned at the same place (usually every stay of one property). */
export interface MapPin {
  /** Stable id for a location. */
  key: string;
  latitude: number;
  longitude: number;
  results: HouseSearchResult[];
}

/** One stay inside a pin, ready to draw. Plain data so the map code only renders. */
export interface MapPinStayView {
  houseId: string;
  name: string;
  priceLabel: string;
  href: string;
}

/** A pin ready to draw: every stay at the place, each with its own price. */
export interface MapPinView {
  key: string;
  latitude: number;
  longitude: number;
  /** Cheapest first. */
  stays: MapPinStayView[];
}

const COORDINATE_DECIMALS = 5;

/**
 * Groups search results by location. Stays in one property share coordinates, so they would sit on
 * top of each other as separate pins; one pin per place keeps the map readable. Results without
 * usable coordinates are left out of the map (they still appear in the list).
 */
export function groupByLocation(results: readonly HouseSearchResult[]): MapPin[] {
  const pins = new Map<string, MapPin>();
  for (const result of results) {
    const { mapLatitude: latitude, mapLongitude: longitude } = result.house;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      continue;
    }
    const key = `${latitude.toFixed(COORDINATE_DECIMALS)},${longitude.toFixed(COORDINATE_DECIMALS)}`;
    const existing = pins.get(key);
    if (existing === undefined) {
      pins.set(key, { key, latitude, longitude, results: [result] });
    } else {
      existing.results.push(result);
    }
  }
  return [...pins.values()];
}

/**
 * The pin a stay belongs to, or null when it has none (no usable coordinates).
 */
export function pinKeyForHouse(pins: readonly MapPin[], houseId: string): string | null {
  return pins.find((pin): boolean => pin.results.some((result): boolean => result.house.id === houseId))?.key ?? null;
}

/**
 * Turns pins into drawable data: stays cheapest first, each with its own API price and a link that
 * keeps the guest's dates.
 */
export function toPinViews(pins: readonly MapPin[], stay: StayQuery): MapPinView[] {
  return pins.map((pin): MapPinView => {
    const ordered = [...pin.results].sort((a, b): number => a.quote.totalCents - b.quote.totalCents);
    return {
      key: pin.key,
      latitude: pin.latitude,
      longitude: pin.longitude,
      stays: ordered.map((result): MapPinStayView => ({
        houseId: result.house.id,
        name: result.house.name,
        priceLabel: formatCents(result.quote.totalCents, result.quote.currencyCode),
        href: houseHref(result.house.propertySlug, result.house.slug, stay),
      })),
    };
  });
}
