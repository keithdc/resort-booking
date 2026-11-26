/**
 * @file apps/api/src/modules/identity/session-sweeper.service.ts
 * @feature identity
 * @dependencies IdentityService, @nestjs/schedule
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { IdentityService } from './identity.service';

/**
 * Housekeeping: deletes ended staff sessions (past their absolute end, or idle longer than the idle limit) every hour so
 * the table does not grow forever. Such sessions are already refused when read; this only keeps the stored data tidy. Never throws.
 */
@Injectable()
export class SessionSweeperService {
  private readonly logger = new Logger(SessionSweeperService.name);

  public constructor(private readonly identity: IdentityService) {}

  @Cron(CronExpression.EVERY_HOUR)
  public async sweep(): Promise<number> {
    try {
      const removed = await this.identity.purgeExpiredSessions();
      if (removed > 0) {
        this.logger.log(`Removed ${String(removed)} ended staff session(s) (expired or idle)`);
      }
      return removed;
    } catch (error: unknown) {
      this.logger.error('Session sweep failed; it will retry next hour', error instanceof Error ? error.stack : String(error));
      return 0;
    }
  }
}
