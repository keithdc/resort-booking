/**
 * @file apps/web/src/shared/seo/sitemap-entries.test.ts
 * @shared sitemap.xml contents: only published pages, never an error
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeHouse, makeProperty } from '@/features/property/test-fixtures';
import { buildSitemapEntries } from './sitemap-entries';

const summary = (): ReturnType<typeof makeProperty> => makeProperty();

beforeEach(() => {
  vi.stubEnv('SITE_URL', 'https://www.example.com');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('buildSitemapEntries', () => {
  it('lists home, the property list, each property and each published stay', async () => {
    const entries = await buildSitemapEntries({
      listProperties: () => Promise.resolve([summary()]),
      listStays: () => Promise.resolve([makeHouse('lake-chalet', 'Lake Chalet')]),
    });
    expect(entries.map((entry) => entry.url)).toEqual([
      'https://www.example.com/',
      'https://www.example.com/properties',
      'https://www.example.com/properties/alpine-lake',
      'https://www.example.com/properties/alpine-lake/stays/lake-chalet',
    ]);
  });

  it('never lists an unpublished property or stay, even if the source returned one', async () => {
    const hidden = { ...makeProperty(), id: 'h', slug: 'secret', published: false };
    const entries = await buildSitemapEntries({
      listProperties: () => Promise.resolve([summary(), hidden]),
      listStays: (slug) =>
        Promise.resolve(slug === 'alpine-lake' ? [makeHouse('open', 'Open'), { ...makeHouse('draft', 'Draft'), published: false }] : [makeHouse('x', 'X')]),
    });
    const urls = entries.map((entry) => entry.url).join('\n');
    expect(urls).toContain('/stays/open');
    expect(urls).not.toContain('draft');
    expect(urls).not.toContain('secret');
  });

  it('skips a stay that claims another property', async () => {
    const entries = await buildSitemapEntries({
      listProperties: () => Promise.resolve([summary()]),
      listStays: () => Promise.resolve([{ ...makeHouse('odd', 'Odd'), propertySlug: 'other' }]),
    });
    expect(entries.map((entry) => entry.url).join('\n')).not.toContain('odd');
  });

  it('gives the short list when the API fails, and skips one failing property', async () => {
    const down = await buildSitemapEntries({ listProperties: () => Promise.reject(new Error('down')), listStays: () => Promise.resolve([]) });
    expect(down).toHaveLength(2);
    const partial = await buildSitemapEntries({
      listProperties: () => Promise.resolve([summary()]),
      listStays: () => Promise.reject(new Error('down')),
    });
    expect(partial.map((entry) => entry.url)).toContain('https://www.example.com/properties/alpine-lake');
  });

  it('is empty when the site address is not configured', async () => {
    vi.stubEnv('SITE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    vi.stubEnv('NODE_ENV', 'production');
    expect(await buildSitemapEntries({ listProperties: () => Promise.resolve([summary()]), listStays: () => Promise.resolve([]) })).toEqual([]);
  });
});
