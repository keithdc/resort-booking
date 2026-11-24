/**
 * @file apps/api/src/modules/inventory/hold-sweeper.service.ts
 * @feature inventory
 * @dependencies InventoryRepository, @nestjs/schedule
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InventoryRepository } from './inventory.repository';

/**
 * Housekeeping for abandoned checkouts. Availability never depends on this running:
 * every read ignores a hold past its expiry by the clock. The sweeper only keeps the
 * stored status honest (reports, staff views) and is the home for expiry side effects.
 */
@Injectable()
export class HoldSweeperService {
  private readonly logger = new Logger(HoldSweeperService.name);
  private running = false;

  public constructor(private readonly inventory: InventoryRepository) {}

  /**
   * Runs every minute. Never throws: a failed sweep is logged and retried next minute.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  public async sweep(): Promise<number> {
    if (this.running) {
      return 0;
    }
    this.running = true;
    try {
      const expired = await this.inventory.expireAllOverdueHolds();
      if (expired > 0) {
        this.logger.log(`Expired ${String(expired)} overdue hold(s)`);
      }
      return expired;
    } catch (error: unknown) {
      this.logger.error(
        'Hold sweep failed; it will retry next minute',
        error instanceof Error ? error.stack : String(error),
      );
      return 0;
    } finally {
      this.running = false;
    }
  }
}
