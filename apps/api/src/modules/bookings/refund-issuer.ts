/**
 * @file apps/api/src/modules/bookings/refund-issuer.ts
 * @feature bookings
 * @dependencies BookingsRepository, PaymentsService
 */

import { Injectable, Logger } from '@nestjs/common';
import type { RefundStatus } from '@resort-booking/shared-types';
import { ProviderOutcomeUnknownError, refundIdempotencyKey } from '../payments/payment-provider';
import { PaymentsService } from '../payments/payments.service';
import { BookingsRepository, type BookingRow } from './bookings.repository';
import { allocateRefund, type RefundChunk } from './bookings.rules';
import { RefundTimings } from './refund-timings';

/** How a refund will be paid out, decided before anything is written. */
export interface RefundPlan {
  amountCents: number;
  percent: number;
  currencyCode: string;
  /** The payment (the first one used) the refund is recorded against, or null when none applies. */
  paymentId: string | null;
  /** 'mock' / 'stripe', or 'manual' when the operator has to refund outside the app. */
  provider: string;
  status: RefundStatus;
  /** True when the active provider must be asked to move the money after the change is committed. */
  viaProvider: boolean;
  reason: string;
  /** The provider calls to make, one per payment the money comes back from. */
  chunks: RefundChunk[];
  /** Part of the provider idempotency key; 1 for a new refund, higher after a definitive refusal. */
  keyGeneration?: number;
}

export const MANUAL_PROVIDER = 'manual';

/**
 * Plans and carries out refunds. A refund is recorded as pending inside the guest's transaction (holding a lease
 * that stops anybody else from taking it), and only after that commits is the provider asked to move the money. If
 * the provider refuses, the booking change stays and the refund is marked failed for staff to retry; if it does not
 * answer, the refund stays pending for the reconciler.
 */
@Injectable()
export class RefundIssuer {
  private readonly logger = new Logger(RefundIssuer.name);

  public constructor(
    private readonly bookings: BookingsRepository,
    private readonly payments: PaymentsService,
    private readonly timings: RefundTimings,
  ) {}

  /**
   * Decides how to pay `amountCents` back. `label` says why ("Guest cancelled online"). Money goes
   * back through the provider only when the booking's online payments, all taken with the active
   * provider, can cover all of it; otherwise the operator refunds by hand and the plan says so.
   */
  public plan(row: BookingRow, amountCents: number, percent: number, label: string): RefundPlan {
    const provider = this.payments.describeProvider();
    const base = { amountCents, percent, currencyCode: row.currency_code ?? 'EUR' };
    const firstPaymentId = row.payments[0]?.id ?? null;
    if (amountCents === 0) {
      // Nothing to give back: recorded as done, and the provider is never called for zero.
      return {
        ...base,
        paymentId: firstPaymentId,
        provider: row.payments[0]?.provider ?? MANUAL_PROVIDER,
        status: 'succeeded',
        viaProvider: false,
        reason: `${label}; no refund under the policy`,
        chunks: [],
      };
    }
    const allocation = allocateRefund(row.payments, amountCents);
    const onActiveProvider = allocation.chunks.every((chunk): boolean => chunk.provider === provider.name);
    if (allocation.chunks.length > 0 && allocation.uncoveredCents === 0 && onActiveProvider) {
      return {
        ...base,
        paymentId: allocation.chunks[0]?.paymentId ?? null,
        provider: provider.name,
        status: 'pending',
        viaProvider: true,
        reason: label,
        chunks: allocation.chunks,
      };
    }
    // No online payment on record, or not enough of it, or taken with another provider: by hand.
    let why = `${label}; no online payment is on record, so the operator must refund it`;
    if (row.payments.length > 0) {
      why = onActiveProvider
        ? `${label}; the online payments cannot cover it, so the operator must refund it`
        : `${label}; the payment was taken with a different provider, so the operator must refund it`;
    }
    return {
      ...base,
      paymentId: firstPaymentId,
      provider: MANUAL_PROVIDER,
      status: 'pending',
      viaProvider: false,
      reason: why,
      chunks: [],
    };
  }

  /**
   * Asks the provider to move the money (after the change committed, while the caller holds the refund's lease) and
   * records its answer. Never throws. Every provider call carries a deterministic idempotency key (refund id, key
   * generation, chunk), so asking again after a lost answer cannot pay twice, and is cut off after the provider timeout.
   *
   * - answer: succeeded, saved at once (a failed save is retried and, if it still fails, left for the reconciler).
   * - the provider refused: failed, and the key generation goes up when nothing was paid yet, so a staff retry sends a
   *   fresh key.
   * - no answer (timeout, dropped connection): the refund stays `pending`; the reconciler asks again with the SAME key.
   */
  public async settle(refundId: string, bookingId: string, plan: RefundPlan): Promise<RefundStatus> {
    const refs: string[] = [];
    const generation = plan.keyGeneration ?? 1;
    const { providerTimeoutMs, leaseSeconds } = this.timings.values;
    // Stop starting new calls well before the lease runs out: the next owner must never overlap one in flight.
    const deadline = Date.now() + leaseSeconds * 1000 - providerTimeoutMs;
    try {
      for (const [index, chunk] of plan.chunks.entries()) {
        if (index > 0 && Date.now() > deadline) {
          throw new ProviderOutcomeUnknownError('The refund lease was running out before every payment was refunded');
        }
        const result = await withTimeout(
          this.payments.issueRefund({
            providerRef: chunk.providerRef,
            amountCents: chunk.amountCents,
            currencyCode: plan.currencyCode,
            reason: plan.reason,
            idempotencyKey: refundIdempotencyKey(refundId, generation, index),
          }),
          providerTimeoutMs,
        );
        refs.push(result.providerRef);
      }
      await this.finish(refundId, 'succeeded', refs.join(','), null);
      return 'succeeded';
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'The payment provider refused the refund';
      if (error instanceof ProviderOutcomeUnknownError) {
        this.logger.error(
          `Refund ${refundId} for booking ${bookingId}: the provider did not answer (${message}). It stays pending and is asked again with the same idempotency key.`,
        );
        await this.rememberUnknown(refundId, refs, message);
        return 'pending';
      }
      this.logger.error(`Refund ${refundId} for booking ${bookingId} failed: ${message}. The change stays; staff must retry.`);
      await this.finish(refundId, 'failed', refs.join(','), message, { bumpKeyGeneration: refs.length === 0 });
      return 'failed';
    }
  }

  private async rememberUnknown(refundId: string, refs: readonly string[], message: string): Promise<void> {
    try {
      await this.bookings.noteRefundOutcomeUnknown(
        refundId,
        `The provider did not answer (${message}). It will be checked again automatically.${refs.length > 0 ? ` Already refunded: ${refs.join(',')}.` : ''}`,
      );
    } catch (error: unknown) {
      this.logger.error(`Refund ${refundId}: could not note the unknown outcome: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Saves the provider's answer. The provider has already answered, so a failed save is retried a few times; if it
   * still fails the row stays `pending` and the reconciler settles it by asking the provider with the same key.
   */
  private async finish(
    refundId: string,
    status: 'succeeded' | 'failed',
    providerRef: string,
    failureReason: string | null,
    options: { bumpKeyGeneration?: boolean } = {},
  ): Promise<void> {
    let lastError = '';
    for (let attempt = 1; attempt <= SAVE_ATTEMPTS; attempt += 1) {
      try {
        await this.bookings.completeRefund(refundId, status, providerRef, failureReason, options);
        return;
      } catch (error: unknown) {
        lastError = error instanceof Error ? error.message : String(error);
        if (attempt < SAVE_ATTEMPTS) {
          await delay(SAVE_RETRY_DELAY_MS * attempt);
        }
      }
    }
    this.logger.error(
      `Refund ${refundId} was ${status} at the provider (${providerRef}) but could not be saved: ${lastError}. It reads "pending" until the reconciler settles it with the same idempotency key.`,
    );
  }
}

/** How often a finished provider answer is saved before giving up to the reconciler. */
const SAVE_ATTEMPTS = 3;
const SAVE_RETRY_DELAY_MS = 250;

function delay(ms: number): Promise<void> {
  return new Promise((resolve: () => void): void => {
    setTimeout(resolve, ms);
  });
}

/**
 * Rejects with ProviderOutcomeUnknownError when the call takes longer than `ms`. The call itself cannot be cancelled, so
 * it may still finish later: that is exactly why the idempotency key exists.
 */
function withTimeout<T>(call: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject): void => {
    const timer = setTimeout((): void => {
      reject(new ProviderOutcomeUnknownError(`no answer from the provider within ${String(Math.round(ms / 1000))} seconds`));
    }, ms);
    call.then(
      (value: T): void => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown): void => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}
