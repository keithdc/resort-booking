/**
 * @file apps/api/src/shared/redis/rate-limit.spec.ts
 * @shared Fixed-window rate limit helper
 */

import { HttpException, Logger } from '@nestjs/common';
import { RateLimitedException } from '../http/rate-limited.exception';
import { enforceWindowLimit, limitSetting, type RateLimitOptions } from './rate-limit';
import type { RedisService, WindowState } from './redis.service';

const OPTIONS: RateLimitOptions = {
  keyPrefix: 'ratelimit:test:',
  callerId: '9.9.9.9',
  limit: 3,
  windowSeconds: 30,
  code: 'TEST_LIMITED',
  message: 'Slow down.',
};

describe('enforceWindowLimit', () => {
  const hitWindowWithTtl = jest.fn<Promise<WindowState>, [string, number]>();
  const warn = jest.spyOn(Logger.prototype, 'warn');
  const logger = new Logger('test');
  const redis: Pick<RedisService, 'hitWindowWithTtl'> = { hitWindowWithTtl };

  beforeEach(() => {
    hitWindowWithTtl.mockReset();
    warn.mockReset();
    warn.mockImplementation((): void => undefined);
  });

  it('counts one attempt in the caller\'s own window', async () => {
    hitWindowWithTtl.mockResolvedValue({ count: 1, ttlSeconds: 12 });

    await enforceWindowLimit(redis as RedisService, logger, OPTIONS);

    expect(hitWindowWithTtl).toHaveBeenCalledTimes(1);
    expect(hitWindowWithTtl).toHaveBeenCalledWith('ratelimit:test:9.9.9.9', 30);
  });

  it('allows exactly the limit and blocks the next one with 429 and the given code and message', async () => {
    hitWindowWithTtl.mockResolvedValue({ count: 3, ttlSeconds: 12 });
    await expect(enforceWindowLimit(redis as RedisService, logger, OPTIONS)).resolves.toBeUndefined();

    hitWindowWithTtl.mockResolvedValue({ count: 4, ttlSeconds: 12 });
    const blocked = enforceWindowLimit(redis as RedisService, logger, OPTIONS);

    await expect(blocked).rejects.toBeInstanceOf(HttpException);
    await expect(blocked).rejects.toMatchObject({ status: 429, response: { code: 'TEST_LIMITED', message: 'Slow down.' } });
  });

  it('tells the caller how long until the window resets (Retry-After)', async () => {
    hitWindowWithTtl.mockResolvedValue({ count: 4, ttlSeconds: 12 });

    await expect(enforceWindowLimit(redis as RedisService, logger, OPTIONS)).rejects.toMatchObject({ retryAfterSeconds: 12 });
    await expect(enforceWindowLimit(redis as RedisService, logger, OPTIONS)).rejects.toBeInstanceOf(RateLimitedException);
  });

  it('falls back to the whole window when Redis reports no TTL', async () => {
    hitWindowWithTtl.mockResolvedValue({ count: 4, ttlSeconds: 0 });

    await expect(enforceWindowLimit(redis as RedisService, logger, OPTIONS)).rejects.toMatchObject({ retryAfterSeconds: 30 });
  });

  it('shares one bucket between callers with no address', async () => {
    hitWindowWithTtl.mockResolvedValue({ count: 1, ttlSeconds: 12 });

    await enforceWindowLimit(redis as RedisService, logger, { ...OPTIONS, callerId: undefined });

    expect(hitWindowWithTtl).toHaveBeenCalledWith('ratelimit:test:unknown', 30);
  });

  it('skips the check and warns when Redis fails', async () => {
    hitWindowWithTtl.mockRejectedValue(new Error('down'));

    await expect(enforceWindowLimit(redis as RedisService, logger, OPTIONS)).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith('TEST_LIMITED check skipped: Redis unavailable');
  });
});

describe('limitSetting', () => {
  const defaults = { limit: 10, windowSeconds: 60 };

  it('uses the defaults when nothing is set', () => {
    expect(limitSetting({}, 'X', defaults)).toEqual(defaults);
  });

  it('reads the operator\'s values', () => {
    expect(limitSetting({ X_LIMIT: '3', X_WINDOW_SECONDS: '600' }, 'X', defaults)).toEqual({ limit: 3, windowSeconds: 600 });
  });

  it('never turns a limit off: zero, negative or text keeps the default', () => {
    expect(limitSetting({ X_LIMIT: '0', X_WINDOW_SECONDS: '-5' }, 'X', defaults)).toEqual(defaults);
    expect(limitSetting({ X_LIMIT: 'off', X_WINDOW_SECONDS: 'x' }, 'X', defaults)).toEqual(defaults);
  });
});
