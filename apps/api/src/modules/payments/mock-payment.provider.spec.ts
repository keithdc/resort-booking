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

  describe('refund', () => {
    const request = { providerRef: 'mock_pi_x', amountCents: 4000, currencyCode: 'EUR', reason: 'Guest cancelled' };

    it('succeeds with a unique, recognisable refund reference', async () => {
      const provider = new MockPaymentProvider();

      const first = await provider.refund(request);
      const second = await provider.refund(request);

      expect(first.status).toBe('succeeded');
      expect(first.providerRef).toMatch(/^mock_re_[0-9a-f]{18}$/);
      expect(first.providerRef).not.toBe(second.providerRef);
    });

    it.each([0, -100, 12.5, Number.NaN])('rejects a nonsense amount of %s, as a real provider would', async (amountCents) => {
      const provider = new MockPaymentProvider();

      await expect(provider.refund({ ...request, amountCents })).rejects.toThrow('whole amount above zero');
    });
  });
});
