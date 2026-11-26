/**
 * @file apps/api/src/modules/payments/mock-payment.provider.spec.ts
 * @feature payments
 */

import { MockPaymentProvider } from './mock-payment.provider';
import { refundIdempotencyKey } from './payment-provider';

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
    const request = { providerRef: 'mock_pi_x', amountCents: 4000, currencyCode: 'EUR', reason: 'Guest cancelled', idempotencyKey: 'refund-r1-g1-c0' };

    it('succeeds with a recognisable refund reference, one per idempotency key', async () => {
      const provider = new MockPaymentProvider();

      const first = await provider.refund(request);
      const second = await provider.refund({ ...request, idempotencyKey: 'refund-r1-g1-c1' });

      expect(first.status).toBe('succeeded');
      expect(first.providerRef).toMatch(/^mock_re_[0-9a-f]{18}$/);
      expect(first.providerRef).not.toBe(second.providerRef);
    });

    it('returns the SAME result for a repeated key and does not refund a second time', async () => {
      const provider = new MockPaymentProvider();

      const first = await provider.refund(request);
      const again = await provider.refund({ ...request });

      expect(again).toEqual(first);
      expect(provider.issuedRefunds).toBe(1);
    });

    it('refuses a key that is reused with different parameters, as Stripe does', async () => {
      const provider = new MockPaymentProvider();
      await provider.refund(request);

      await expect(provider.refund({ ...request, amountCents: 5000 })).rejects.toThrow('different parameters');
      await expect(provider.refund({ ...request, providerRef: 'mock_pi_y' })).rejects.toThrow('different parameters');
      expect(provider.issuedRefunds).toBe(1);
    });

    it('refuses a blank key', async () => {
      await expect(new MockPaymentProvider().refund({ ...request, idempotencyKey: '  ' })).rejects.toThrow('idempotency key');
    });

    it('forgets the oldest keys beyond its memory instead of growing without limit', async () => {
      const provider = new MockPaymentProvider();

      for (let index = 0; index < 2005; index += 1) {
        await provider.refund({ ...request, idempotencyKey: `k${String(index)}` });
      }

      expect(provider.issuedRefunds).toBe(2000);
    });

    it.each([0, -100, 12.5, Number.NaN])('rejects a nonsense amount of %s, as a real provider would', async (amountCents) => {
      const provider = new MockPaymentProvider();

      await expect(provider.refund({ ...request, amountCents })).rejects.toThrow('whole amount above zero');
    });
  });

  describe('refundIdempotencyKey', () => {
    it('is deterministic from the refund, the key generation and the chunk', () => {
      expect(refundIdempotencyKey('abc', 1, 0)).toBe('refund-abc-g1-c0');
      expect(refundIdempotencyKey('abc', 1, 0)).toBe(refundIdempotencyKey('abc', 1, 0));
      expect(refundIdempotencyKey('abc', 2, 0)).not.toBe(refundIdempotencyKey('abc', 1, 0));
      expect(refundIdempotencyKey('abc', 1, 1)).not.toBe(refundIdempotencyKey('abc', 1, 0));
    });
  });
});
