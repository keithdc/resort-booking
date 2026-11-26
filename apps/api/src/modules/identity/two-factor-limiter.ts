/**
 * @file apps/api/src/modules/identity/two-factor-limiter.ts
 * @feature identity
 * @dependencies RedisService
 */

import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readIntEnv } from '../../shared/config/environment';
import { RateLimitedException } from '../../shared/http/rate-limited.exception';
import { RedisService } from '../../shared/redis/redis.service';

export const TWO_FACTOR_MAX_FAILURES_PER_USER = 5;
export const TWO_FACTOR_MAX_FAILURES_PER_IP = 20;
export const TWO_FACTOR_WINDOW_SECONDS = 900;
const USER_PREFIX = 'ratelimit:2fa:user:';
const IP_PREFIX = 'ratelimit:2fa:ip:';

/**
 * Brute-force protection for second-factor codes (login step two, enable, disable, regenerate). Same shape as
 * LoginLimiter: counts WRONG codes only, per person and per IP, in fixed windows (atomic Lua script in
 * RedisService). Over the limit answers 429 with Retry-After before any code is checked. Redis down FAILS
 * CLOSED (503): nobody gets free guesses by knocking Redis over.
 *
 * Tune with TWO_FACTOR_MAX_FAILURES_PER_USER, TWO_FACTOR_MAX_FAILURES_PER_IP, TWO_FACTOR_LOCK_WINDOW_SECONDS.
 */
@Injectable()
export class TwoFactorLimiter {
  private readonly logger = new Logger(TwoFactorLimiter.name);
  private readonly perUser: number;
  private readonly perIp: number;
  private readonly windowSeconds: number;

  public constructor(
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    const value = (name: string): { v: string | undefined } => ({ v: config.get<string>(name) });
    this.perUser = readIntEnv(value('TWO_FACTOR_MAX_FAILURES_PER_USER'), 'v', TWO_FACTOR_MAX_FAILURES_PER_USER, 1, 1000);
    this.perIp = readIntEnv(value('TWO_FACTOR_MAX_FAILURES_PER_IP'), 'v', TWO_FACTOR_MAX_FAILURES_PER_IP, 1, 10_000);
    this.windowSeconds = readIntEnv(value('TWO_FACTOR_LOCK_WINDOW_SECONDS'), 'v', TWO_FACTOR_WINDOW_SECONDS, 30, 86_400);
  }

  /** Throws 429 TWO_FACTOR_RATE_LIMITED or 503 TWO_FACTOR_UNAVAILABLE. Counts nothing. */
  public async assertAllowed(staffUserId: string, ip: string | undefined): Promise<void> {
    try {
      const [byUser, byIp] = await Promise.all([
        this.redis.peekWindow(this.userKey(staffUserId)),
        this.redis.peekWindow(this.ipKey(ip)),
      ]);
      if (byUser.count >= this.perUser) {
        throw this.limited('Too many wrong codes for this account.', byUser.ttlSeconds);
      }
      if (byIp.count >= this.perIp) {
        throw this.limited('Too many wrong codes from this network.', byIp.ttlSeconds);
      }
    } catch (error: unknown) {
      if (error instanceof RateLimitedException) {
        throw error;
      }
      this.logger.error('Two-factor limiter unavailable (Redis); refusing the attempt');
      throw new ServiceUnavailableException({
        message: 'Verification is temporarily unavailable. Please try again in a moment.',
        code: 'TWO_FACTOR_UNAVAILABLE',
      });
    }
  }

  /** Counts one wrong code against the person (when known) and the IP. Never throws. */
  public async recordFailure(staffUserId: string | null, ip: string | undefined): Promise<void> {
    try {
      const hits = [this.redis.hitWindowWithTtl(this.ipKey(ip), this.windowSeconds)];
      if (staffUserId !== null) {
        hits.push(this.redis.hitWindowWithTtl(this.userKey(staffUserId), this.windowSeconds));
      }
      await Promise.all(hits);
    } catch {
      this.logger.warn('Could not record a wrong two-factor code (Redis unavailable)');
    }
  }

  /** Forgets the person's wrong codes after a correct one. Never throws. */
  public async recordSuccess(staffUserId: string): Promise<void> {
    try {
      await this.redis.deleteKey(this.userKey(staffUserId));
    } catch {
      this.logger.warn('Could not clear wrong two-factor codes (Redis unavailable)');
    }
  }

  private limited(message: string, ttlSeconds: number): RateLimitedException {
    return new RateLimitedException(
      'TWO_FACTOR_RATE_LIMITED',
      `${message} Please wait a few minutes and try again.`,
      ttlSeconds > 0 ? ttlSeconds : this.windowSeconds,
    );
  }

  private userKey(staffUserId: string): string {
    return `${USER_PREFIX}${staffUserId}`;
  }

  private ipKey(ip: string | undefined): string {
    return `${IP_PREFIX}${ip ?? 'unknown'}`;
  }
}
