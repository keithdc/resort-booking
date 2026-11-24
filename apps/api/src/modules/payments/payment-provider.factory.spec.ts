/**
 * @file apps/api/src/modules/payments/payment-provider.factory.spec.ts
 * @feature payments
 */

import { MockPaymentProvider } from './mock-payment.provider';
import { createPaymentProvider } from './payment-provider.factory';

describe('createPaymentProvider', () => {
  it('uses the mock by default outside production', () => {
    expect(createPaymentProvider({})).toBeInstanceOf(MockPaymentProvider);
    expect(createPaymentProvider({ NODE_ENV: 'development' })).toBeInstanceOf(MockPaymentProvider);
    expect(createPaymentProvider({ NODE_ENV: 'test' })).toBeInstanceOf(MockPaymentProvider);
  });

  it('accepts an explicit mock in any case and with spaces', () => {
    expect(createPaymentProvider({ PAYMENT_PROVIDER: ' Mock ' })).toBeInstanceOf(MockPaymentProvider);
  });

  it('treats a blank value as not set', () => {
    expect(createPaymentProvider({ PAYMENT_PROVIDER: '' })).toBeInstanceOf(MockPaymentProvider);
    expect(createPaymentProvider({ PAYMENT_PROVIDER: '   ' })).toBeInstanceOf(MockPaymentProvider);
    expect(() => createPaymentProvider({ PAYMENT_PROVIDER: '', NODE_ENV: 'production' })).toThrow('not allowed in production');
  });

  it('refuses to start on the mock in production, so no deploy fakes payments', () => {
    expect(() => createPaymentProvider({ NODE_ENV: 'production' })).toThrow('not allowed in production');
    expect(() => createPaymentProvider({ NODE_ENV: 'production', PAYMENT_PROVIDER: 'mock' })).toThrow(
      'not allowed in production',
    );
  });

  it('fails loudly for a provider that is not built yet instead of falling back', () => {
    expect(() => createPaymentProvider({ PAYMENT_PROVIDER: 'stripe' })).toThrow('Unknown PAYMENT_PROVIDER "stripe"');
  });
});
