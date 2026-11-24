/**
 * @file apps/web/src/shared/services/availability-api.test.ts
 * @shared Availability request building and error handling
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from './api-client';
import { fetchHouseAvailability, fetchPropertyAvailability } from './availability-api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('availability-api', (): void => {
  const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

  beforeEach((): void => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach((): void => {
    vi.unstubAllGlobals();
  });

  it('requests house availability without a query string by default', async (): Promise<void> => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        status: 'ok',
        data: { houseId: 'h', from: 'a', to: 'b', unavailable: [], maxCheckOutDate: null },
      }),
    );

    const result = await fetchHouseAvailability('alpine-lake', 'lake-chalet');

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'http://localhost:3002/properties/alpine-lake/houses/lake-chalet/availability',
    );
    expect(result.unavailable).toEqual([]);
  });

  it('sends only the options that are set and encodes slugs', async (): Promise<void> => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        status: 'ok',
        data: { houseId: 'h', from: 'a', to: 'b', unavailable: [], maxCheckOutDate: '2027-06-20' },
      }),
    );

    await fetchHouseAvailability('a b', 'c/d', { checkIn: '2027-06-15', to: undefined });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'http://localhost:3002/properties/a%20b/houses/c%2Fd/availability?checkIn=2027-06-15',
    );
  });

  it('requests property availability with a window', async (): Promise<void> => {
    fetchMock.mockResolvedValue(
      jsonResponse({ status: 'ok', data: { propertyId: 'p', from: 'a', to: 'b', fullyBookedNights: [] } }),
    );

    await fetchPropertyAvailability('alpine-lake', { from: '2027-06-01', to: '2027-07-01' });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'http://localhost:3002/properties/alpine-lake/availability?from=2027-06-01&to=2027-07-01',
    );
  });

  it('throws the API error code on a failed response', async (): Promise<void> => {
    fetchMock.mockResolvedValue(
      jsonResponse({ status: 'error', message: 'House not found', code: 'HOUSE_NOT_FOUND' }, 404),
    );

    const failure = fetchHouseAvailability('alpine-lake', 'nope');

    await expect(failure).rejects.toBeInstanceOf(ApiRequestError);
    await expect(failure).rejects.toMatchObject({ status: 404, code: 'HOUSE_NOT_FOUND' });
  });
});
