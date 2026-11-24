/**
 * @file apps/api/src/modules/payments/mock-payment.provider.spec.ts
 * @feature payments
 */

import { MockPaymentProvider } from './mock-payment.provider';

describe('MockPaymentProvider', () => {
  it('identifies itself as a simulated provider', () => {
    const provider = new MockPaymentProvider();

    expect(provider.name).toBe('mock');
    expect(provider.simulated).toBe(true);
  });

  it('hands out a unique, recognisable reference and no client secret', async () => {
    const provider = new MockPaymentProvider();

    const first = await provider.createIntent();
    const second = await provider.createIntent();

    expect(first.providerRef).toMatch(/^mock_pi_[0-9a-f]{18}$/);
    expect(first.providerRef).not.toBe(second.providerRef);
    expect(first.clientSecret).toBeNull();
  });
});
