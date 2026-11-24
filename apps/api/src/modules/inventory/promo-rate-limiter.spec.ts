/**
 * @file apps/api/src/modules/inventory/promo-rate-limiter.spec.ts
 * @feature inventory
 * @dependencies PromoRateLimiter, @nestjs/testing
 */

import { HttpException, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { RedisService } from '../../shared/redis/redis.service';
import { PROMO_ATTEMPTS_PER_WINDOW, PROMO_WINDOW_SECONDS, PromoRateLimiter } from './promo-rate-limiter';

describe('PromoRateLimiter', () => {
  const hitWindow = jest.fn<Promise<number>, [string, number]>();
  let limiter: PromoRateLimiter;

  beforeEach(async (): Promise<void> => {
    jest.resetAllMocks();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation((): void => undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [PromoRateLimiter, { provide: RedisService, useValue: { hitWindow } }],
    }).compile();
    limiter = moduleRef.get(PromoRateLimiter);
  });

  afterEach((): void => {
    jest.restoreAllMocks();
  });

  it('allows attempts up to the limit, counted per caller', async () => {
    hitWindow.mockResolvedValue(PROMO_ATTEMPTS_PER_WINDOW);

    await expect(limiter.check('1.2.3.4', 'WELCOME15')).resolves.toBeUndefined();

    expect(hitWindow).toHaveBeenCalledWith('ratelimit:promo:1.2.3.4', PROMO_WINDOW_SECONDS);
  });

  it('blocks with 429 and a clear code once the caller is over the limit', async () => {
    hitWindow.mockResolvedValue(PROMO_ATTEMPTS_PER_WINDOW + 1);

    const attempt = limiter.check('1.2.3.4', 'GUESS');

    await expect(attempt).rejects.toBeInstanceOf(HttpException);
    await expect(attempt).rejects.toMatchObject({ status: 429, response: { code: 'PROMO_RATE_LIMITED' } });
  });

  it('never counts or blocks a request without a code', async () => {
    await limiter.check('1.2.3.4', undefined);
    await limiter.check('1.2.3.4', '');
    await limiter.check('1.2.3.4', '   ');

    expect(hitWindow).not.toHaveBeenCalled();
  });

  it('groups callers with no address together instead of skipping the limit', async () => {
    hitWindow.mockResolvedValue(1);

    await limiter.check(undefined, 'CODE');

    expect(hitWindow).toHaveBeenCalledWith('ratelimit:promo:unknown', PROMO_WINDOW_SECONDS);
  });

  it('lets booking continue when Redis is down', async () => {
    hitWindow.mockRejectedValue(new Error('redis down'));

    await expect(limiter.check('1.2.3.4', 'CODE')).resolves.toBeUndefined();
    expect(Logger.prototype.warn).toHaveBeenCalledTimes(1);
  });
});
