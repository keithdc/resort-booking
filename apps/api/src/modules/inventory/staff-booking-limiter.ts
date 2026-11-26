/**
 * @file apps/api/src/modules/inventory/staff-booking-limiter.ts
 * @feature inventory
 * @dependencies RedisService
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { enforceWindowLimit, limitSettingFromConfig, type LimitSetting } from '../../shared/redis/rate-limit';
import { RedisService } from '../../shared/redis/redis.service';

/** One staff member making bookings: generous for a person at a desk, tiny for a script in a loop. */
export const STAFF_BOOKING_CREATE_DEFAULT: LimitSetting = { limit: 20, windowSeconds: 60 };
/** Price checks while the dialog is open (dates, guests and extras each ask again). */
export const STAFF_BOOKING_QUOTE_DEFAULT: LimitSetting = { limit: 120, windowSeconds: 60 };

/**
 * Per signed-in staff member limits for the staff New booking routes (docs/13 R5-04): STAFF_BOOKING_CREATE_LIMIT and
 * STAFF_BOOKING_QUOTE_LIMIT, each with *_WINDOW_SECONDS. Counted in Redis; if Redis is down the check is skipped
 * (a staff member is signed in, audited and cannot overlap dates, so the booking desk must not depend on Redis).
 */
@Injectable()
export class StaffBookingLimiter {
  private readonly logger = new Logger(StaffBookingLimiter.name);
  private readonly create: LimitSetting;
  private readonly quote: LimitSetting;

  public constructor(
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    this.create = limitSettingFromConfig(config, 'STAFF_BOOKING_CREATE', STAFF_BOOKING_CREATE_DEFAULT);
    this.quote = limitSettingFromConfig(config, 'STAFF_BOOKING_QUOTE', STAFF_BOOKING_QUOTE_DEFAULT);
  }

  /** Counts one booking being made; 429 STAFF_BOOKING_RATE_LIMITED with Retry-After when over the limit. */
  public async checkCreate(staffUserId: string): Promise<void> {
    await enforceWindowLimit(this.redis, this.logger, {
      keyPrefix: 'ratelimit:staffbooking:create:',
      callerId: staffUserId,
      ...this.create,
      code: 'STAFF_BOOKING_RATE_LIMITED',
      message: 'Too many bookings in a short time. Wait a moment and try again.',
    });
  }

  /** Counts one price check. */
  public async checkQuote(staffUserId: string): Promise<void> {
    await enforceWindowLimit(this.redis, this.logger, {
      keyPrefix: 'ratelimit:staffbooking:quote:',
      callerId: staffUserId,
      ...this.quote,
      code: 'STAFF_BOOKING_RATE_LIMITED',
      message: 'Too many price checks in a short time. Wait a moment and try again.',
    });
  }
}
