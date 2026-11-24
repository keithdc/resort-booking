/**
 * @file apps/api/src/modules/bookings/booking-rate-limiter.ts
 * @feature bookings
 * @dependencies RedisService
 */

import { Injectable, Logger } from '@nestjs/common';
import { enforceWindowLimit } from '../../shared/redis/rate-limit';
import { RedisService } from '../../shared/redis/redis.service';

export const BOOKING_ATTEMPTS_PER_WINDOW = 10;
export const BOOKING_WINDOW_SECONDS = 60;
const KEY_PREFIX = 'ratelimit:booking:';

/**
 * Stops anyone guessing booking references and emails: a caller (by IP) may look up or cancel only
 * so often. Lookup and cancel share one budget.
 */
@Injectable()
export class BookingRateLimiter {
  private readonly logger = new Logger(BookingRateLimiter.name);

  public constructor(private readonly redis: RedisService) {}

  /**
   * Counts an attempt and throws 429 `LOOKUP_RATE_LIMITED` once the caller is over the limit. If Redis
   * is unreachable the check is skipped; the reference and email are still checked either way.
   */
  public check(callerId: string | undefined): Promise<void> {
    return enforceWindowLimit(this.redis, this.logger, {
      keyPrefix: KEY_PREFIX,
      callerId,
      limit: BOOKING_ATTEMPTS_PER_WINDOW,
      windowSeconds: BOOKING_WINDOW_SECONDS,
      code: 'LOOKUP_RATE_LIMITED',
      message: 'Too many attempts. Please wait a minute and try again.',
    });
  }
}
