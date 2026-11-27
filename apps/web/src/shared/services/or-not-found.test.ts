/**
 * @file apps/web/src/shared/services/or-not-found.test.ts
 * @shared A missing property or stay becomes a real 404
 */

import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from './api-client';
import { orNotFound, orNotFoundOr } from './or-not-found';

vi.mock('next/navigation', () => ({
  notFound: (): never => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

describe('orNotFound', () => {
  it('returns the value', async () => {
    await expect(orNotFound(Promise.resolve(5))).resolves.toBe(5);
  });

  it('shows the 404 page when the API says 404', async () => {
    await expect(orNotFound(Promise.reject(new ApiRequestError('Property not found', 404, 'NOT_FOUND')))).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('rethrows any other failure unchanged', async () => {
    const failure = new ApiRequestError('Down', 500, undefined);
    await expect(orNotFound(Promise.reject(failure))).rejects.toBe(failure);
  });
});

describe('orNotFoundOr', () => {
  it('gives the fallback on other failures but still 404s for a missing page', async () => {
    await expect(orNotFoundOr(Promise.reject(new Error('network')), 'fallback')).resolves.toBe('fallback');
    await expect(orNotFoundOr(Promise.reject(new ApiRequestError('x', 404, undefined)), 'fallback')).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
