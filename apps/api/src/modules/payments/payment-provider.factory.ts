/**
 * @file apps/api/src/modules/payments/payment-provider.factory.ts
 * @feature payments
 * @dependencies mock-payment.provider, environment
 */

import { isDevelopmentMode } from '../../shared/config/environment';
import { MockPaymentProvider } from './mock-payment.provider';
import type { PaymentProvider } from './payment-provider';

export interface PaymentEnvironment {
  PAYMENT_PROVIDER?: string | undefined;
  NODE_ENV?: string | undefined;
  /** Explicit opt-in to simulated payments. Honoured only on a development or test run. */
  ALLOW_MOCK_PAYMENTS?: string | undefined;
}

/**
 * Picks the provider from configuration. The mock needs BOTH an explicit development or test run
 * (NODE_ENV=development|test) and ALLOW_MOCK_PAYMENTS=true; anything else (unset NODE_ENV, staging, a typo) refuses to
 * start, so a deploy can never "accept" payments that move no money or expose the unauthenticated "pay" route.
 * An unknown name is an error, never a silent fallback.
 */
export function createPaymentProvider(env: PaymentEnvironment): PaymentProvider {
  // A blank value (an empty line in an env file) counts as not set.
  const configured = env.PAYMENT_PROVIDER?.trim();
  const name = configured === undefined || configured === '' ? 'mock' : configured.toLowerCase();
  if (name === 'mock') {
    if (!isDevelopmentMode({ NODE_ENV: env.NODE_ENV })) {
      throw new Error(
        'PAYMENT_PROVIDER=mock is not allowed in production (or when NODE_ENV is not development or test). Configure a real payment provider before going live.',
      );
    }
    if ((env.ALLOW_MOCK_PAYMENTS ?? '').trim().toLowerCase() !== 'true') {
      throw new Error('PAYMENT_PROVIDER=mock needs ALLOW_MOCK_PAYMENTS=true: simulated payments are an explicit opt-in.');
    }
    return new MockPaymentProvider();
  }
  throw new Error(`Unknown PAYMENT_PROVIDER "${name}". Supported today: mock.`);
}
