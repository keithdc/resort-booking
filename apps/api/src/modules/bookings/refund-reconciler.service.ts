/**
 * @file apps/api/src/modules/bookings/refund-reconciler.service.ts
 * @feature bookings
 * @dependencies StaffRefundsRepository, RefundIssuer, BookingsRepository, PaymentsService, AuditService, DatabaseService
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AuditService } from '../../shared/audit/audit.service';
import { DatabaseService } from '../../shared/database/database.service';
import { PaymentsService } from '../payments/payments.service';
import { allocateRefund } from './bookings.rules';
import { BookingsRepository } from './bookings.repository';
import { RefundIssuer, type RefundPlan } from './refund-issuer';
import { RefundTimings } from './refund-timings';
import { StaffRefundsRepository, type StuckRefund } from './staff-refunds.repository';

/** One advisory-lock key for the whole sweep, so only one API instance reconciles at a time. */
export const REFUND_RECONCILER_LOCK_KEY = 7_420_001;

export type ReconcileOutcome = 'succeeded' | 'failed' | 'still_pending' | 'gave_up' | 'skipped';

export interface ReconcileSummary {
  /** The sweep did not run: switched off, or another instance holds the lock. */
  skipped: boolean;
  items: Array<{ refundId: string; outcome: ReconcileOutcome }>;
}

/**
 * Settles online refunds that never got an answer. A refund is committed as `pending` BEFORE the provider is asked, so a
 * crash, a deploy, a lost answer or a failed save leaves it pending. Every few minutes this sweep takes each such refund
 * (older than REFUND_RECONCILE_AFTER_MINUTES, lease stale) and asks the provider AGAIN with the SAME idempotency key: the
 * provider answers with the first result, so a refund that did go out is recorded as succeeded and one that did not is
 * issued exactly once. A refund that still gets no clear answer after REFUND_RECONCILE_MAX_ATTEMPTS passes is marked
 * `failed` for staff attention with a clear reason (the key generation is NOT raised, so a later retry stays safe).
 *
 * Every reconciled refund writes an ERROR log line (wire an alert to it) and an audit entry `refund.reconciled`.
 * Safe with several instances: a Postgres advisory lock lets one sweep run, and each refund is also taken with an atomic
 * lease. Switch it off with REFUND_RECONCILER_ENABLED=false. Never throws.
 */
@Injectable()
export class RefundReconcilerService {
  private readonly logger = new Logger(RefundReconcilerService.name);

  public constructor(
    private readonly refunds: StaffRefundsRepository,
    private readonly issuer: RefundIssuer,
    private readonly bookings: BookingsRepository,
    private readonly payments: PaymentsService,
    private readonly audit: AuditService,
    private readonly database: DatabaseService,
    private readonly timings: RefundTimings,
  ) {}

  @Cron('0 */2 * * * *')
  public async sweep(): Promise<ReconcileSummary> {
    const config = this.timings.values;
    if (!config.reconcilerEnabled) {
      return { skipped: true, items: [] };
    }
    try {
      return await this.database.withClient(async (client): Promise<ReconcileSummary> => {
        const lock = await client.query<{ locked: boolean }>('SELECT pg_try_advisory_lock($1) AS locked', [REFUND_RECONCILER_LOCK_KEY]);
        if (lock.rows[0]?.locked !== true) {
          return { skipped: true, items: [] };
        }
        try {
          return await this.reconcileBatch();
        } finally {
          await client.query('SELECT pg_advisory_unlock($1)', [REFUND_RECONCILER_LOCK_KEY]);
        }
      });
    } catch (error: unknown) {
      this.logger.error('Refund reconciliation failed; it will retry on the next pass', error instanceof Error ? error.stack : String(error));
      return { skipped: true, items: [] };
    }
  }

  private async reconcileBatch(): Promise<ReconcileSummary> {
    const config = this.timings.values;
    const stuck = await this.refunds.findStuck(config.reconcileAfterMinutes, config.leaseSeconds, config.reconcileBatchSize);
    const items: ReconcileSummary['items'] = [];
    for (const item of stuck) {
      try {
        items.push({ refundId: item.id, outcome: await this.reconcileOne(item) });
      } catch (error: unknown) {
        this.logger.error(`Refund ${item.id} could not be reconciled: ${error instanceof Error ? error.message : String(error)}`);
        items.push({ refundId: item.id, outcome: 'skipped' });
      }
    }
    return { skipped: false, items };
  }

  private async reconcileOne(item: StuckRefund): Promise<ReconcileOutcome> {
    const config = this.timings.values;
    const claim = await this.refunds.claimStuck(item.id, config.leaseSeconds);
    if (claim === null) {
      return 'skipped';
    }
    const provider = this.payments.describeProvider();
    const payments = await this.refunds.refundablePayments(item.inventory_block_id, item.id);
    const allocation = allocateRefund(payments, item.amount_cents);
    const coverable =
      allocation.chunks.length > 0 &&
      allocation.uncoveredCents === 0 &&
      allocation.chunks.every((chunk): boolean => chunk.provider === provider.name);

    let outcome: ReconcileOutcome;
    if (!coverable) {
      await this.bookings.completeRefund(
        item.id,
        'failed',
        '',
        'Reconciler: the online payments can no longer cover this refund. Send the money yourself, then mark it as refunded.',
      );
      outcome = 'failed';
    } else {
      const plan: RefundPlan = {
        amountCents: item.amount_cents,
        percent: item.percent,
        currencyCode: item.currency_code,
        paymentId: allocation.chunks[0]?.paymentId ?? null,
        provider: provider.name,
        status: 'pending',
        viaProvider: true,
        reason: item.reason,
        chunks: allocation.chunks,
        keyGeneration: claim.keyGeneration,
      };
      const settled = await this.issuer.settle(item.id, item.inventory_block_id, plan);
      outcome = settled === 'succeeded' ? 'succeeded' : settled === 'failed' ? 'failed' : 'still_pending';
      if (outcome === 'still_pending' && claim.attempts >= config.maxReconcileAttempts) {
        await this.bookings.completeRefund(
          item.id,
          'failed',
          '',
          `Reconciler: the provider gave no clear answer after ${String(claim.attempts)} tries. Check the refund in the provider dashboard before sending it again.`,
        );
        outcome = 'gave_up';
      }
    }

    this.logger.error(
      `Refund ${item.id} was pending for ${String(item.age_minutes)} minutes and was reconciled: ${outcome} (attempt ${String(claim.attempts)}).${
        outcome === 'failed' || outcome === 'gave_up' ? ' Staff attention needed.' : ''
      }`,
    );
    await this.audit.record({
      organizationId: item.organization_id,
      staffUserId: null,
      action: 'refund.reconciled',
      targetType: 'refund',
      targetId: item.id,
      metadata: { outcome, attempts: claim.attempts, ageMinutes: item.age_minutes, source: 'reconciler' },
    });
    return outcome;
  }
}
