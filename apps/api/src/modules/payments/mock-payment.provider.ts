/**
 * @file apps/api/src/modules/payments/mock-payment.provider.ts
 * @feature payments
 * @dependencies payment-provider
 */

import { randomBytes } from 'node:crypto';
import type { PaymentIntent, PaymentProvider, RefundRequest, RefundResult } from './payment-provider';

/**
 * Stand-in provider until the client chooses a real one. It never moves money: it only hands out
 * an id so the rest of the flow (hold, pay, confirm) can be built and tested for real.
 */
export class MockPaymentProvider implements PaymentProvider {
  public readonly name = 'mock';
  public readonly simulated = true;

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
    return Promise.resolve({ providerRef: `mock_re_${randomBytes(9).toString('hex')}`, status: 'succeeded' });
  }
}
