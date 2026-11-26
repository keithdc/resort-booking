/**
 * @file apps/api/src/modules/payments/mock-payment.provider.ts
 * @feature payments
 * @dependencies payment-provider
 */

import { createHash, randomBytes } from 'node:crypto';
import type { PaymentIntent, PaymentProvider, RefundRequest, RefundResult } from './payment-provider';

/** The mock remembers this many refund keys (a real provider keeps them for 24 hours). */
const REMEMBERED_KEYS = 2000;

interface RememberedRefund {
  fingerprint: string;
  result: RefundResult;
}

/**
 * Stand-in provider until the client chooses a real one. It never moves money: it only hands out
 * an id so the rest of the flow (hold, pay, confirm) can be built and tested for real.
 *
 * Refunds honour the idempotency key like Stripe does: the same key with the same request returns the first result
 * and does not count as a second refund; the same key with a different request is refused.
 */
export class MockPaymentProvider implements PaymentProvider {
  public readonly name = 'mock';
  public readonly simulated = true;
  private readonly refunds = new Map<string, RememberedRefund>();

  /** How many refunds were really issued (a replay of a known key is not counted). For tests and logs. */
  public get issuedRefunds(): number {
    return this.refunds.size;
  }

  // Takes no arguments on purpose: the mock needs nothing from the request to hand out an id.
  public createIntent(): Promise<PaymentIntent> {
    return Promise.resolve({ providerRef: `mock_pi_${randomBytes(9).toString('hex')}`, clientSecret: null });
  }

  /**
   * Always succeeds, like a provider would for a valid request, so the cancel-and-refund flow can be
   * built and tested for real. It still rejects a nonsense amount, as a real provider would.
   */
  public refund(request: RefundRequest): Promise<RefundResult> {
    if (!Number.isInteger(request.amountCents) || request.amountCents <= 0) {
      return Promise.reject(new Error('A refund must be a whole amount above zero'));
    }
    if (request.idempotencyKey.trim() === '') {
      return Promise.reject(new Error('A refund needs an idempotency key'));
    }
    const fingerprint = `${request.providerRef}|${String(request.amountCents)}|${request.currencyCode}`;
    const known = this.refunds.get(request.idempotencyKey);
    if (known !== undefined) {
      if (known.fingerprint !== fingerprint) {
        return Promise.reject(new Error('This idempotency key was already used with different parameters'));
      }
      return Promise.resolve(known.result);
    }
    const digest = createHash('sha256').update(request.idempotencyKey).digest('hex').slice(0, 18);
    const result: RefundResult = { providerRef: `mock_re_${digest}`, status: 'succeeded' };
    this.refunds.set(request.idempotencyKey, { fingerprint, result });
    if (this.refunds.size > REMEMBERED_KEYS) {
      const oldest = this.refunds.keys().next();
      if (oldest.done !== true) {
        this.refunds.delete(oldest.value);
      }
    }
    return Promise.resolve(result);
  }
}
