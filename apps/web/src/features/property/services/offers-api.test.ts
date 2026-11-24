/**
 * @file apps/web/src/features/property/services/offers-api.test.ts
 * @feature property
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeOffer } from '../test-fixtures';
import { fetchPropertyOffers, fetchPropertyOffersOrEmpty } from './offers-api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('offers requests', () => {
  const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the public offers of a property by slug', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'ok', data: [makeOffer()] }));

    const offers = await fetchPropertyOffers('alpine lake');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:3002/properties/alpine%20lake/offers');
    expect(offers).toHaveLength(1);
  });

  it('throws when the property is unknown', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'error', message: 'Property not found', code: 'PROPERTY_NOT_FOUND' }, 404));

    await expect(fetchPropertyOffers('nope')).rejects.toMatchObject({ status: 404 });
  });

  it('gives an empty list instead of breaking the page when the API fails', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'error', message: 'boom' }, 500));
    await expect(fetchPropertyOffersOrEmpty('alpine-lake')).resolves.toEqual([]);
  });

  it('gives an empty list when the network fails', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    await expect(fetchPropertyOffersOrEmpty('alpine-lake')).resolves.toEqual([]);
  });

  it('returns the offers when they load', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'ok', data: [makeOffer({ id: 'x' })] }));
    await expect(fetchPropertyOffersOrEmpty('alpine-lake')).resolves.toEqual([expect.objectContaining({ id: 'x' })]);
  });
});
