/**
 * @file apps/web/src/features/bookings/services/bookings-api.test.ts
 * @feature bookings
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/shared/services/api-client';
import { cancelBooking, lookupBooking } from './bookings-api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('bookings-api', () => {
  const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('looks a booking up with a POST body, so the email never appears in a URL', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'ok', data: { reference: 'BK-1' } }));

    await lookupBooking({ reference: 'BK-1', email: 'ada@example.com' });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:3002/bookings/lookup');
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain('ada');
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ reference: 'BK-1', email: 'ada@example.com' });
  });

  it('cancels with a POST to the cancel route', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'ok', data: { reference: 'BK-1', status: 'cancelled' } }));

    const booking = await cancelBooking({ reference: 'BK-1', email: 'ada@example.com' });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:3002/bookings/cancel');
    expect(booking.status).toBe('cancelled');
  });

  it('surfaces the API code for a booking that was not found', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'error', message: 'We could not find that booking.', code: 'BOOKING_NOT_FOUND' }, 404));

    const attempt = lookupBooking({ reference: 'x', email: 'a@b.co' });

    await expect(attempt).rejects.toBeInstanceOf(ApiRequestError);
    await expect(attempt).rejects.toMatchObject({ status: 404, code: 'BOOKING_NOT_FOUND' });
  });
});
