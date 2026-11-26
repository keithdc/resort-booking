/**
 * @file apps/api/src/modules/bookings/staff-note-limiter.ts
 * @feature bookings
 * @dependencies RedisService
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { enforceWindowLimit, limitSettingFromConfig, type LimitSetting } from '../../shared/redis/rate-limit';
import { RedisService } from '../../shared/redis/redis.service';

/** One person typing notes: far above real use, far below a script. */
export const STAFF_NOTE_DEFAULT: LimitSetting = { limit: 30, windowSeconds: 60 };

/**
 * Per signed-in staff member limit on adding or hiding booking notes (STAFF_NOTE_LIMIT, STAFF_NOTE_WINDOW_SECONDS).
 * Counted in Redis; skipped when Redis is down, like the other staff limiters.
 */
@Injectable()
export class StaffNoteLimiter {
  private readonly logger = new Logger(StaffNoteLimiter.name);
  private readonly setting: LimitSetting;

  public constructor(
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    this.setting = limitSettingFromConfig(config, 'STAFF_NOTE', STAFF_NOTE_DEFAULT);
  }

  /** Counts one change; 429 STAFF_NOTE_RATE_LIMITED with Retry-After when over the limit. */
  public async check(staffUserId: string): Promise<void> {
    await enforceWindowLimit(this.redis, this.logger, {
      keyPrefix: 'ratelimit:staffnote:',
      callerId: staffUserId,
      ...this.setting,
      code: 'STAFF_NOTE_RATE_LIMITED',
      message: 'Too many notes in a short time. Wait a moment and try again.',
    });
  }
}
