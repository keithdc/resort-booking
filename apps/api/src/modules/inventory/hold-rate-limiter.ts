/**
 * @file apps/api/src/modules/inventory/hold-rate-limiter.ts
 * @feature inventory
 * @dependencies RedisService
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readIntEnv, resolveIpHashSalt } from '../../shared/config/environment';
import { fingerprint } from '../../shared/http/client-ip';
import { enforceWindowLimit, limitSettingFromConfig, type LimitSetting } from '../../shared/redis/rate-limit';
import { RedisService } from '../../shared/redis/redis.service';

export const HOLD_PER_IP_DEFAULT: LimitSetting = { limit: 10, windowSeconds: 600 };
export const HOLD_PER_EMAIL_DEFAULT: LimitSetting = { limit: 6, windowSeconds: 600 };
export const MAX_ACTIVE_HOLDS_PER_EMAIL_DEFAULT = 3;
export const MAX_ACTIVE_HOLDS_PER_IP_DEFAULT = 5;
export const BROWSE_DEFAULT: LimitSetting = { limit: 120, windowSeconds: 60 };

/**
 * Speed limits for creating holds (a hold blocks the calendar, so it is the one guest action worth abusing)
 * and a generous one for search, quotes and availability (stops scraping, never normal browsing).
 * Tune with HOLD_IP_LIMIT, HOLD_EMAIL_LIMIT, BROWSE_LIMIT (each also *_WINDOW_SECONDS).
 */
@Injectable()
export class HoldRateLimiter {
  private readonly logger = new Logger(HoldRateLimiter.name);
  private readonly perIp: LimitSetting;
  private readonly perEmail: LimitSetting;
  private readonly browse: LimitSetting;
  private readonly ipSalt: string;
  private readonly capPerEmail: number;
  private readonly capPerIp: number;

  public constructor(
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    this.perIp = limitSettingFromConfig(config, 'HOLD_IP', HOLD_PER_IP_DEFAULT);
    this.perEmail = limitSettingFromConfig(config, 'HOLD_EMAIL', HOLD_PER_EMAIL_DEFAULT);
    this.browse = limitSettingFromConfig(config, 'BROWSE', BROWSE_DEFAULT);
    this.ipSalt = resolveIpHashSalt(config.get<string>('IP_HASH_SALT'));
    this.capPerEmail = readIntEnv(
      { v: config.get<string>('MAX_ACTIVE_HOLDS_PER_EMAIL') },
      'v',
      MAX_ACTIVE_HOLDS_PER_EMAIL_DEFAULT,
      1,
      100,
    );
    this.capPerIp = readIntEnv({ v: config.get<string>('MAX_ACTIVE_HOLDS_PER_IP') }, 'v', MAX_ACTIVE_HOLDS_PER_IP_DEFAULT, 1, 1000);
  }

  /**
   * Counts a hold attempt for this IP and for this email; 429 `HOLD_RATE_LIMITED` once either is over.
   * Skipped (with a warning) if Redis is down: the concurrent-hold cap in the database still applies.
   */
  public async checkHold(callerId: string | undefined, email: string): Promise<void> {
    await enforceWindowLimit(this.redis, this.logger, {
      keyPrefix: 'ratelimit:hold:ip:',
      callerId,
      ...this.perIp,
      code: 'HOLD_RATE_LIMITED',
      message: 'Too many booking attempts. Please wait a few minutes and try again.',
    });
    await enforceWindowLimit(this.redis, this.logger, {
      keyPrefix: 'ratelimit:hold:email:',
      callerId: fingerprint(email),
      ...this.perEmail,
      code: 'HOLD_RATE_LIMITED',
      message: 'Too many booking attempts for this email. Please wait a few minutes and try again.',
    });
  }

  /**
   * How many unpaid holds one email and one IP may keep open (MAX_ACTIVE_HOLDS_PER_EMAIL / _PER_IP).
   */
  public holdCaps(): { perEmail: number; perIp: number } {
    return { perEmail: this.capPerEmail, perIp: this.capPerIp };
  }

  /**
   * One-way hash of the caller's IP to store on a hold (never the IP). Null when the IP is unknown.
   * IP_HASH_SALT makes the hash hard to reverse.
   */
  public hashIp(callerId: string | undefined): string | null {
    return callerId === undefined ? null : fingerprint(callerId, this.ipSalt);
  }

  /**
   * Counts a search, quote or availability request for this IP; 429 `BROWSE_RATE_LIMITED` once over.
   */
  public checkBrowse(callerId: string | undefined): Promise<void> {
    return enforceWindowLimit(this.redis, this.logger, {
      keyPrefix: 'ratelimit:browse:',
      callerId,
      ...this.browse,
      code: 'BROWSE_RATE_LIMITED',
      message: 'Too many requests. Please slow down and try again in a moment.',
    });
  }
}
