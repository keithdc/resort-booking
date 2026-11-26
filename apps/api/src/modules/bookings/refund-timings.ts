/**
 * @file apps/api/src/modules/bookings/refund-timings.ts
 * @feature bookings
 * @dependencies ConfigService, environment
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readIntEnv } from '../../shared/config/environment';

export interface RefundTimingValues {
  /** How long one provider refund call may take before its outcome is treated as unknown. */
  providerTimeoutMs: number;
  /** How long a process owns a refund it took to call the provider. Always longer than the provider timeout. */
  leaseSeconds: number;
  /** Whether the reconciler sweep runs on this instance. */
  reconcilerEnabled: boolean;
  /** A pending online refund older than this is picked up by the reconciler. */
  reconcileAfterMinutes: number;
  /** After this many passes without a clear answer the reconciler marks the refund failed for staff. */
  maxReconcileAttempts: number;
  /** Refunds handled per sweep. */
  reconcileBatchSize: number;
}

type Env = Readonly<Record<string, string | undefined>>;

const OFF_VALUES = ['false', '0', 'off', 'no'];

/**
 * Reads the refund timing settings. A bad value falls back to the default (never to "off"), and the lease can never be
 * shorter than three provider timeouts plus 30 seconds, so a retry cannot overlap a call that is still in flight.
 *   REFUND_PROVIDER_TIMEOUT_MS (20000), REFUND_LEASE_SECONDS (150), REFUND_RECONCILER_ENABLED (true),
 *   REFUND_RECONCILE_AFTER_MINUTES (10), REFUND_RECONCILE_MAX_ATTEMPTS (5), REFUND_RECONCILE_BATCH (20).
 */
export function refundTimingsFromEnv(env: Env): RefundTimingValues {
  const providerTimeoutMs = readIntEnv(env, 'REFUND_PROVIDER_TIMEOUT_MS', 20_000, 1000, 60_000);
  const minimumLease = Math.ceil((providerTimeoutMs * 3) / 1000) + 30;
  const leaseSeconds = Math.max(readIntEnv(env, 'REFUND_LEASE_SECONDS', 150, 10, 3600), minimumLease);
  const enabled = (env.REFUND_RECONCILER_ENABLED ?? 'true').trim().toLowerCase();
  return {
    providerTimeoutMs,
    leaseSeconds,
    reconcilerEnabled: !OFF_VALUES.includes(enabled),
    reconcileAfterMinutes: readIntEnv(env, 'REFUND_RECONCILE_AFTER_MINUTES', 10, 1, 1440),
    maxReconcileAttempts: readIntEnv(env, 'REFUND_RECONCILE_MAX_ATTEMPTS', 5, 1, 100),
    reconcileBatchSize: readIntEnv(env, 'REFUND_RECONCILE_BATCH', 20, 1, 200),
  };
}

@Injectable()
export class RefundTimings {
  public readonly values: RefundTimingValues;

  public constructor(config: ConfigService) {
    const names = [
      'REFUND_PROVIDER_TIMEOUT_MS',
      'REFUND_LEASE_SECONDS',
      'REFUND_RECONCILER_ENABLED',
      'REFUND_RECONCILE_AFTER_MINUTES',
      'REFUND_RECONCILE_MAX_ATTEMPTS',
      'REFUND_RECONCILE_BATCH',
    ];
    const env: Record<string, string | undefined> = {};
    for (const name of names) {
      env[name] = config.get<string>(name);
    }
    this.values = refundTimingsFromEnv(env);
  }
}
