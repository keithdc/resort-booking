/**
 * @file apps/api/src/modules/bookings/refund-issuer.ts
 * @feature bookings
 * @dependencies BookingsRepository, PaymentsService
 */

import { Injectable, Logger } from '@nestjs/common';
import type { RefundStatus } from '@resort-booking/shared-types';
import { PaymentsService } from '../payments/payments.service';
import { BookingsRepository, type BookingRow } from './bookings.repository';
import { allocateRefund, type RefundChunk } from './bookings.rules';

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
}

export const MANUAL_PROVIDER = 'manual';

/**
 * Plans and carries out refunds. A refund is recorded as pending inside the guest's transaction, and
 * only after that commits is the provider asked to move the money. If the provider fails the booking
 * change stays and the refund is marked failed for staff to retry.
 */
@Injectable()
export class RefundIssuer {
  private readonly logger = new Logger(RefundIssuer.name);

  public constructor(
    private readonly bookings: BookingsRepository,
    private readonly payments: PaymentsService,
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
   * Asks the provider to move the money (after the change committed) and records its answer. Never
   * throws: a provider failure is recorded as a failed refund and logged for staff. Returns the outcome.
   */
  public async settle(refundId: string, bookingId: string, plan: RefundPlan): Promise<'succeeded' | 'failed'> {
    const refs: string[] = [];
    try {
      for (const chunk of plan.chunks) {
        const result = await this.payments.issueRefund({
          providerRef: chunk.providerRef,
          amountCents: chunk.amountCents,
          currencyCode: plan.currencyCode,
          reason: plan.reason,
        });
        refs.push(result.providerRef);
      }
      await this.finish(refundId, 'succeeded', refs.join(','), null);
      return 'succeeded';
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'The payment provider refused the refund';
      this.logger.error(`Refund ${refundId} for booking ${bookingId} failed: ${message}. The change stays; staff must retry.`);
      await this.finish(refundId, 'failed', refs.join(','), message);
      return 'failed';
    }
  }

  private async finish(refundId: string, status: 'succeeded' | 'failed', providerRef: string, failureReason: string | null): Promise<void> {
    try {
      await this.bookings.completeRefund(refundId, status, providerRef, failureReason);
    } catch (error: unknown) {
      // The provider already answered. Say so loudly: the refund row still reads "pending".
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Refund ${refundId} was ${status} at the provider (${providerRef}) but could not be saved: ${message}`);
    }
  }
}
