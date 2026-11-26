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
  /**
   * Makes the call safe to repeat: asking again with the SAME key must return the same result and never move money a
   * second time. Deterministic (refund id, key generation, chunk index; see refundIdempotencyKey), never random. The
   * real provider takes it as its idempotency header (Stripe: `Idempotency-Key`). The same key with different
   * parameters is a programming error and is refused.
   */
  idempotencyKey: string;
}

/**
 * The provider could not say whether the refund happened: a timeout, a dropped connection, a 5xx. The money may
 * or may not have moved. Callers must NOT treat it as a refusal: the refund stays pending and is asked again
 * with the same idempotency key. Any other error means the provider definitively refused.
 */
export class ProviderOutcomeUnknownError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ProviderOutcomeUnknownError';
  }
}

/**
 * The idempotency key of one provider refund call: the refund, the key generation (it goes up only after a definitive
 * refusal, so a retry then sends a fresh key) and the chunk (a refund spread over two payments makes two calls).
 */
export function refundIdempotencyKey(refundId: string, keyGeneration: number, chunkIndex: number): string {
  return `refund-${refundId}-g${String(keyGeneration)}-c${String(chunkIndex)}`;
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
  /**
   * Refunds part or all of a succeeded payment. Throws when the provider refuses (any Error) or cannot answer
   * (ProviderOutcomeUnknownError). Repeating a call with the same `idempotencyKey` returns the first result.
   */
  refund(request: RefundRequest): Promise<RefundResult>;
}

/** Nest injection token for the active provider. */
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
