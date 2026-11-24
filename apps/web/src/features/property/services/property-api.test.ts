/**
 * @file apps/web/src/features/property/services/property-api.test.ts
 * @feature property
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchCancellationPolicy, fetchCancellationPolicyOrNull } from './property-api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const POLICY = {
  propertyId: 'p',
  tiers: [{ minDaysBeforeCheckIn: 7, refundPercent: 100 }],
  rebookable: false,
  rebookFeeType: 'none',
  rebookFeeValue: 0,
};

describe('cancellation policy requests', () => {
  const fetchMock = vi.fn<(input: string, init?: RequestInit) => Promise<Response>>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the public policy of a property by slug', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'ok', data: POLICY }));

    const policy = await fetchCancellationPolicy('alpine lake');

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:3002/properties/alpine%20lake/cancellation-policy');
    expect(policy.tiers).toHaveLength(1);
  });

  it('throws when the property is unknown', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'error', message: 'Property not found', code: 'PROPERTY_NOT_FOUND' }, 404));

    await expect(fetchCancellationPolicy('nope')).rejects.toMatchObject({ status: 404, code: 'PROPERTY_NOT_FOUND' });
  });

  it('gives null instead of breaking the page when the policy cannot be loaded', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'error', message: 'boom' }, 500));

    await expect(fetchCancellationPolicyOrNull('alpine-lake')).resolves.toBeNull();
  });

  it('gives null when the network fails', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));

    await expect(fetchCancellationPolicyOrNull('alpine-lake')).resolves.toBeNull();
  });

  it('returns the policy when it loads', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'ok', data: POLICY }));

    await expect(fetchCancellationPolicyOrNull('alpine-lake')).resolves.toMatchObject({ propertyId: 'p' });
  });
});
