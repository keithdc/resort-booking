/**
 * @file apps/api/src/modules/identity/two-factor-limiter.spec.ts
 * @feature identity
 */

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { RedisService, type WindowState } from '../../shared/redis/redis.service';
import {
  TWO_FACTOR_MAX_FAILURES_PER_IP,
  TWO_FACTOR_MAX_FAILURES_PER_USER,
  TWO_FACTOR_WINDOW_SECONDS,
  TwoFactorLimiter,
} from './two-factor-limiter';

describe('TwoFactorLimiter', () => {
  const peekWindow = jest.fn<Promise<WindowState>, [string]>();
  const hitWindowWithTtl = jest.fn<Promise<WindowState>, [string, number]>();
  const deleteKey = jest.fn<Promise<void>, [string]>();
  const settings: Record<string, string> = {};

  async function build(): Promise<TwoFactorLimiter> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TwoFactorLimiter,
        { provide: RedisService, useValue: { peekWindow, hitWindowWithTtl, deleteKey } },
        { provide: ConfigService, useValue: { get: (name: string): string | undefined => settings[name] } },
      ],
    }).compile();
    return moduleRef.get(TwoFactorLimiter);
  }

  beforeEach(() => {
    jest.resetAllMocks();
    for (const key of Object.keys(settings)) {
      delete settings[key];
    }
    jest.spyOn(Logger.prototype, 'warn').mockImplementation((): void => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation((): void => undefined);
    peekWindow.mockResolvedValue({ count: 0, ttlSeconds: 0 });
    hitWindowWithTtl.mockResolvedValue({ count: 1, ttlSeconds: TWO_FACTOR_WINDOW_SECONDS });
    deleteKey.mockResolvedValue(undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('reads the per-person and per-IP counters without counting', async () => {
    const limiter = await build();

    await expect(limiter.assertAllowed('user-1', '1.2.3.4')).resolves.toBeUndefined();

    expect(peekWindow).toHaveBeenCalledWith('ratelimit:2fa:user:user-1');
    expect(peekWindow).toHaveBeenCalledWith('ratelimit:2fa:ip:1.2.3.4');
    expect(hitWindowWithTtl).not.toHaveBeenCalled();
  });

  it('allows the fifth try and blocks once five wrong codes are counted, with Retry-After', async () => {
    const limiter = await build();
    peekWindow.mockImplementation(async (key: string) =>
      key.includes(':user:') ? { count: TWO_FACTOR_MAX_FAILURES_PER_USER - 1, ttlSeconds: 100 } : { count: 0, ttlSeconds: 0 },
    );
    await expect(limiter.assertAllowed('user-1', '1.2.3.4')).resolves.toBeUndefined();

    peekWindow.mockImplementation(async (key: string) =>
      key.includes(':user:') ? { count: TWO_FACTOR_MAX_FAILURES_PER_USER, ttlSeconds: 420 } : { count: 0, ttlSeconds: 0 },
    );
    await expect(limiter.assertAllowed('user-1', '1.2.3.4')).rejects.toMatchObject({
      status: 429,
      response: { code: 'TWO_FACTOR_RATE_LIMITED' },
      retryAfterSeconds: 420,
    });
  });

  it('blocks a network with too many wrong codes across accounts', async () => {
    const limiter = await build();
    peekWindow.mockImplementation(async (key: string) =>
      key.includes(':ip:') ? { count: TWO_FACTOR_MAX_FAILURES_PER_IP, ttlSeconds: 90 } : { count: 0, ttlSeconds: 0 },
    );

    await expect(limiter.assertAllowed('user-2', '9.9.9.9')).rejects.toMatchObject({ status: 429, retryAfterSeconds: 90 });
  });

  it('FAILS CLOSED when Redis is down', async () => {
    const limiter = await build();
    peekWindow.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(limiter.assertAllowed('user-1', '1.2.3.4')).rejects.toMatchObject({
      status: 503,
      response: { code: 'TWO_FACTOR_UNAVAILABLE' },
    });
  });

  it('counts a wrong code against the person and the IP (atomic hit), or the IP only when the person is unknown', async () => {
    const limiter = await build();

    await limiter.recordFailure('user-1', '1.2.3.4');
    expect(hitWindowWithTtl).toHaveBeenCalledWith('ratelimit:2fa:user:user-1', TWO_FACTOR_WINDOW_SECONDS);
    expect(hitWindowWithTtl).toHaveBeenCalledWith('ratelimit:2fa:ip:1.2.3.4', TWO_FACTOR_WINDOW_SECONDS);

    hitWindowWithTtl.mockClear();
    await limiter.recordFailure(null, undefined);
    expect(hitWindowWithTtl).toHaveBeenCalledTimes(1);
    expect(hitWindowWithTtl).toHaveBeenCalledWith('ratelimit:2fa:ip:unknown', TWO_FACTOR_WINDOW_SECONDS);
  });

  it('never throws when Redis fails while counting or clearing', async () => {
    const limiter = await build();
    hitWindowWithTtl.mockRejectedValue(new Error('down'));
    deleteKey.mockRejectedValue(new Error('down'));

    await expect(limiter.recordFailure('user-1', '1.2.3.4')).resolves.toBeUndefined();
    await expect(limiter.recordSuccess('user-1')).resolves.toBeUndefined();
  });

  it('clears the person counter after a correct code', async () => {
    const limiter = await build();

    await limiter.recordSuccess('user-1');

    expect(deleteKey).toHaveBeenCalledWith('ratelimit:2fa:user:user-1');
  });

  it('takes limits from the environment and ignores bad values', async () => {
    settings.TWO_FACTOR_MAX_FAILURES_PER_USER = '2';
    settings.TWO_FACTOR_MAX_FAILURES_PER_IP = 'many';
    settings.TWO_FACTOR_LOCK_WINDOW_SECONDS = '60';
    const limiter = await build();
    peekWindow.mockImplementation(async (key: string) =>
      key.includes(':user:') ? { count: 2, ttlSeconds: 5 } : { count: TWO_FACTOR_MAX_FAILURES_PER_IP - 1, ttlSeconds: 0 },
    );

    await expect(limiter.assertAllowed('user-1', '1.2.3.4')).rejects.toMatchObject({ status: 429 });
    await limiter.recordFailure('user-1', '1.2.3.4');
    expect(hitWindowWithTtl).toHaveBeenCalledWith(expect.any(String), 60);
  });
});
