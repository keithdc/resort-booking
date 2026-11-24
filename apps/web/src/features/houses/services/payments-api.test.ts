/**
 * @file apps/web/src/features/houses/services/payments-api.test.ts
 * @feature houses
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/shared/services/api-client';
import { completeMockPayment, startPayment } from './payments-api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('payments-api', () => {
  const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('starts the payment for a hold with a POST to the hold', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'ok', data: { id: 'p1', status: 'requires_payment' } }));

    const payment = await startPayment('hold/1');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:3002/holds/hold%2F1/payment');
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
    expect(payment.id).toBe('p1');
  });

  it('settles a mock payment with the chosen outcome in the body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'ok', data: { payment: { id: 'p1' }, confirmation: null } }));

    await completeMockPayment('p1', 'failure');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:3002/payments/p1/mock/complete');
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ outcome: 'failure' });
  });

  it('surfaces the API error code, for example a hold that timed out', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'error', message: 'Time ran out', code: 'HOLD_EXPIRED' }, 409));

    const attempt = startPayment('hold-1');

    await expect(attempt).rejects.toBeInstanceOf(ApiRequestError);
    await expect(attempt).rejects.toMatchObject({ status: 409, code: 'HOLD_EXPIRED' });
  });
});
