/**
 * @file apps/api/src/shared/http/public-rate-limit.spec.ts
 * @shared Public route limiter: buckets, IPv6 prefix keys, env overrides, Redis-down policy
 */

import { ConfigService } from '@nestjs/config';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { Test } from '@nestjs/testing';
import { RedisService } from '../redis/redis.service';
import { PUBLIC_PAYMENT_DEFAULT, PUBLIC_READ_DEFAULT, PublicRateLimit, PublicRateLimitGuard } from './public-rate-limit';

class Sample {
  @PublicRateLimit('read')
  public read(): void {}

  @PublicRateLimit('payment')
  public pay(): void {}

  public open(): void {}
}

/** The decorated method itself (metadata lives on it, not on a bound copy). */
function handlerOf(name: 'read' | 'pay' | 'open'): NonNullable<ConstructorParameters<typeof ExecutionContextHost>[2]> {
  const handler: unknown = Reflect.get(Sample.prototype, name);
  if (typeof handler !== 'function') {
    throw new Error(`Sample.${name} is not a function`);
  }
  return handler;
}

function context(name: 'read' | 'pay' | 'open', ip: string | undefined): ExecutionContextHost {
  return new ExecutionContextHost([{ ip }], Sample, handlerOf(name));
}

async function build(
  hits: { count: number; ttlSeconds: number } | Error,
  env: Record<string, string> = {},
): Promise<{ guard: PublicRateLimitGuard; hit: jest.Mock }> {
  const hit = jest.fn(() => (hits instanceof Error ? Promise.reject(hits) : Promise.resolve(hits)));
  const moduleRef = await Test.createTestingModule({
    providers: [
      PublicRateLimitGuard,
      { provide: RedisService, useValue: { hitWindowWithTtl: hit } },
      { provide: ConfigService, useValue: { get: (name: string): string | undefined => env[name] } },
    ],
  }).compile();
  return { guard: moduleRef.get(PublicRateLimitGuard), hit };
}

describe('PublicRateLimitGuard', () => {
  it('lets a request under the read limit through and counts it per IP', async () => {
    const { guard, hit } = await build({ count: 1, ttlSeconds: 60 });

    await expect(guard.canActivate(context('read', '203.0.113.9'))).resolves.toBe(true);
    expect(hit).toHaveBeenCalledWith('ratelimit:public:read:203.0.113.9', PUBLIC_READ_DEFAULT.windowSeconds);
  });

  it('answers 429 PUBLIC_RATE_LIMITED with Retry-After over the read limit', async () => {
    const { guard } = await build({ count: PUBLIC_READ_DEFAULT.limit + 1, ttlSeconds: 17 });

    await expect(guard.canActivate(context('read', '203.0.113.9'))).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 17,
      response: { code: 'PUBLIC_RATE_LIMITED' },
    });
  });

  it('allows exactly the limit and refuses the next one', async () => {
    const atLimit = await build({ count: PUBLIC_READ_DEFAULT.limit, ttlSeconds: 5 });
    const over = await build({ count: PUBLIC_READ_DEFAULT.limit + 1, ttlSeconds: 5 });

    await expect(atLimit.guard.canActivate(context('read', '203.0.113.9'))).resolves.toBe(true);
    await expect(over.guard.canActivate(context('read', '203.0.113.9'))).rejects.toMatchObject({ status: 429 });
  });

  it('uses a separate, tighter bucket for payments', async () => {
    const { guard, hit } = await build({ count: PUBLIC_PAYMENT_DEFAULT.limit + 1, ttlSeconds: 400 });

    await expect(guard.canActivate(context('pay', '203.0.113.9'))).rejects.toMatchObject({
      status: 429,
      response: { code: 'PAYMENT_RATE_LIMITED' },
    });
    expect(hit).toHaveBeenCalledWith('ratelimit:public:payment:203.0.113.9', PUBLIC_PAYMENT_DEFAULT.windowSeconds);
    expect(PUBLIC_PAYMENT_DEFAULT.limit).toBeLessThan(PUBLIC_READ_DEFAULT.limit);
  });

  it('keys an IPv6 client by its /64 so rotating addresses share one budget', async () => {
    const { guard, hit } = await build({ count: 1, ttlSeconds: 60 });

    await guard.canActivate(context('read', '2001:db8:1:2:aaaa:bbbb:cccc:dddd'));
    await guard.canActivate(context('read', '2001:db8:1:2::77'));

    expect(hit.mock.calls.map((call): unknown => call[0])).toEqual([
      'ratelimit:public:read:2001:db8:1:2::/64',
      'ratelimit:public:read:2001:db8:1:2::/64',
    ]);
  });

  it('honours env overrides, and a bad value keeps the default', async () => {
    const tuned = await build({ count: 4, ttlSeconds: 9 }, { PUBLIC_READ_LIMIT: '3', PUBLIC_READ_WINDOW_SECONDS: '30' });
    await expect(tuned.guard.canActivate(context('read', '203.0.113.9'))).rejects.toMatchObject({ status: 429 });
    expect(tuned.hit).toHaveBeenCalledWith('ratelimit:public:read:203.0.113.9', 30);

    const bad = await build({ count: 4, ttlSeconds: 9 }, { PUBLIC_READ_LIMIT: 'abc' });
    await expect(bad.guard.canActivate(context('read', '203.0.113.9'))).resolves.toBe(true);
  });

  it('fails open when Redis is down (guest browsing and paying must not depend on it)', async () => {
    const { guard } = await build(new Error('redis down'));

    await expect(guard.canActivate(context('read', '203.0.113.9'))).resolves.toBe(true);
    await expect(guard.canActivate(context('pay', '203.0.113.9'))).resolves.toBe(true);
  });

  it('shares one bucket among callers with no address', async () => {
    const { guard, hit } = await build({ count: 1, ttlSeconds: 60 });

    await guard.canActivate(context('read', undefined));

    expect(hit).toHaveBeenCalledWith('ratelimit:public:read:unknown', PUBLIC_READ_DEFAULT.windowSeconds);
  });

  it('does nothing on a route without the decorator', async () => {
    const { guard, hit } = await build({ count: 999_999, ttlSeconds: 1 });

    await expect(guard.canActivate(context('open', '203.0.113.9'))).resolves.toBe(true);
    expect(hit).not.toHaveBeenCalled();
  });
});
