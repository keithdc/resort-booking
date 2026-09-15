/**
 * @file apps/api/src/modules/property/geocode.service.ts
 * @feature property
 * @dependencies Photon (komoot) + Nominatim fallback — no Google SDK
 */

import { Injectable } from '@nestjs/common';
import type { GeocodeHit } from '@resort-booking/shared-types';
import { mergeReverseHits } from './geocode.rules';

const USER_AGENT = 'resort-booking-admin/0.1 (direct-booking prototype)';

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
  /**
   * Type-ahead for staff pins. Photon is built for autocomplete; Nominatim is the fallback.
   */
  public async search(query: string): Promise<GeocodeHit[]> {
    const photon = await this.searchPhoton(query);
    if (photon.length > 0) {
      return photon;
    }
    return this.searchNominatim(query);
  }

  /**
   * Pin drop: Nominatim first (town/postcode/country), Photon fills any blanks.
   */
  public async reverse(latitude: number, longitude: number): Promise<GeocodeHit | null> {
    const [nominatim, photon] = await Promise.all([
      this.reverseNominatim(latitude, longitude),
      this.reversePhoton(latitude, longitude),
    ]);
    return mergeReverseHits(nominatim, photon);
  }

  private async searchPhoton(query: string): Promise<GeocodeHit[]> {
    const url = new URL('https://photon.komoot.io/api/');
    url.searchParams.set('q', query);
    url.searchParams.set('limit', '7');
    url.searchParams.set('lang', 'en');
    url.searchParams.set('lat', '46.6');
    url.searchParams.set('lon', '2.2');
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      });
    } catch {
      return [];
    }
    if (!response.ok) {
      return [];
    }
    const payload: unknown = await response.json();
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
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      });
    } catch {
      return null;
    }
    if (!response.ok) {
      return null;
    }
    const payload: unknown = await response.json();
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
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      });
    } catch {
      return null;
    }
    if (!response.ok) {
      return null;
    }
    const payload: unknown = await response.json();
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
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      });
    } catch {
      return [];
    }
    if (!response.ok) {
      return [];
    }
    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) {
      return [];
    }
    return payload.filter(isNominatimHit).map(mapNominatim).filter(isPlacedHit);
  }
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
