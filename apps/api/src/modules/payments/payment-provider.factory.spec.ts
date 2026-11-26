/**
 * @file apps/api/src/modules/payments/payment-provider.factory.spec.ts
 * @feature payments
 */

import { MockPaymentProvider } from './mock-payment.provider';
import { createPaymentProvider } from './payment-provider.factory';

describe('createPaymentProvider', () => {
  const OPT_IN = { ALLOW_MOCK_PAYMENTS: 'true' };

  it('uses the mock only on an explicit development or test run WITH the explicit opt-in', () => {
    expect(createPaymentProvider({ NODE_ENV: 'development', ...OPT_IN })).toBeInstanceOf(MockPaymentProvider);
    expect(createPaymentProvider({ NODE_ENV: 'test', ...OPT_IN })).toBeInstanceOf(MockPaymentProvider);
  });

  it('refuses the mock without ALLOW_MOCK_PAYMENTS=true, even in development', () => {
    expect(() => createPaymentProvider({ NODE_ENV: 'development' })).toThrow('ALLOW_MOCK_PAYMENTS=true');
    expect(() => createPaymentProvider({ NODE_ENV: 'test', ALLOW_MOCK_PAYMENTS: 'yes' })).toThrow('ALLOW_MOCK_PAYMENTS=true');
  });

  it('accepts an explicit mock in any case and with spaces', () => {
    expect(createPaymentProvider({ NODE_ENV: 'test', PAYMENT_PROVIDER: ' Mock ', ALLOW_MOCK_PAYMENTS: ' TRUE ' })).toBeInstanceOf(MockPaymentProvider);
  });

  it('treats a blank value as not set (so the mock, which needs the opt-in)', () => {
    expect(createPaymentProvider({ NODE_ENV: 'test', PAYMENT_PROVIDER: '', ...OPT_IN })).toBeInstanceOf(MockPaymentProvider);
    expect(createPaymentProvider({ NODE_ENV: 'test', PAYMENT_PROVIDER: '   ', ...OPT_IN })).toBeInstanceOf(MockPaymentProvider);
    expect(() => createPaymentProvider({ PAYMENT_PROVIDER: '', NODE_ENV: 'production' })).toThrow('not allowed in production');
  });

  it('refuses to start on the mock when production-like, even WITH the opt-in: unset NODE_ENV, staging, typos', () => {
    for (const NODE_ENV of ['production', undefined, '', 'staging', 'prod', 'Development']) {
      expect(() => createPaymentProvider({ NODE_ENV, ...OPT_IN })).toThrow('not allowed in production');
      expect(() => createPaymentProvider({ NODE_ENV, PAYMENT_PROVIDER: 'mock', ...OPT_IN })).toThrow('not allowed in production');
    }
  });

  it('fails loudly for a provider that is not built yet instead of falling back', () => {
    expect(() => createPaymentProvider({ PAYMENT_PROVIDER: 'stripe' })).toThrow('Unknown PAYMENT_PROVIDER "stripe"');
  });
});
