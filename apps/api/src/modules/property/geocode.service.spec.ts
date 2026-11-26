/**
 * @file apps/api/src/modules/property/geocode.service.spec.ts
 * @feature property
 */

import { ConfigService } from '@nestjs/config';
import { GEOCODE_MAX_FIELD_LENGTH, GEOCODE_MAX_HITS, geocodeUserAgent, GeocodeService, normalizeGeocodeQuery } from './geocode.service';

function photon(count: number, name = 'Place'): Response {
  const features = Array.from({ length: count }, (_unused, index) => ({
    geometry: { coordinates: [2.35 + index / 100, 48.85] },
    properties: { name: `${name} ${String(index)}`, city: 'Paris', postcode: '75001', countrycode: 'fr' },
  }));
  return new Response(JSON.stringify({ features }), { status: 200 });
}

function service(env: Record<string, string> = {}): GeocodeService {
  return new GeocodeService(new ConfigService(env));
}

describe('GeocodeService', () => {
  let fetchSpy: jest.SpyInstance<Promise<Response>, Parameters<typeof fetch>>;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('asks Photon once for a query, then answers a repeat (any case or spacing) from the cache', async () => {
    fetchSpy.mockImplementation(() => Promise.resolve(photon(2)));
    const geocode = service();

    const first = await geocode.search('Rue  de Rivoli ');
    const second = await geocode.search('rue de rivoli');

    expect(first).toHaveLength(2);
    expect(second).toEqual(first);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('does not cache "nothing found", so the next try asks again', async () => {
    fetchSpy.mockImplementation((input) => Promise.resolve(String(input).includes('photon') ? photon(0) : new Response('[]', { status: 200 })));
    const geocode = service();

    await geocode.search('nowhere at all');
    await geocode.search('nowhere at all');

    // Photon then Nominatim, twice.
    expect(fetchSpy).toHaveBeenCalledTimes(4);
  });

  it('caps the number of suggestions and the length of every text field', async () => {
    fetchSpy.mockImplementation(() => Promise.resolve(photon(20, 'X'.repeat(500))));

    const hits = await service().search('long names');

    expect(hits).toHaveLength(GEOCODE_MAX_HITS);
    for (const hit of hits) {
      expect(hit.label.length).toBeLessThanOrEqual(GEOCODE_MAX_FIELD_LENGTH);
      expect(hit.addressLine.length).toBeLessThanOrEqual(GEOCODE_MAX_FIELD_LENGTH);
    }
  });

  it('sends an identifying User-Agent and no personal data', async () => {
    fetchSpy.mockImplementation(() => Promise.resolve(photon(1)));

    await service().search('anything');

    const init = fetchSpy.mock.calls[0]?.[1];
    const headers = init?.headers as Record<string, string>;
    expect(headers['User-Agent']).toMatch(/^resort-booking\/1\.0 /);
    expect(headers['User-Agent']).not.toContain('@');
    const url = String(fetchSpy.mock.calls[0]?.[0]);
    expect(url).toContain('photon.komoot.io');
    expect(url).not.toContain('email');
  });

  it('caches a reverse lookup by the point rounded to 4 decimals', async () => {
    fetchSpy.mockImplementation((input) =>
      Promise.resolve(
        String(input).includes('nominatim')
          ? new Response(JSON.stringify({ lat: '48.8566', lon: '2.3522', display_name: 'Paris, France', address: { city: 'Paris', country_code: 'fr' } }), { status: 200 })
          : photon(0),
      ),
    );
    const geocode = service();

    const first = await geocode.reverse(48.85661, 2.35221);
    const second = await geocode.reverse(48.85662, 2.35223);

    expect(first?.city).toBe('Paris');
    expect(second).toEqual(first);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('answers nothing, never an error, when the upstream fails', async () => {
    fetchSpy.mockRejectedValue(new Error('network down'));

    await expect(service().search('anything')).resolves.toEqual([]);
    await expect(service().reverse(1, 1)).resolves.toBeNull();
  });
});

describe('geocodeUserAgent', () => {
  it('names the application, and adds the operator contact only when configured and safe', () => {
    expect(geocodeUserAgent(undefined)).toBe('resort-booking/1.0 (booking software; address lookup)');
    expect(geocodeUserAgent('  ')).toBe('resort-booking/1.0 (booking software; address lookup)');
    expect(geocodeUserAgent('https://book.example.com')).toBe('resort-booking/1.0 (booking software; address lookup; https://book.example.com)');
  });

  it('ignores a contact with spaces, control characters or too long a value (header injection)', () => {
    expect(geocodeUserAgent('a b')).not.toContain('a b');
    expect(geocodeUserAgent('x\r\nHost: evil')).toBe('resort-booking/1.0 (booking software; address lookup)');
    expect(geocodeUserAgent('x'.repeat(101))).toBe('resort-booking/1.0 (booking software; address lookup)');
  });
});

describe('normalizeGeocodeQuery', () => {
  it('lower-cases, trims and collapses whitespace', () => {
    expect(normalizeGeocodeQuery('  Rue   De\tParis ')).toBe('rue de paris');
  });
});
