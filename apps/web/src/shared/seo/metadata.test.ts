/**
 * @file apps/web/src/shared/seo/metadata.test.ts
 * @shared Titles, descriptions, canonical links, cards and noindex pages
 */

import type { HouseDetail, Photo } from '@resort-booking/shared-types';
import { describe, expect, it } from 'vitest';
import { makeHouse, makeProperty } from '@/features/property/test-fixtures';
import {
  homeMetadata,
  manageMetadata,
  propertiesMetadata,
  propertyMetadata,
  searchMetadata,
  shortText,
  stayMetadata,
} from './metadata';

const PHOTO: Photo = { id: 'p1', url: 'https://img.example.com/lake.jpg', altText: 'The lake at dawn', sortOrder: 0 };

function detail(overrides: Partial<HouseDetail> = {}): HouseDetail {
  return {
    ...makeHouse('lake-chalet', 'Lake Chalet'),
    description: 'A timber chalet on the shore.',
    latitude: null,
    longitude: null,
    photos: [PHOTO],
    amenities: [],
    propertyPhone: '+33450123456',
    propertyEmail: 'stay@example.com',
    propertyLatitude: 45.9,
    propertyLongitude: 6.1,
    ...overrides,
  };
}

describe('shortText', () => {
  it('keeps short text, strips tags and white space', () => {
    expect(shortText('  Lake <b>life</b>\n\n  here ')).toBe('Lake life here');
  });

  it('cuts long text at a word with an ellipsis, within the limit', () => {
    const cut = shortText('word '.repeat(80));
    expect(cut.length).toBeLessThanOrEqual(155);
    expect(cut.endsWith('…')).toBe(true);
    expect(cut).not.toMatch(/\s…$/);
  });
});

describe('stayMetadata', () => {
  it('names the stay, property and town, and says how many it sleeps and the price from', () => {
    const meta = stayMetadata(detail());
    expect(meta.title).toBe('Lake Chalet at Alpine Lake, Annecy');
    expect(meta.description).toContain('Sleeps 4');
    expect(meta.description).toContain('from €100 per night');
    expect(meta.description).toContain('A timber chalet on the shore.');
    expect(meta.alternates?.canonical).toBe('/properties/alpine-lake/stays/lake-chalet');
    expect(meta.robots).toBeUndefined();
  });

  it('carries its own social cards with the photo and its description', () => {
    const meta = stayMetadata(detail());
    expect(meta.openGraph).toMatchObject({ type: 'website', siteName: 'Humphreys', url: '/properties/alpine-lake/stays/lake-chalet' });
    expect(meta.openGraph?.images).toEqual([{ url: PHOTO.url, alt: 'The lake at dawn' }]);
    expect(meta.twitter).toMatchObject({ card: 'summary_large_image', images: [PHOTO.url] });
  });

  it('uses a plain summary card and a fallback sentence when there is no photo or text', () => {
    const meta = stayMetadata(detail({ photos: [], description: '' }));
    expect(meta.twitter).toMatchObject({ card: 'summary' });
    expect(meta.openGraph?.images).toBeUndefined();
    expect(meta.description).toContain('Lake Chalet at Alpine Lake in Annecy');
  });

  it('ignores a photo address that is not a web address', () => {
    const meta = stayMetadata(detail({ photos: [{ ...PHOTO, url: 'javascript:alert(1)' }] }));
    expect(meta.openGraph?.images).toBeUndefined();
  });
});

describe('propertyMetadata', () => {
  it('names the property and town, counts the stays and gives the lowest price', () => {
    const cheap = { ...makeHouse('b', 'Small'), nightlyRateCents: 9000, capacity: 2 };
    const meta = propertyMetadata(makeProperty(), [makeHouse('a', 'Big'), cheap]);
    expect(meta.title).toBe('Alpine Lake: stays in Annecy');
    expect(meta.description).toContain('2 stays');
    expect(meta.description).toContain('sleeps up to 4');
    expect(meta.description).toContain('from €90 per night');
    expect(meta.alternates?.canonical).toBe('/properties/alpine-lake');
  });

  it('still reads well with no stays or description', () => {
    const meta = propertyMetadata({ ...makeProperty(), description: '' }, []);
    expect(meta.description).toBe('Holiday stays in Annecy. Book direct.');
  });
});

describe('home and list metadata', () => {
  it('names the towns', () => {
    const properties = [makeProperty(), { ...makeProperty(), id: 'q', slug: 'sea', name: 'Sea', city: 'Nice' }];
    expect(homeMetadata(properties).description).toContain('Annecy and Nice');
    expect(homeMetadata(properties).alternates?.canonical).toBe('/');
    expect(propertiesMetadata(properties).title).toBe('Our properties');
    expect(propertiesMetadata(properties).alternates?.canonical).toBe('/properties');
  });

  it('works with no properties', () => {
    expect(homeMetadata([]).description).toContain('Book holiday stays directly');
  });
});

describe('pages that must not be indexed', () => {
  it('keeps search results out of search engines but lets links be followed', () => {
    expect(searchMetadata().robots).toEqual({ index: false, follow: true });
  });

  it('keeps the booking look-up out and does not follow its links', () => {
    expect(manageMetadata().robots).toEqual({ index: false, follow: false });
  });
});
