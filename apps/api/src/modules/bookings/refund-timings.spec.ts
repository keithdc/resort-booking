/**
 * @file apps/api/src/modules/bookings/refund-timings.spec.ts
 * @feature bookings
 */

import { ConfigService } from '@nestjs/config';
import { RefundTimings, refundTimingsFromEnv } from './refund-timings';

describe('refundTimingsFromEnv', () => {
  it('has sensible defaults: a 20 s provider timeout and a lease well beyond it', () => {
    const values = refundTimingsFromEnv({});

    expect(values).toEqual({
      providerTimeoutMs: 20_000,
      leaseSeconds: 150,
      reconcilerEnabled: true,
      reconcileAfterMinutes: 10,
      maxReconcileAttempts: 5,
      reconcileBatchSize: 20,
    });
    expect(values.leaseSeconds * 1000).toBeGreaterThan(values.providerTimeoutMs * 3);
  });

  it('never lets the lease be shorter than three provider timeouts plus 30 s', () => {
    expect(refundTimingsFromEnv({ REFUND_LEASE_SECONDS: '10' }).leaseSeconds).toBe(90);
    expect(refundTimingsFromEnv({ REFUND_PROVIDER_TIMEOUT_MS: '60000', REFUND_LEASE_SECONDS: '100' }).leaseSeconds).toBe(210);
  });

  it('can switch the reconciler off, in several spellings, and nothing else switches it off', () => {
    for (const value of ['false', 'FALSE', '0', 'off', ' no ']) {
      expect(refundTimingsFromEnv({ REFUND_RECONCILER_ENABLED: value }).reconcilerEnabled).toBe(false);
    }
    for (const value of ['true', '', 'banana', undefined]) {
      expect(refundTimingsFromEnv({ REFUND_RECONCILER_ENABLED: value }).reconcilerEnabled).toBe(true);
    }
  });

  it('falls back to the default for a value out of range or not a whole number', () => {
    const values = refundTimingsFromEnv({
      REFUND_PROVIDER_TIMEOUT_MS: '5',
      REFUND_RECONCILE_AFTER_MINUTES: '0',
      REFUND_RECONCILE_MAX_ATTEMPTS: 'many',
      REFUND_RECONCILE_BATCH: '100000',
    });

    expect(values.providerTimeoutMs).toBe(20_000);
    expect(values.reconcileAfterMinutes).toBe(10);
    expect(values.maxReconcileAttempts).toBe(5);
    expect(values.reconcileBatchSize).toBe(20);
  });

  it('reads the settings through the Nest config service', () => {
    const config = { get: (name: string): string | undefined => (name === 'REFUND_RECONCILE_AFTER_MINUTES' ? '30' : undefined) } as ConfigService;

    expect(new RefundTimings(config).values.reconcileAfterMinutes).toBe(30);
  });
});
