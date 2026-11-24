/**
 * @file apps/api/src/modules/payments/payment-settlement.ts
 * @feature payments
 * @dependencies shared-types, pg
 */

import { Injectable } from '@nestjs/common';
import type { GuestBooking } from '@resort-booking/shared-types';
import type { PoolClient } from 'pg';

/** Why a payment exists: a booking itself, or the balance of a date change. */
export type PaymentPurpose = 'booking' | 'rebook';

/** The payment being settled, as a handler needs to see it. */
export interface SettlingPayment {
  id: string;
  /** The booking the payment was opened for. */
  bookingId: string;
  amountCents: number;
  currencyCode: string;
  /** What the guest agreed to pay for (kept with the payment until it settles). */
  payload: unknown;
}

/**
 * What happens when a payment of a given purpose succeeds. Payments cannot import the feature that
 * owns the purpose (that would be a cycle), so the feature registers a handler here when the app starts.
 */
export interface PaymentSettlementHandler {
  readonly purpose: PaymentPurpose;
  /**
   * Applies the outcome inside the settling transaction, AFTER the payment is marked succeeded. Throw an
   * HTTP exception (for example 409) to refuse: everything rolls back and the payment is cancelled, not charged.
   */
  settle(client: PoolClient, payment: SettlingPayment): Promise<void>;
  /**
   * The guest-visible result of a settled payment, read after the transaction committed. Also used when
   * the same success is reported twice.
   */
  presentSettled(paymentId: string): Promise<GuestBooking | null>;
}

/**
 * The handlers by purpose. Features register themselves on start-up; the payment service looks them up.
 */
@Injectable()
export class PaymentSettlementRegistry {
  private readonly handlers = new Map<PaymentPurpose, PaymentSettlementHandler>();

  /**
   * Adds the handler for a purpose. Registering a purpose twice is a programming mistake.
   */
  public register(handler: PaymentSettlementHandler): void {
    if (this.handlers.has(handler.purpose)) {
      throw new Error(`A settlement handler for "${handler.purpose}" payments is already registered`);
    }
    this.handlers.set(handler.purpose, handler);
  }

  /**
   * The handler for a purpose, or null when none is registered.
   */
  public find(purpose: PaymentPurpose): PaymentSettlementHandler | null {
    return this.handlers.get(purpose) ?? null;
  }
}
