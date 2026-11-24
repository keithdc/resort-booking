/**
 * @file apps/api/src/shared/redis/rate-limit.ts
 * @shared Fixed-window rate limit shared by the promo-code and booking-lookup limiters
 * @dependencies RedisService
 */

import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { RedisService } from './redis.service';

export interface RateLimitOptions {
  /** Redis key prefix, e.g. "ratelimit:promo:". */
  keyPrefix: string;
  /** Who is being limited (an IP). Callers with no address share one bucket. */
  callerId: string | undefined;
  limit: number;
  windowSeconds: number;
  /** Error `code` returned with the 429. */
  code: string;
  /** Error `message` returned with the 429. */
  message: string;
}

/**
 * Counts one attempt and throws 429 once the caller is over the limit. If Redis is unreachable the
 * check is skipped (booking must not depend on it) and a warning is logged.
 */
export async function enforceWindowLimit(redis: RedisService, logger: Logger, options: RateLimitOptions): Promise<void> {
  try {
    const attempts = await redis.hitWindow(`${options.keyPrefix}${options.callerId ?? 'unknown'}`, options.windowSeconds);
    if (attempts > options.limit) {
      throw new HttpException({ message: options.message, code: options.code }, HttpStatus.TOO_MANY_REQUESTS);
    }
  } catch (error: unknown) {
    if (error instanceof HttpException) {
      throw error;
    }
    logger.warn(`${options.code} check skipped: Redis unavailable`);
  }
}
