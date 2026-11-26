/**
 * @file apps/api/src/modules/payments/webhook-config.ts
 * @feature payments
 * @dependencies environment
 */

import { readIntEnv, WEBHOOK_SECRET_MIN_LENGTH } from '../../shared/config/environment';
import { StripeStyleWebhookVerifier, type WebhookVerifier } from './webhook-verifier';

export interface WebhookSettings {
  /** The current secret first, then the previous one while it is being rotated. Empty: webhooks are off. */
  secrets: string[];
  /** How far a signed timestamp may be from now, in seconds. */
  toleranceSeconds: number;
}

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Reads the webhook settings. `PAYMENT_WEBHOOK_SECRET` switches the endpoint on; `PAYMENT_WEBHOOK_SECRET_PREVIOUS`
 * keeps the old secret valid while the provider is switched over (rotation, see docs/14); the replay tolerance is
 * `PAYMENT_WEBHOOK_TOLERANCE_SECONDS` (default 300, 30 to 3600). A secret that is too short throws: a weak key must stop
 * the start-up, not weaken the endpoint. The secret is never part of an error message.
 */
export function readWebhookSettings(env: Env): WebhookSettings {
  const secrets: string[] = [];
  for (const name of ['PAYMENT_WEBHOOK_SECRET', 'PAYMENT_WEBHOOK_SECRET_PREVIOUS']) {
    const value = (env[name] ?? '').trim();
    if (value === '') {
      continue;
    }
    if (value.length < WEBHOOK_SECRET_MIN_LENGTH) {
      throw new Error(`${name} is too short: use at least ${String(WEBHOOK_SECRET_MIN_LENGTH)} random characters (the provider generates it).`);
    }
    secrets.push(value);
  }
  if ((env.PAYMENT_WEBHOOK_SECRET ?? '').trim() === '' && secrets.length > 0) {
    throw new Error('PAYMENT_WEBHOOK_SECRET_PREVIOUS is set without PAYMENT_WEBHOOK_SECRET: set the current secret first.');
  }
  return { secrets, toleranceSeconds: readIntEnv(env, 'PAYMENT_WEBHOOK_TOLERANCE_SECONDS', 300, 30, 3600) };
}

/**
 * The verifier for the configured secret(s), or null when webhooks are off. A real provider's own verifier replaces
 * this factory's result in the module (one line), the rest of the handler stays the same.
 */
export function createWebhookVerifier(env: Env): WebhookVerifier | null {
  const settings = readWebhookSettings(env);
  return settings.secrets.length === 0 ? null : new StripeStyleWebhookVerifier(settings.secrets, settings.toleranceSeconds);
}

/** Nest injection token for the webhook signature verifier (null when no secret is configured: the endpoint is off). */
export const PAYMENT_WEBHOOK_VERIFIER = Symbol('PAYMENT_WEBHOOK_VERIFIER');
