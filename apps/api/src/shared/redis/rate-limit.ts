/**
 * @file apps/api/src/shared/redis/rate-limit.ts
 * @shared Fixed-window rate limit shared by the guest-facing limiters
 * @dependencies RedisService
 */

import { HttpException, Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { readIntEnv } from '../config/environment';
import { RateLimitedException } from '../http/rate-limited.exception';
import type { RedisService } from './redis.service';

export interface RateLimitOptions {
  /** Redis key prefix, e.g. "ratelimit:promo:". */
  keyPrefix: string;
  /** Who is being limited (an IP, or a hash of an email). Callers with no address share one bucket. */
  callerId: string | undefined;
  limit: number;
  windowSeconds: number;
  /** Error `code` returned with the 429. */
  code: string;
  /** Error `message` returned with the 429. */
  message: string;
}

/** A limit and the window it counts in. */
export interface LimitSetting {
  limit: number;
  windowSeconds: number;
}

/**
 * Limit and window for one named bucket. Operators tune them with `<PREFIX>_LIMIT` and
 * `<PREFIX>_WINDOW_SECONDS`; a missing or invalid value keeps the default (a bad value never turns a limit off).
 */
export function limitSetting(
  env: Readonly<Record<string, string | undefined>>,
  prefix: string,
  defaults: LimitSetting,
): LimitSetting {
  return {
    limit: readIntEnv(env, `${prefix}_LIMIT`, defaults.limit, 1, 100_000),
    windowSeconds: readIntEnv(env, `${prefix}_WINDOW_SECONDS`, defaults.windowSeconds, 1, 86_400),
  };
}

/**
 * Same as limitSetting, reading the two values from Nest's ConfigService.
 */
export function limitSettingFromConfig(config: ConfigService, prefix: string, defaults: LimitSetting): LimitSetting {
  return limitSetting(
    {
      [`${prefix}_LIMIT`]: config.get<string>(`${prefix}_LIMIT`),
      [`${prefix}_WINDOW_SECONDS`]: config.get<string>(`${prefix}_WINDOW_SECONDS`),
    },
    prefix,
    defaults,
  );
}

/**
 * Counts one attempt (atomically) and throws 429 with Retry-After once the caller is over the limit. If
 * Redis is unreachable the check is skipped (guest booking must not depend on it) and a warning is logged;
 * login uses its own limiter that fails closed instead.
 */
export async function enforceWindowLimit(redis: RedisService, logger: Logger, options: RateLimitOptions): Promise<void> {
  try {
    const { count, ttlSeconds } = await redis.hitWindowWithTtl(
      `${options.keyPrefix}${options.callerId ?? 'unknown'}`,
      options.windowSeconds,
    );
    if (count > options.limit) {
      throw new RateLimitedException(options.code, options.message, ttlSeconds > 0 ? ttlSeconds : options.windowSeconds);
    }
  } catch (error: unknown) {
    if (error instanceof HttpException) {
      throw error;
    }
    logger.warn(`${options.code} check skipped: Redis unavailable`);
  }
}
