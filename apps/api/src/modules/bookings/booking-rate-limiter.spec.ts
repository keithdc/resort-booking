/**
 * @file apps/api/src/modules/bookings/booking-rate-limiter.spec.ts
 * @feature bookings
 */

import { HttpException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { RedisService, type WindowState } from '../../shared/redis/redis.service';
import { fingerprint } from '../../shared/http/client-ip';
import {
  BOOKING_ATTEMPTS_PER_WINDOW,
  BOOKING_WINDOW_SECONDS,
  BookingRateLimiter,
  REFERENCE_ATTEMPTS_PER_WINDOW,
  REFERENCE_WINDOW_SECONDS,
} from './booking-rate-limiter';

describe('BookingRateLimiter', () => {
  const hitWindowWithTtl = jest.fn<Promise<WindowState>, [string, number]>();
  let limiter: BookingRateLimiter;
  const settings: Record<string, string> = {};

  async function build(): Promise<BookingRateLimiter> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        BookingRateLimiter,
        { provide: RedisService, useValue: { hitWindowWithTtl } },
        { provide: ConfigService, useValue: { get: (name: string): string | undefined => settings[name] } },
      ],
    }).compile();
    return moduleRef.get(BookingRateLimiter);
  }

  beforeEach(async (): Promise<void> => {
    jest.resetAllMocks();
    for (const key of Object.keys(settings)) {
      delete settings[key];
    }
    jest.spyOn(Logger.prototype, 'warn').mockImplementation((): void => undefined);
    limiter = await build();
  });

  afterEach((): void => {
    jest.restoreAllMocks();
  });

  it('allows attempts up to the limit, counted per caller', async () => {
    hitWindowWithTtl.mockResolvedValue({ count: BOOKING_ATTEMPTS_PER_WINDOW, ttlSeconds: 20 });

    await expect(limiter.check('1.2.3.4')).resolves.toBeUndefined();

    expect(hitWindowWithTtl).toHaveBeenCalledWith('ratelimit:booking:1.2.3.4', BOOKING_WINDOW_SECONDS);
  });

  it('blocks with 429 LOOKUP_RATE_LIMITED once over the limit', async () => {
    hitWindowWithTtl.mockResolvedValue({ count: BOOKING_ATTEMPTS_PER_WINDOW + 1, ttlSeconds: 20 });

    const attempt = limiter.check('1.2.3.4');

    await expect(attempt).rejects.toBeInstanceOf(HttpException);
    await expect(attempt).rejects.toMatchObject({ status: 429, response: { code: 'LOOKUP_RATE_LIMITED' } });
  });

  it('groups callers with no address into one bucket instead of skipping the limit', async () => {
    hitWindowWithTtl.mockResolvedValue({ count: 1, ttlSeconds: 20 });

    await limiter.check(undefined);

    expect(hitWindowWithTtl).toHaveBeenCalledWith('ratelimit:booking:unknown', BOOKING_WINDOW_SECONDS);
  });

  it('lets the request through when Redis is down (the reference and email are still checked)', async () => {
    hitWindowWithTtl.mockRejectedValue(new Error('redis down'));

    await expect(limiter.check('1.2.3.4')).resolves.toBeUndefined();
    expect(Logger.prototype.warn).toHaveBeenCalledTimes(1);
  });

  it('keeps promo-code attempts and booking attempts in separate buckets', async () => {
    hitWindowWithTtl.mockResolvedValue({ count: 1, ttlSeconds: 20 });

    await limiter.check('1.2.3.4');

    expect(hitWindowWithTtl.mock.calls[0]?.[0]).not.toContain('promo');
  });

  it('also limits one reference across all callers, keyed by a hash so the reference is not stored readable', async () => {
    hitWindowWithTtl.mockResolvedValue({ count: 1, ttlSeconds: 20 });

    await limiter.check('1.2.3.4', 'BK-ABC123');

    expect(hitWindowWithTtl).toHaveBeenCalledTimes(2);
    expect(hitWindowWithTtl).toHaveBeenLastCalledWith(`ratelimit:bookingref:${fingerprint('BK-ABC123')}`, REFERENCE_WINDOW_SECONDS);
    expect(hitWindowWithTtl.mock.calls[1]?.[0]).not.toContain('ABC123');
  });

  it('blocks a reference that many different callers keep guessing', async () => {
    hitWindowWithTtl.mockResolvedValueOnce({ count: 1, ttlSeconds: 20 });
    hitWindowWithTtl.mockResolvedValueOnce({ count: REFERENCE_ATTEMPTS_PER_WINDOW + 1, ttlSeconds: 300 });

    await expect(limiter.check('5.6.7.8', 'BK-ABC123')).rejects.toMatchObject({
      status: 429,
      response: { code: 'LOOKUP_RATE_LIMITED' },
      retryAfterSeconds: 300,
    });
  });

  it('takes the limit from the environment, ignoring a bad value', async () => {
    settings.BOOKING_LOOKUP_LIMIT = '2';
    settings.BOOKING_LOOKUP_WINDOW_SECONDS = 'oops';
    limiter = await build();
    hitWindowWithTtl.mockResolvedValue({ count: 3, ttlSeconds: 20 });

    await expect(limiter.check('1.2.3.4')).rejects.toMatchObject({ status: 429 });
    expect(hitWindowWithTtl).toHaveBeenCalledWith('ratelimit:booking:1.2.3.4', BOOKING_WINDOW_SECONDS);
  });
});
