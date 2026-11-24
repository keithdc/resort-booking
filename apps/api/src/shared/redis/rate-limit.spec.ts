/**
 * @file apps/api/src/shared/redis/rate-limit.spec.ts
 * @shared Fixed-window rate limit helper
 */

import { HttpException, Logger } from '@nestjs/common';
import { enforceWindowLimit, type RateLimitOptions } from './rate-limit';
import type { RedisService } from './redis.service';

const OPTIONS: RateLimitOptions = {
  keyPrefix: 'ratelimit:test:',
  callerId: '9.9.9.9',
  limit: 3,
  windowSeconds: 30,
  code: 'TEST_LIMITED',
  message: 'Slow down.',
};

describe('enforceWindowLimit', () => {
  const hitWindow = jest.fn<Promise<number>, [string, number]>();
  const warn = jest.spyOn(Logger.prototype, 'warn');
  const logger = new Logger('test');
  const redis: Pick<RedisService, 'hitWindow'> = { hitWindow };

  beforeEach(() => {
    hitWindow.mockReset();
    warn.mockReset();
    warn.mockImplementation((): void => undefined);
  });

  it('counts one attempt in the caller\'s own window', async () => {
    hitWindow.mockResolvedValue(1);

    await enforceWindowLimit(redis as RedisService, logger, OPTIONS);

    expect(hitWindow).toHaveBeenCalledTimes(1);
    expect(hitWindow).toHaveBeenCalledWith('ratelimit:test:9.9.9.9', 30);
  });

  it('allows exactly the limit and blocks the next one with 429 and the given code and message', async () => {
    hitWindow.mockResolvedValue(3);
    await expect(enforceWindowLimit(redis as RedisService, logger, OPTIONS)).resolves.toBeUndefined();

    hitWindow.mockResolvedValue(4);
    const blocked = enforceWindowLimit(redis as RedisService, logger, OPTIONS);

    await expect(blocked).rejects.toBeInstanceOf(HttpException);
    await expect(blocked).rejects.toMatchObject({ status: 429, response: { code: 'TEST_LIMITED', message: 'Slow down.' } });
  });

  it('shares one bucket between callers with no address', async () => {
    hitWindow.mockResolvedValue(1);

    await enforceWindowLimit(redis as RedisService, logger, { ...OPTIONS, callerId: undefined });

    expect(hitWindow).toHaveBeenCalledWith('ratelimit:test:unknown', 30);
  });

  it('skips the check and warns when Redis fails', async () => {
    hitWindow.mockRejectedValue(new Error('down'));

    await expect(enforceWindowLimit(redis as RedisService, logger, OPTIONS)).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith('TEST_LIMITED check skipped: Redis unavailable');
  });
});
