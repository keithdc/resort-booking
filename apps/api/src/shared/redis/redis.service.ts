/**
 * @file apps/api/src/shared/redis/redis.service.ts
 * @shared Redis client for hold TTLs (not the reservation ledger)
 * @dependencies ioredis
 */

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

const HOLD_PREFIX = 'hold:';

/** Count and TTL of a rate-limit window. */
export interface WindowState {
  count: number;
  /** Seconds until the window resets (0 when there is no window). */
  ttlSeconds: number;
}

/**
 * Counts a hit and starts the window in ONE atomic step (a crash between INCR and EXPIRE can no longer
 * leave a counter that never expires and locks a caller out for good). Returns { count, ttl }.
 */
const HIT_WINDOW_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('TTL', KEYS[1])
if ttl < 0 then redis.call('EXPIRE', KEYS[1], ARGV[1]) ttl = tonumber(ARGV[1]) end
return { count, ttl }
`;

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;

  public constructor(config: ConfigService) {
    this.client = new Redis(config.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
  }

  /**
   * Sets a hold TTL key. Durable row stays in PostgreSQL.
   */
  public async setHoldTtl(holdId: string, ttlSeconds: number): Promise<void> {
    await this.ensureConnected();
    await this.client.set(`${HOLD_PREFIX}${holdId}`, '1', 'EX', ttlSeconds);
  }

  /**
   * Remaining TTL in seconds, or -2 if missing, -1 if no expire.
   */
  public async getHoldTtlSeconds(holdId: string): Promise<number> {
    await this.ensureConnected();
    return this.client.ttl(`${HOLD_PREFIX}${holdId}`);
  }

  /**
   * Counts a hit in a fixed window and returns the count so far (the window starts at the first hit).
   * Used for rate limits; nothing durable lives here.
   */
  public async hitWindow(key: string, windowSeconds: number): Promise<number> {
    return (await this.hitWindowWithTtl(key, windowSeconds)).count;
  }

  /**
   * Like hitWindow, atomic, and also says how long until the window resets (for Retry-After).
   */
  public async hitWindowWithTtl(key: string, windowSeconds: number): Promise<WindowState> {
    await this.ensureConnected();
    const raw: unknown = await this.client.eval(HIT_WINDOW_SCRIPT, 1, key, String(windowSeconds));
    return parseWindowState(raw);
  }

  /**
   * Reads a window without counting. Missing key => zero.
   */
  public async peekWindow(key: string): Promise<WindowState> {
    await this.ensureConnected();
    const [value, ttl] = await Promise.all([this.client.get(key), this.client.ttl(key)]);
    const count = value === null ? 0 : Number.parseInt(value, 10);
    return { count: Number.isFinite(count) ? count : 0, ttlSeconds: ttl > 0 ? ttl : 0 };
  }

  /**
   * Forgets a rate-limit key (e.g. failed logins after a successful one).
   */
  public async deleteKey(key: string): Promise<void> {
    await this.ensureConnected();
    await this.client.del(key);
  }

  /**
   * Drops the ephemeral hold key.
   */
  public async deleteHoldTtl(holdId: string): Promise<void> {
    await this.ensureConnected();
    await this.client.del(`${HOLD_PREFIX}${holdId}`);
  }

  /**
   * True when Redis answers PING.
   */
  public async ping(): Promise<boolean> {
    try {
      await this.ensureConnected();
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  public async onModuleDestroy(): Promise<void> {
    this.client.disconnect();
  }

  private async ensureConnected(): Promise<void> {
    if (this.client.status === 'wait' || this.client.status === 'end') {
      await this.client.connect();
    }
  }
}

/**
 * Narrows the script's reply ({ count, ttl }) without trusting its type.
 */
export function parseWindowState(raw: unknown): WindowState {
  if (Array.isArray(raw) && typeof raw[0] === 'number' && typeof raw[1] === 'number') {
    return { count: raw[0], ttlSeconds: Math.max(0, raw[1]) };
  }
  throw new Error('Unexpected reply from the rate-limit script');
}
