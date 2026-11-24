/**
 * @file apps/api/src/shared/redis/redis.service.ts
 * @shared Redis client for hold TTLs (not the reservation ledger)
 * @dependencies ioredis
 */

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

const HOLD_PREFIX = 'hold:';

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
    await this.ensureConnected();
    const count = await this.client.incr(key);
    if (count === 1) {
      await this.client.expire(key, windowSeconds);
    }
    return count;
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
