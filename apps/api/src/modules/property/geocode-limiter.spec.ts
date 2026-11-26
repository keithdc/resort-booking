/**
 * @file apps/api/src/modules/property/geocode-limiter.spec.ts
 * @feature property
 */

import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RedisService } from '../../shared/redis/redis.service';
import { GEOCODE_GLOBAL_DEFAULT, GEOCODE_PER_STAFF_DEFAULT, GeocodeLimiter } from './geocode-limiter';

describe('GeocodeLimiter', () => {
  const hit = jest.fn<Promise<{ count: number; ttlSeconds: number }>, [string, number]>();

  async function build(env: Record<string, string> = {}): Promise<GeocodeLimiter> {
    const moduleRef = await Test.createTestingModule({
      providers: [GeocodeLimiter, { provide: RedisService, useValue: { hitWindowWithTtl: hit } }, { provide: ConfigService, useValue: new ConfigService(env) }],
    }).compile();
    return moduleRef.get(GeocodeLimiter);
  }

  beforeEach(() => {
    jest.resetAllMocks();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation((): void => undefined);
    hit.mockResolvedValue({ count: 1, ttlSeconds: 60 });
  });

  it('counts per staff member and for everyone', async () => {
    await (await build()).check('staff-1');

    expect(hit).toHaveBeenCalledWith('ratelimit:geocode:staff:staff-1', GEOCODE_PER_STAFF_DEFAULT.windowSeconds);
    expect(hit).toHaveBeenCalledWith('ratelimit:geocode:global', GEOCODE_GLOBAL_DEFAULT.windowSeconds);
  });

  it('answers 429 GEOCODE_RATE_LIMITED with Retry-After over the per-person limit, without counting the global one', async () => {
    hit.mockResolvedValueOnce({ count: GEOCODE_PER_STAFF_DEFAULT.limit + 1, ttlSeconds: 21 });

    await expect((await build()).check('staff-1')).rejects.toMatchObject({ status: 429, retryAfterSeconds: 21, response: { code: 'GEOCODE_RATE_LIMITED' } });
    expect(hit).toHaveBeenCalledTimes(1);
  });

  it('answers 429 over the global limit', async () => {
    hit.mockResolvedValueOnce({ count: 1, ttlSeconds: 60 }).mockResolvedValueOnce({ count: GEOCODE_GLOBAL_DEFAULT.limit + 1, ttlSeconds: 9 });

    await expect((await build()).check('staff-1')).rejects.toMatchObject({ status: 429, retryAfterSeconds: 9 });
  });

  it('honours env overrides', async () => {
    hit.mockResolvedValue({ count: 3, ttlSeconds: 5 });

    await expect((await build({ GEOCODE_STAFF_LIMIT: '2' })).check('staff-1')).rejects.toMatchObject({ status: 429 });
  });

  it('keeps limiting from memory when Redis is down: it never opens the upstream to a loop', async () => {
    hit.mockRejectedValue(new Error('redis down'));
    const limiter = await build({ GEOCODE_STAFF_LIMIT: '3' });

    await limiter.check('staff-1');
    await limiter.check('staff-1');
    await limiter.check('staff-1');
    await expect(limiter.check('staff-1')).rejects.toMatchObject({ status: 429, response: { code: 'GEOCODE_RATE_LIMITED' } });
    await expect(limiter.check('staff-2')).resolves.toBeUndefined();
  });

  it('starts a fresh in-memory window after it ends', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-26T12:00:00Z') });
    try {
      hit.mockRejectedValue(new Error('redis down'));
      const limiter = await build({ GEOCODE_STAFF_LIMIT: '1', GEOCODE_STAFF_WINDOW_SECONDS: '10' });

      await limiter.check('staff-1');
      await expect(limiter.check('staff-1')).rejects.toMatchObject({ status: 429 });
      jest.setSystemTime(new Date('2026-11-26T12:00:11Z'));
      await expect(limiter.check('staff-1')).resolves.toBeUndefined();
    } finally {
      jest.useRealTimers();
    }
  });
});
