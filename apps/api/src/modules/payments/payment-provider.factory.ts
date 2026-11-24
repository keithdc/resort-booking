/**
 * @file apps/api/src/modules/payments/payment-provider.factory.ts
 * @feature payments
 * @dependencies mock-payment.provider
 */

import { MockPaymentProvider } from './mock-payment.provider';
import type { PaymentProvider } from './payment-provider';

export interface PaymentEnvironment {
  PAYMENT_PROVIDER?: string | undefined;
  NODE_ENV?: string | undefined;
}

/**
 * Picks the provider from configuration. Defaults to the mock outside production.
 * Production refuses to start on the mock, so a deploy can never "accept" payments that move no
 * money. An unknown name is an error, never a silent fallback.
 */
export function createPaymentProvider(env: PaymentEnvironment): PaymentProvider {
  // A blank value (an empty line in an env file) counts as not set.
  const configured = env.PAYMENT_PROVIDER?.trim();
  const name = configured === undefined || configured === '' ? 'mock' : configured.toLowerCase();
  if (name === 'mock') {
    if (env.NODE_ENV === 'production') {
      throw new Error(
        'PAYMENT_PROVIDER=mock is not allowed in production. Configure a real payment provider before going live.',
      );
    }
    return new MockPaymentProvider();
  }
  throw new Error(`Unknown PAYMENT_PROVIDER "${name}". Supported today: mock.`);
}
