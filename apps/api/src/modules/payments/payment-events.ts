/**
 * @file apps/api/src/modules/payments/payment-events.ts
 * @feature payments
 * @dependencies pg
 */

import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';

/** A payment that succeeded at the provider when the stay it paid for could no longer be given to the guest. */
export interface LatePayment {
  id: string;
  organizationId: string;
  propertyId: string;
  /** The booking (or hold) the payment was opened for. */
  bookingId: string;
  provider: string;
  providerRef: string;
  amountCents: number;
  currencyCode: string;
}

/** The provider's report that a refund changed. */
export interface RefundUpdate {
  providerRefundId: string;
  /** Our refund id when the provider echoes it. */
  refundId: string | null;
  status: 'succeeded' | 'failed' | 'pending';
  failureReason: string | null;
}

/** What applying a refund update did. */
export type RefundUpdateResult = 'settled' | 'unchanged' | 'unknown_refund' | 'conflict';

/**
 * What the webhook handler needs from the booking side. Payments cannot import bookings (a cycle), so bookings register
 * an implementation at start-up, like they do for date-change payments (PaymentSettlementRegistry).
 */
export interface PaymentEventsPort {
  /**
   * Inside the webhook transaction: records the automatic full refund of a late payment through the normal refund path
   * (a `refunds` row of kind `late_payment`, pending, holding the processing lease). Returns its id, or null when a
   * late-payment refund already exists for that booking (staff must handle it by hand).
   */
  recordLateRefund(client: PoolClient, payment: LatePayment): Promise<string | null>;
  /**
   * After the transaction committed: asks the provider to send the money back (idempotent key from the refund id). Never
   * throws: a refusal leaves the refund failed in the staff queue, no answer leaves it pending for the reconciler.
   */
  settleLateRefund(refundId: string, payment: LatePayment): Promise<'succeeded' | 'failed' | 'pending'>;
  /** Inside the webhook transaction: applies the provider's refund status to our refund, never moving a paid one back. */
  applyRefundUpdate(client: PoolClient, update: RefundUpdate): Promise<RefundUpdateResult>;
}

/**
 * Holds the booking side's implementation. Empty until bookings register theirs; the webhook handler refuses to act on
 * events that need it (it answers 500 so the provider retries) rather than dropping money events.
 */
@Injectable()
export class PaymentEventsRegistry {
  private port: PaymentEventsPort | null = null;

  public register(port: PaymentEventsPort): void {
    if (this.port !== null) {
      throw new Error('A payment events handler is already registered');
    }
    this.port = port;
  }

  public get(): PaymentEventsPort {
    if (this.port === null) {
      throw new Error('No payment events handler is registered');
    }
    return this.port;
  }
}
