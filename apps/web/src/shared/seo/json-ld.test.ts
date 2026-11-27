/**
 * @file apps/web/src/shared/seo/json-ld.test.ts
 * @shared Structured data: safe text, no invented ratings, no personal data
 */

import type { HouseDetail } from '@resort-booking/shared-types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeHouse, makeProperty } from '@/features/property/test-fixtures';
import { breadcrumbJsonLd, priceFromText, propertyJsonLd, serializeJsonLd, stayJsonLd, websiteJsonLd } from './json-ld';

function detail(overrides: Partial<HouseDetail> = {}): HouseDetail {
  return {
    ...makeHouse('lake-chalet', 'Lake Chalet'),
    latitude: null,
    longitude: null,
    photos: [{ id: 'ph', url: 'https://img.example.com/a.jpg', altText: 'Lake view', sortOrder: 0 }],
    amenities: [{ id: 'a', houseId: 'lake-chalet', name: 'Sauna', details: '' }],
    propertyPhone: '+33450123456',
    propertyEmail: 'stay@example.com',
    propertyLatitude: 45.9,
    propertyLongitude: 6.1,
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubEnv('SITE_URL', 'https://www.example.com');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('serializeJsonLd', () => {
  it('cannot be closed early by text that looks like a tag', () => {
    const text = serializeJsonLd({ name: '</script><script>alert(1)</script>', note: 'a & b <!-- c' });
    expect(text).not.toContain('</script>');
    expect(text).not.toContain('<');
    expect(text).not.toContain('>');
    expect(text).not.toContain('&');
    expect(JSON.parse(text)).toEqual({ name: '</script><script>alert(1)</script>', note: 'a & b <!-- c' });
  });

  it('escapes the line separators that break older scripts', () => {
    const text = serializeJsonLd({ name: 'a\u2028b\u2029c' });
    expect(text).not.toMatch(/[\u2028\u2029]/);
    expect(JSON.parse(text)).toEqual({ name: 'a\u2028b\u2029c' });
  });
});

describe('priceFromText', () => {
  it('says the lowest rate per night in the stay currency', () => {
    expect(priceFromText(18000, 'EUR')).toBe('from €180 per night');
    expect(priceFromText(18050, 'EUR')).toBe('from €180.50 per night');
  });
});

describe('propertyJsonLd', () => {
  it('describes a lodging business with address, place, phone and the lowest price', () => {
    const cheap = { ...makeHouse('b', 'Small'), nightlyRateCents: 9000 };
    const node = propertyJsonLd(makeProperty(), [makeHouse('a', 'Big'), cheap]);
    expect(node['@type']).toBe('LodgingBusiness');
    expect(node.url).toBe('https://www.example.com/properties/alpine-lake');
    expect(node.address).toMatchObject({ '@type': 'PostalAddress', addressLocality: 'Annecy', addressCountry: 'FR' });
    expect(node.geo).toMatchObject({ latitude: 45.9, longitude: 6.1 });
    expect(node.telephone).toBe('+33450123456');
    expect(node.priceRange).toBe('from €90 per night');
  });

  it('never invents ratings and never includes the email address', () => {
    const text = JSON.stringify(propertyJsonLd(makeProperty(), [makeHouse('a', 'Big')]));
    expect(text).not.toContain('aggregateRating');
    expect(text).not.toContain('review');
    expect(text).not.toContain('stay@example.com');
  });

  it('drops photo addresses that are not web addresses', () => {
    const property = { ...makeProperty(), photos: [
      { id: '1', url: 'javascript:alert(1)', altText: '', sortOrder: 0 },
      { id: '2', url: 'https://img.example.com/ok.jpg', altText: '', sortOrder: 1 },
    ] };
    expect(propertyJsonLd(property, []).image).toEqual(['https://img.example.com/ok.jpg']);
  });
});

describe('stayJsonLd', () => {
  it('describes a vacation rental with capacity, amenities and the property location when the stay has none', () => {
    const node = stayJsonLd(detail());
    expect(node['@type']).toBe('VacationRental');
    expect(node.occupancy).toEqual({ '@type': 'QuantitativeValue', maxValue: 4 });
    expect(node.geo).toMatchObject({ latitude: 45.9, longitude: 6.1 });
    expect(node.amenityFeature).toEqual([{ '@type': 'LocationFeatureSpecification', name: 'Sauna', value: true }]);
    expect(node.url).toBe('https://www.example.com/properties/alpine-lake/stays/lake-chalet');
    expect(JSON.stringify(node)).not.toContain('aggregateRating');
    expect(JSON.stringify(node)).not.toContain('stay@example.com');
  });

  it('uses the stay own coordinates when it has them', () => {
    expect(stayJsonLd(detail({ latitude: 1, longitude: 2 })).geo).toMatchObject({ latitude: 1, longitude: 2 });
  });
});

describe('breadcrumbJsonLd and websiteJsonLd', () => {
  it('numbers each step with an absolute address', () => {
    const node = breadcrumbJsonLd([
      { name: 'Home', path: '/' },
      { name: 'Alpine Lake', path: '/properties/alpine-lake' },
    ]);
    expect(node?.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.example.com/' },
      { '@type': 'ListItem', position: 2, name: 'Alpine Lake', item: 'https://www.example.com/properties/alpine-lake' },
    ]);
    expect(websiteJsonLd()).toMatchObject({ '@type': 'WebSite', url: 'https://www.example.com/' });
  });

  it('are left out when the site address is not configured', () => {
    vi.stubEnv('SITE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    vi.stubEnv('NODE_ENV', 'production');
    expect(breadcrumbJsonLd([{ name: 'Home', path: '/' }])).toBeNull();
    expect(websiteJsonLd()).toBeNull();
  });
});
