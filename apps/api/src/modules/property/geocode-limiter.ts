/**
 * @file apps/api/src/modules/property/geocode-limiter.ts
 * @feature property
 * @dependencies RedisService
 */

import { HttpException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RateLimitedException } from '../../shared/http/rate-limited.exception';
import { limitSettingFromConfig, type LimitSetting } from '../../shared/redis/rate-limit';
import { RedisService } from '../../shared/redis/redis.service';

/** One staff member: type-ahead sends a request per pause in typing, so this is generous for a person and tiny for a loop. */
export const GEOCODE_PER_STAFF_DEFAULT: LimitSetting = { limit: 30, windowSeconds: 60 };
/** Everyone together. Nominatim's policy allows one request per second per application; the cache keeps real use well below. */
export const GEOCODE_GLOBAL_DEFAULT: LimitSetting = { limit: 60, windowSeconds: 60 };

interface LocalWindow {
  count: number;
  resetAt: number;
}

/**
 * Limits the calls that forward to Photon and Nominatim (docs/13 R2-20): per signed-in staff member and for the whole
 * deployment (GEOCODE_STAFF_LIMIT, GEOCODE_GLOBAL_LIMIT, each also *_WINDOW_SECONDS). Counted in Redis. If Redis is down
 * the same limits are enforced from this process's own memory, so a Redis outage never opens the upstream to a loop.
 */
@Injectable()
export class GeocodeLimiter {
  private readonly logger = new Logger(GeocodeLimiter.name);
  private readonly perStaff: LimitSetting;
  private readonly global: LimitSetting;
  private readonly local = new Map<string, LocalWindow>();

  public constructor(
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    this.perStaff = limitSettingFromConfig(config, 'GEOCODE_STAFF', GEOCODE_PER_STAFF_DEFAULT);
    this.global = limitSettingFromConfig(config, 'GEOCODE_GLOBAL', GEOCODE_GLOBAL_DEFAULT);
  }

  /** Counts one upstream-bound request; throws 429 GEOCODE_RATE_LIMITED with Retry-After when over either limit. */
  public async check(staffUserId: string): Promise<void> {
    await this.hit(`ratelimit:geocode:staff:${staffUserId}`, this.perStaff, 'Too many address searches. Wait a moment and try again.');
    await this.hit('ratelimit:geocode:global', this.global, 'Address search is busy. Wait a moment and try again.');
  }

  private async hit(key: string, setting: LimitSetting, message: string): Promise<void> {
    let count: number;
    let ttlSeconds: number;
    try {
      ({ count, ttlSeconds } = await this.redis.hitWindowWithTtl(key, setting.windowSeconds));
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.warn('Geocode limit counted in memory: Redis unavailable');
      ({ count, ttlSeconds } = this.hitLocal(key, setting));
    }
    if (count > setting.limit) {
      throw new RateLimitedException('GEOCODE_RATE_LIMITED', message, ttlSeconds > 0 ? ttlSeconds : setting.windowSeconds);
    }
  }

  private hitLocal(key: string, setting: LimitSetting): { count: number; ttlSeconds: number } {
    const now = Date.now();
    const current = this.local.get(key);
    if (current === undefined || current.resetAt <= now) {
      this.sweepLocal(now);
      this.local.set(key, { count: 1, resetAt: now + setting.windowSeconds * 1000 });
      return { count: 1, ttlSeconds: setting.windowSeconds };
    }
    current.count += 1;
    return { count: current.count, ttlSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }

  /** Drops finished windows so the map cannot grow without bound. */
  private sweepLocal(now: number): void {
    for (const [key, window] of this.local) {
      if (window.resetAt <= now) {
        this.local.delete(key);
      }
    }
  }
}
