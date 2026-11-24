/**
 * @file apps/api/src/modules/bookings/booking-rate-limiter.spec.ts
 * @feature bookings
 */

import { HttpException, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RedisService } from '../../shared/redis/redis.service';
import { BOOKING_ATTEMPTS_PER_WINDOW, BOOKING_WINDOW_SECONDS, BookingRateLimiter } from './booking-rate-limiter';

describe('BookingRateLimiter', () => {
  const hitWindow = jest.fn<Promise<number>, [string, number]>();
  let limiter: BookingRateLimiter;

  beforeEach(async (): Promise<void> => {
    jest.resetAllMocks();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation((): void => undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [BookingRateLimiter, { provide: RedisService, useValue: { hitWindow } }],
    }).compile();
    limiter = moduleRef.get(BookingRateLimiter);
  });

  afterEach((): void => {
    jest.restoreAllMocks();
  });

  it('allows attempts up to the limit, counted per caller', async () => {
    hitWindow.mockResolvedValue(BOOKING_ATTEMPTS_PER_WINDOW);

    await expect(limiter.check('1.2.3.4')).resolves.toBeUndefined();

    expect(hitWindow).toHaveBeenCalledWith('ratelimit:booking:1.2.3.4', BOOKING_WINDOW_SECONDS);
  });

  it('blocks with 429 LOOKUP_RATE_LIMITED once over the limit', async () => {
    hitWindow.mockResolvedValue(BOOKING_ATTEMPTS_PER_WINDOW + 1);

    const attempt = limiter.check('1.2.3.4');

    await expect(attempt).rejects.toBeInstanceOf(HttpException);
    await expect(attempt).rejects.toMatchObject({ status: 429, response: { code: 'LOOKUP_RATE_LIMITED' } });
  });

  it('groups callers with no address into one bucket instead of skipping the limit', async () => {
    hitWindow.mockResolvedValue(1);

    await limiter.check(undefined);

    expect(hitWindow).toHaveBeenCalledWith('ratelimit:booking:unknown', BOOKING_WINDOW_SECONDS);
  });

  it('lets the request through when Redis is down (the reference and email are still checked)', async () => {
    hitWindow.mockRejectedValue(new Error('redis down'));

    await expect(limiter.check('1.2.3.4')).resolves.toBeUndefined();
    expect(Logger.prototype.warn).toHaveBeenCalledTimes(1);
  });

  it('keeps promo-code attempts and booking attempts in separate buckets', async () => {
    hitWindow.mockResolvedValue(1);

    await limiter.check('1.2.3.4');

    expect(hitWindow.mock.calls[0]?.[0]).not.toContain('promo');
  });
});
