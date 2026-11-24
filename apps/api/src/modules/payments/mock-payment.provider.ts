/**
 * @file apps/api/src/modules/payments/mock-payment.provider.ts
 * @feature payments
 * @dependencies payment-provider
 */

import { randomBytes } from 'node:crypto';
import type { PaymentIntent, PaymentProvider } from './payment-provider';

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
}
