/**
 * @file apps/api/src/modules/property/geocode.service.ts
 * @feature property
 * @dependencies Photon (komoot) + Nominatim fallback — no Google SDK
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { GeocodeHit } from '@resort-booking/shared-types';
import { fetchBoundedJson } from './geocode-fetch';
import { TtlCache } from './geocode-cache';
import { mergeReverseHits } from './geocode.rules';

/** The most suggestions a search returns, whatever the upstream sends. */
export const GEOCODE_MAX_HITS = 7;
/** Longest text kept for any one field of a hit (an upstream cannot make us store or forward a huge label). */
export const GEOCODE_MAX_FIELD_LENGTH = 200;

/**
 * The User-Agent Nominatim and Photon ask for: the application and its version, and optionally where to reach the
 * operator (GEOCODE_CONTACT, for example the public URL of the site). No staff or guest data ever goes in it.
 */
export function geocodeUserAgent(contact: string | undefined): string {
  const trimmed = contact?.trim() ?? '';
  const safe = /^[\x21-\x7e]{1,100}$/.test(trimmed) ? trimmed : '';
  return safe === '' ? 'resort-booking/1.0 (booking software; address lookup)' : `resort-booking/1.0 (booking software; address lookup; ${safe})`;
}

/** Lower-cased, trimmed, single-spaced: "Rue  de Paris " and "rue de paris" are one lookup. */
export function normalizeGeocodeQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ').toLowerCase();
}

interface PhotonProperties {
  name?: string;
  housenumber?: string;
  street?: string;
  city?: string;
  district?: string;
  locality?: string;
  county?: string;
  state?: string;
  postcode?: string;
  countrycode?: string;
}

interface PhotonFeature {
  geometry?: { coordinates?: unknown };
  properties?: PhotonProperties;
}

interface NominatimAddress {
  house_number?: string;
  road?: string;
  pedestrian?: string;
  city?: string;
  town?: string;
  village?: string;
  hamlet?: string;
  suburb?: string;
  neighbourhood?: string;
  city_district?: string;
  municipality?: string;
  county?: string;
  postcode?: string;
  country_code?: string;
}

interface NominatimHit {
  lat: string;
  lon: string;
  display_name: string;
  address?: NominatimAddress;
}

@Injectable()
export class GeocodeService {
  private readonly headers: Record<string, string>;
  private readonly searches = new TtlCache<GeocodeHit[]>();
  private readonly reverses = new TtlCache<GeocodeHit>();

  public constructor(config: ConfigService) {
    this.headers = { Accept: 'application/json', 'User-Agent': geocodeUserAgent(config.get<string>('GEOCODE_CONTACT')) };
  }

  /**
   * Type-ahead for staff pins. Photon is built for autocomplete; Nominatim is the fallback. A found answer is cached for
   * a few minutes by normalised query (the upstreams are free services with a usage policy); "nothing found" is not, so
   * a hiccup is retried at once. At most GEOCODE_MAX_HITS suggestions.
   */
  public async search(query: string): Promise<GeocodeHit[]> {
    const key = normalizeGeocodeQuery(query);
    const cached = this.searches.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const photon = await this.searchPhoton(query);
    const hits = (photon.length > 0 ? photon : await this.searchNominatim(query)).slice(0, GEOCODE_MAX_HITS).map(capHit);
    if (hits.length > 0) {
      this.searches.set(key, hits);
    }
    return hits;
  }

  /**
   * Pin drop: Nominatim first (town/postcode/country), Photon fills any blanks. Cached by the point rounded to about
   * 10 m (4 decimals) when something was found.
   */
  public async reverse(latitude: number, longitude: number): Promise<GeocodeHit | null> {
    const key = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
    const cached = this.reverses.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const [nominatim, photon] = await Promise.all([
      this.reverseNominatim(latitude, longitude),
      this.reversePhoton(latitude, longitude),
    ]);
    const merged = mergeReverseHits(nominatim, photon);
    const hit = merged === null ? null : capHit(merged);
    if (hit !== null) {
      this.reverses.set(key, hit);
    }
    return hit;
  }

  private async searchPhoton(query: string): Promise<GeocodeHit[]> {
    const url = new URL('https://photon.komoot.io/api/');
    url.searchParams.set('q', query);
    url.searchParams.set('limit', '7');
    url.searchParams.set('lang', 'en');
    url.searchParams.set('lat', '46.6');
    url.searchParams.set('lon', '2.2');
    const payload = await fetchBoundedJson(url, this.headers);
    if (payload === null) {
      return [];
    }
    if (typeof payload !== 'object' || payload === null || !('features' in payload)) {
      return [];
    }
    const features = (payload as { features: unknown }).features;
    if (!Array.isArray(features)) {
      return [];
    }
    return features.filter(isPhotonFeature).map(mapPhoton).filter(isPlacedHit);
  }

  private async reversePhoton(latitude: number, longitude: number): Promise<GeocodeHit | null> {
    const url = new URL('https://photon.komoot.io/reverse');
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lon', String(longitude));
    url.searchParams.set('lang', 'en');
    const payload = await fetchBoundedJson(url, this.headers);
    if (payload === null) {
      return null;
    }
    if (typeof payload !== 'object' || payload === null || !('features' in payload)) {
      if (isPhotonFeature(payload)) {
        const hit = mapPhoton(payload);
        return isPlacedHit(hit) ? hit : null;
      }
      return null;
    }
    const features = (payload as { features: unknown }).features;
    if (!Array.isArray(features) || features.length === 0 || !isPhotonFeature(features[0])) {
      return null;
    }
    const hit = mapPhoton(features[0]);
    return isPlacedHit(hit) ? hit : null;
  }

  private async reverseNominatim(latitude: number, longitude: number): Promise<GeocodeHit | null> {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lon', String(longitude));
    url.searchParams.set('format', 'json');
    url.searchParams.set('addressdetails', '1');
    const payload = await fetchBoundedJson(url, this.headers);
    if (payload === null) {
      return null;
    }
    if (!isNominatimHit(payload)) {
      return null;
    }
    const hit = mapNominatim(payload);
    return isPlacedHit(hit) ? hit : null;
  }

  private async searchNominatim(query: string): Promise<GeocodeHit[]> {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('limit', '6');
    const payload = await fetchBoundedJson(url, this.headers);
    if (payload === null) {
      return [];
    }
    if (!Array.isArray(payload)) {
      return [];
    }
    return payload.filter(isNominatimHit).map(mapNominatim).filter(isPlacedHit);
  }
}

/** Cuts every text field to a sane length. */
function capHit(hit: GeocodeHit): GeocodeHit {
  const cap = (text: string): string => text.slice(0, GEOCODE_MAX_FIELD_LENGTH);
  return { ...hit, label: cap(hit.label), addressLine: cap(hit.addressLine), city: cap(hit.city), postalCode: cap(hit.postalCode) };
}

function isPhotonFeature(value: unknown): value is PhotonFeature {
  return typeof value === 'object' && value !== null;
}

function mapPhoton(feature: PhotonFeature): GeocodeHit {
  const coords = feature.geometry?.coordinates;
  const lon = Array.isArray(coords) && typeof coords[0] === 'number' ? coords[0] : Number.NaN;
  const lat = Array.isArray(coords) && typeof coords[1] === 'number' ? coords[1] : Number.NaN;
  const props = feature.properties ?? {};
  const street = [props.housenumber, props.street ?? props.name]
    .filter((part: string | undefined): part is string => part !== undefined && part !== '')
    .join(' ');
  const city = props.city ?? props.locality ?? props.district ?? props.county ?? props.state ?? '';
  const rawCountry = (props.countrycode ?? '').toUpperCase();
  const country = rawCountry.length === 2 ? rawCountry : '';
  const labelParts = [street === '' ? props.name : street, city, props.postcode, country].filter(
    (part: string | undefined): part is string => part !== undefined && part !== '',
  );
  return {
    label: labelParts.join(', '),
    addressLine: street === '' ? (props.name ?? '') : street,
    city,
    postalCode: props.postcode ?? '',
    countryCode: country,
    latitude: lat,
    longitude: lon,
  };
}

function isNominatimHit(value: unknown): value is NominatimHit {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return 'lat' in value && 'lon' in value && 'display_name' in value;
}

function mapNominatim(hit: NominatimHit): GeocodeHit {
  const address = hit.address;
  const road = [address?.house_number, address?.road ?? address?.pedestrian]
    .filter((part: string | undefined): part is string => part !== undefined && part !== '')
    .join(' ');
  const city =
    address?.city ??
    address?.town ??
    address?.village ??
    address?.hamlet ??
    address?.suburb ??
    address?.neighbourhood ??
    address?.city_district ??
    address?.municipality ??
    address?.county ??
    '';
  const rawCountry = (address?.country_code ?? '').toUpperCase();
  const country = rawCountry.length === 2 ? rawCountry : '';
  return {
    label: hit.display_name,
    addressLine: road === '' ? hit.display_name.split(',')[0] ?? hit.display_name : road,
    city,
    postalCode: address?.postcode ?? '',
    countryCode: country,
    latitude: Number.parseFloat(hit.lat),
    longitude: Number.parseFloat(hit.lon),
  };
}

function isPlacedHit(hit: GeocodeHit): boolean {
  return Number.isFinite(hit.latitude) && Number.isFinite(hit.longitude) && hit.label !== '';
}
