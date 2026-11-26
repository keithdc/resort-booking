/**
 * @file apps/api/src/modules/inventory/hold-rate-limiter.spec.ts
 * @feature inventory
 */

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { fingerprint } from '../../shared/http/client-ip';
import { RedisService, type WindowState } from '../../shared/redis/redis.service';
import { BROWSE_DEFAULT, HOLD_PER_EMAIL_DEFAULT, HOLD_PER_IP_DEFAULT, HoldRateLimiter } from './hold-rate-limiter';

describe('HoldRateLimiter', () => {
  const hit = jest.fn<Promise<WindowState>, [string, number]>();
  const settings: Record<string, string> = {};

  async function build(): Promise<HoldRateLimiter> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        HoldRateLimiter,
        { provide: RedisService, useValue: { hitWindowWithTtl: hit } },
        { provide: ConfigService, useValue: { get: (name: string): string | undefined => settings[name] } },
      ],
    }).compile();
    return moduleRef.get(HoldRateLimiter);
  }

  beforeEach(() => {
    jest.resetAllMocks();
    for (const key of Object.keys(settings)) {
      delete settings[key];
    }
    jest.spyOn(Logger.prototype, 'warn').mockImplementation((): void => undefined);
    hit.mockResolvedValue({ count: 1, ttlSeconds: 100 });
  });

  afterEach(() => jest.restoreAllMocks());

  it('counts a hold for the IP and, separately, for a hash of the email', async () => {
    const limiter = await build();

    await limiter.checkHold('1.2.3.4', 'Guest@Example.com');

    expect(hit).toHaveBeenNthCalledWith(1, 'ratelimit:hold:ip:1.2.3.4', HOLD_PER_IP_DEFAULT.windowSeconds);
    expect(hit).toHaveBeenNthCalledWith(2, `ratelimit:hold:email:${fingerprint('guest@example.com')}`, HOLD_PER_EMAIL_DEFAULT.windowSeconds);
    expect(hit.mock.calls[1]?.[0]).not.toContain('guest');
  });

  it('blocks with 429 HOLD_RATE_LIMITED when the IP is over its limit, without counting the email', async () => {
    const limiter = await build();
    hit.mockResolvedValueOnce({ count: HOLD_PER_IP_DEFAULT.limit + 1, ttlSeconds: 90 });

    await expect(limiter.checkHold('1.2.3.4', 'a@b.co')).rejects.toMatchObject({
      status: 429,
      response: { code: 'HOLD_RATE_LIMITED' },
      retryAfterSeconds: 90,
    });
    expect(hit).toHaveBeenCalledTimes(1);
  });

  it('blocks when one email is over its limit even from a fresh IP', async () => {
    const limiter = await build();
    hit.mockResolvedValueOnce({ count: 1, ttlSeconds: 90 });
    hit.mockResolvedValueOnce({ count: HOLD_PER_EMAIL_DEFAULT.limit + 1, ttlSeconds: 400 });

    await expect(limiter.checkHold('9.9.9.9', 'a@b.co')).rejects.toMatchObject({ status: 429, retryAfterSeconds: 400 });
  });

  it('lets a hold through, with a warning, when Redis is down', async () => {
    const limiter = await build();
    hit.mockRejectedValue(new Error('down'));

    await expect(limiter.checkHold('1.2.3.4', 'a@b.co')).resolves.toBeUndefined();
    expect(Logger.prototype.warn).toHaveBeenCalled();
  });

  it('has a generous browse limit that blocks only scraping', async () => {
    const limiter = await build();
    hit.mockResolvedValue({ count: BROWSE_DEFAULT.limit, ttlSeconds: 5 });
    await expect(limiter.checkBrowse('1.2.3.4')).resolves.toBeUndefined();

    hit.mockResolvedValue({ count: BROWSE_DEFAULT.limit + 1, ttlSeconds: 5 });
    await expect(limiter.checkBrowse('1.2.3.4')).rejects.toMatchObject({ status: 429, response: { code: 'BROWSE_RATE_LIMITED' } });
    expect(hit).toHaveBeenLastCalledWith('ratelimit:browse:1.2.3.4', BROWSE_DEFAULT.windowSeconds);
  });

  it('reads limits from the environment', async () => {
    settings.HOLD_IP_LIMIT = '2';
    settings.HOLD_IP_WINDOW_SECONDS = '30';
    const limiter = await build();
    hit.mockResolvedValueOnce({ count: 3, ttlSeconds: 10 });

    await expect(limiter.checkHold('1.2.3.4', 'a@b.co')).rejects.toMatchObject({ status: 429 });
    expect(hit).toHaveBeenCalledWith('ratelimit:hold:ip:1.2.3.4', 30);
  });
});
