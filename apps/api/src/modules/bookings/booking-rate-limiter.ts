/**
 * @file apps/api/src/modules/bookings/booking-rate-limiter.ts
 * @feature bookings
 * @dependencies RedisService
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fingerprint } from '../../shared/http/client-ip';
import { enforceWindowLimit, limitSettingFromConfig, type LimitSetting } from '../../shared/redis/rate-limit';
import { RedisService } from '../../shared/redis/redis.service';

export const BOOKING_ATTEMPTS_PER_WINDOW = 10;
export const BOOKING_WINDOW_SECONDS = 60;
/** All callers together may try one reference this often: stops many IPs guessing the email of one booking. */
export const REFERENCE_ATTEMPTS_PER_WINDOW = 15;
export const REFERENCE_WINDOW_SECONDS = 600;
const KEY_PREFIX = 'ratelimit:booking:';
const REFERENCE_KEY_PREFIX = 'ratelimit:bookingref:';

/**
 * Stops anyone guessing booking references and emails: a caller (by IP) may look up or cancel only
 * so often, and one reference may be tried only so often by everyone together. Lookup, cancel and the
 * date-change calls share the budgets. Tune with BOOKING_LOOKUP_LIMIT / _WINDOW_SECONDS and
 * BOOKING_REFERENCE_LIMIT / _WINDOW_SECONDS.
 */
@Injectable()
export class BookingRateLimiter {
  private readonly logger = new Logger(BookingRateLimiter.name);
  private readonly perCaller: LimitSetting;
  private readonly perReference: LimitSetting;

  public constructor(
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    this.perCaller = limitSettingFromConfig(config, 'BOOKING_LOOKUP', {
      limit: BOOKING_ATTEMPTS_PER_WINDOW,
      windowSeconds: BOOKING_WINDOW_SECONDS,
    });
    this.perReference = limitSettingFromConfig(config, 'BOOKING_REFERENCE', {
      limit: REFERENCE_ATTEMPTS_PER_WINDOW,
      windowSeconds: REFERENCE_WINDOW_SECONDS,
    });
  }

  /**
   * Counts an attempt and throws 429 `LOOKUP_RATE_LIMITED` (with Retry-After) once the caller, or the
   * reference they are trying, is over its limit. If Redis is unreachable the check is skipped; the
   * reference and email are still checked either way.
   */
  public async check(callerId: string | undefined, reference?: string): Promise<void> {
    await enforceWindowLimit(this.redis, this.logger, {
      keyPrefix: KEY_PREFIX,
      callerId,
      ...this.perCaller,
      code: 'LOOKUP_RATE_LIMITED',
      message: 'Too many attempts. Please wait a minute and try again.',
    });
    if (reference !== undefined && reference.trim() !== '') {
      await enforceWindowLimit(this.redis, this.logger, {
        keyPrefix: REFERENCE_KEY_PREFIX,
        callerId: fingerprint(reference),
        ...this.perReference,
        code: 'LOOKUP_RATE_LIMITED',
        message: 'Too many attempts for this booking. Please wait a few minutes and try again.',
      });
    }
  }
}
