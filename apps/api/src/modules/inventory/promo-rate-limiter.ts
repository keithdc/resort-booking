/**
 * @file apps/api/src/modules/inventory/promo-rate-limiter.ts
 * @feature inventory
 * @dependencies RedisService
 */

import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../shared/redis/redis.service';

export const PROMO_ATTEMPTS_PER_WINDOW = 20;
export const PROMO_WINDOW_SECONDS = 60;
const KEY_PREFIX = 'ratelimit:promo:';

/**
 * Stops anyone guessing promo codes by brute force: a caller (by IP) may try codes only so often.
 * Requests without a code are never counted, so normal booking is never slowed.
 */
@Injectable()
export class PromoRateLimiter {
  private readonly logger = new Logger(PromoRateLimiter.name);

  public constructor(private readonly redis: RedisService) {}

  /**
   * Counts an attempt when a code was sent and throws 429 once the caller is over the limit.
   * If Redis is unreachable the check is skipped (booking must not depend on it); the code is
   * still validated by the API either way.
   */
  public async check(callerId: string | undefined, promoCode: string | undefined): Promise<void> {
    if (promoCode === undefined || promoCode.trim() === '') {
      return;
    }
    try {
      const attempts = await this.redis.hitWindow(`${KEY_PREFIX}${callerId ?? 'unknown'}`, PROMO_WINDOW_SECONDS);
      if (attempts > PROMO_ATTEMPTS_PER_WINDOW) {
        throw new HttpException(
          { message: 'Too many promo code attempts. Please wait a minute and try again.', code: 'PROMO_RATE_LIMITED' },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.warn('Promo rate limit skipped: Redis unavailable');
    }
  }
}
