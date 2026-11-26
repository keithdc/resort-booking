/**
 * @file apps/api/src/modules/identity/login-limiter.spec.ts
 * @feature identity
 */

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { fingerprint } from '../../shared/http/client-ip';
import { RedisService, type WindowState } from '../../shared/redis/redis.service';
import {
  LOGIN_MAX_FAILURES_PER_EMAIL,
  LOGIN_MAX_FAILURES_PER_IP,
  LOGIN_WINDOW_SECONDS,
  LoginLimiter,
} from './login-limiter';

describe('LoginLimiter', () => {
  const peekWindow = jest.fn<Promise<WindowState>, [string]>();
  const hitWindowWithTtl = jest.fn<Promise<WindowState>, [string, number]>();
  const deleteKey = jest.fn<Promise<void>, [string]>();
  const settings: Record<string, string> = {};

  async function build(): Promise<LoginLimiter> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        LoginLimiter,
        { provide: RedisService, useValue: { peekWindow, hitWindowWithTtl, deleteKey } },
        { provide: ConfigService, useValue: { get: (name: string): string | undefined => settings[name] } },
      ],
    }).compile();
    return moduleRef.get(LoginLimiter);
  }

  const emailKey = `ratelimit:login:email:${fingerprint('owner@example.com', '')}`;

  beforeEach(() => {
    jest.resetAllMocks();
    for (const key of Object.keys(settings)) {
      delete settings[key];
    }
    jest.spyOn(Logger.prototype, 'warn').mockImplementation((): void => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation((): void => undefined);
    peekWindow.mockResolvedValue({ count: 0, ttlSeconds: 0 });
    hitWindowWithTtl.mockResolvedValue({ count: 1, ttlSeconds: LOGIN_WINDOW_SECONDS });
    deleteKey.mockResolvedValue(undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('assertAllowed', () => {
    it('lets a clean account and network through, reading the counters without counting', async () => {
      const limiter = await build();

      await expect(limiter.assertAllowed('owner@example.com', '1.2.3.4')).resolves.toBeUndefined();

      expect(peekWindow).toHaveBeenCalledWith(emailKey);
      expect(peekWindow).toHaveBeenCalledWith('ratelimit:login:ip:1.2.3.4');
      expect(hitWindowWithTtl).not.toHaveBeenCalled();
    });

    it('locks an account after the failure limit, with Retry-After and a clear code', async () => {
      const limiter = await build();
      peekWindow.mockImplementation(async (key: string) =>
        key.includes(':email:') ? { count: LOGIN_MAX_FAILURES_PER_EMAIL, ttlSeconds: 540 } : { count: 0, ttlSeconds: 0 },
      );

      await expect(limiter.assertAllowed('owner@example.com', '1.2.3.4')).rejects.toMatchObject({
        status: 429,
        response: { code: 'LOGIN_RATE_LIMITED' },
        retryAfterSeconds: 540,
      });
    });

    it('lets the fifth try happen but not the sixth (five failures lock it)', async () => {
      const limiter = await build();
      peekWindow.mockImplementation(async (key: string) =>
        key.includes(':email:') ? { count: LOGIN_MAX_FAILURES_PER_EMAIL - 1, ttlSeconds: 100 } : { count: 0, ttlSeconds: 0 },
      );

      await expect(limiter.assertAllowed('owner@example.com', '1.2.3.4')).resolves.toBeUndefined();
    });

    it('blocks a network that fails against many accounts', async () => {
      const limiter = await build();
      peekWindow.mockImplementation(async (key: string) =>
        key.includes(':ip:') ? { count: LOGIN_MAX_FAILURES_PER_IP, ttlSeconds: 300 } : { count: 0, ttlSeconds: 0 },
      );

      await expect(limiter.assertAllowed('anyone@example.com', '9.9.9.9')).rejects.toMatchObject({ status: 429, retryAfterSeconds: 300 });
    });

    it('falls back to the whole window when Redis gives no TTL', async () => {
      const limiter = await build();
      peekWindow.mockResolvedValue({ count: LOGIN_MAX_FAILURES_PER_EMAIL, ttlSeconds: 0 });

      await expect(limiter.assertAllowed('owner@example.com', '1.2.3.4')).rejects.toMatchObject({ retryAfterSeconds: LOGIN_WINDOW_SECONDS });
    });

    it('FAILS CLOSED when Redis is down: 503, never an open door', async () => {
      const limiter = await build();
      peekWindow.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(limiter.assertAllowed('owner@example.com', '1.2.3.4')).rejects.toMatchObject({
        status: 503,
        response: { code: 'LOGIN_UNAVAILABLE' },
      });
      expect(Logger.prototype.error).toHaveBeenCalled();
    });

    it('keys by a hash of the email, never the address', async () => {
      const limiter = await build();

      await limiter.assertAllowed('Owner@Example.com ', '1.2.3.4');

      expect(peekWindow.mock.calls.map((call) => call[0]).join(' ')).not.toContain('owner@example.com');
    });
  });

  describe('recordFailure and recordSuccess', () => {
    it('counts a failure against the email and the IP in the lock window', async () => {
      const limiter = await build();

      await limiter.recordFailure('owner@example.com', '1.2.3.4');

      expect(hitWindowWithTtl).toHaveBeenCalledWith(emailKey, LOGIN_WINDOW_SECONDS);
      expect(hitWindowWithTtl).toHaveBeenCalledWith('ratelimit:login:ip:1.2.3.4', LOGIN_WINDOW_SECONDS);
    });

    it('never throws when Redis fails while counting', async () => {
      const limiter = await build();
      hitWindowWithTtl.mockRejectedValue(new Error('down'));

      await expect(limiter.recordFailure('owner@example.com', '1.2.3.4')).resolves.toBeUndefined();
      expect(Logger.prototype.warn).toHaveBeenCalled();
    });

    it('clears the email counter after a success, and tolerates Redis failing', async () => {
      const limiter = await build();

      await limiter.recordSuccess('owner@example.com');
      expect(deleteKey).toHaveBeenCalledWith(emailKey);

      deleteKey.mockRejectedValue(new Error('down'));
      await expect(limiter.recordSuccess('owner@example.com')).resolves.toBeUndefined();
    });

    it('groups callers with no IP together instead of skipping the limit', async () => {
      const limiter = await build();

      await limiter.recordFailure('owner@example.com', undefined);

      expect(hitWindowWithTtl).toHaveBeenCalledWith('ratelimit:login:ip:unknown', LOGIN_WINDOW_SECONDS);
    });
  });

  it('takes its limits from the environment and ignores bad values', async () => {
    settings.LOGIN_MAX_FAILURES_PER_EMAIL = '2';
    settings.LOGIN_MAX_FAILURES_PER_IP = 'lots';
    settings.LOGIN_LOCK_WINDOW_SECONDS = '60';
    const limiter = await build();
    peekWindow.mockImplementation(async (key: string) =>
      key.includes(':email:') ? { count: 2, ttlSeconds: 10 } : { count: LOGIN_MAX_FAILURES_PER_IP - 1, ttlSeconds: 0 },
    );

    await expect(limiter.assertAllowed('owner@example.com', '1.2.3.4')).rejects.toMatchObject({ status: 429 });
    await limiter.recordFailure('owner@example.com', '1.2.3.4');
    expect(hitWindowWithTtl).toHaveBeenCalledWith(expect.any(String), 60);
  });
});
