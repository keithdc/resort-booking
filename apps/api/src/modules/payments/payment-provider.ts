/**
 * @file apps/api/src/modules/payments/payment-provider.ts
 * @feature payments
 * @dependencies none
 */

/** Everything a provider needs to start a payment for one hold. */
export interface PaymentIntentRequest {
  holdId: string;
  amountCents: number;
  currencyCode: string;
  description: string;
}

/** What the provider hands back when a payment is started. */
export interface PaymentIntent {
  /** The provider's own id for this payment (Stripe's payment_intent id later). */
  providerRef: string;
  /** What the browser needs to finish paying (Stripe's client secret later). Null for the mock. */
  clientSecret: string | null;
}

/** Money to give back on a payment that already succeeded. */
export interface RefundRequest {
  /** The provider's id for the ORIGINAL payment (what createIntent returned as `providerRef`). */
  providerRef: string;
  /** Whole minor units. Always above zero: a zero refund is recorded without calling the provider. */
  amountCents: number;
  currencyCode: string;
  reason: string;
}

/** What the provider hands back when a refund goes through. A refund that fails throws instead. */
export interface RefundResult {
  /** The provider's own id for this refund (Stripe's refund id later). */
  providerRef: string;
  status: 'succeeded';
}

/**
 * The seam between booking and money. The booking logic only ever talks to this interface, so
 * replacing the mock with Stripe changes one class, not the reservation flow.
 */
export interface PaymentProvider {
  /** Stored on every payment row: "mock", later "stripe". */
  readonly name: string;
  /** True when no real money moves. The guest UI says so plainly. */
  readonly simulated: boolean;
  createIntent(request: PaymentIntentRequest): Promise<PaymentIntent>;
  /** Refunds part or all of a succeeded payment. Throws when the provider refuses or cannot be reached. */
  refund(request: RefundRequest): Promise<RefundResult>;
}

/** Nest injection token for the active provider. */
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
