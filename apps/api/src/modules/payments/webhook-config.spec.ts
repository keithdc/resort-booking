/**
 * @file apps/api/src/modules/payments/webhook-config.spec.ts
 * @feature payments
 */

import { StripeStyleWebhookVerifier } from './webhook-verifier';
import { createWebhookVerifier, readWebhookSettings } from './webhook-config';

const CURRENT = 'whsec_current_0123456789abcdef';
const PREVIOUS = 'whsec_previous_0123456789abcdef';

describe('readWebhookSettings', () => {
  it('is off without a secret', () => {
    expect(readWebhookSettings({})).toEqual({ secrets: [], toleranceSeconds: 300 });
    expect(readWebhookSettings({ PAYMENT_WEBHOOK_SECRET: '   ' }).secrets).toEqual([]);
  });

  it('lists the current secret first and the previous one while rotating', () => {
    expect(readWebhookSettings({ PAYMENT_WEBHOOK_SECRET: ` ${CURRENT} `, PAYMENT_WEBHOOK_SECRET_PREVIOUS: PREVIOUS }).secrets).toEqual([CURRENT, PREVIOUS]);
  });

  it('refuses a short secret without printing it', () => {
    expect(() => readWebhookSettings({ PAYMENT_WEBHOOK_SECRET: 'hunter2' })).toThrow('PAYMENT_WEBHOOK_SECRET is too short');
    try {
      readWebhookSettings({ PAYMENT_WEBHOOK_SECRET: 'hunter2' });
    } catch (error: unknown) {
      expect(String(error)).not.toContain('hunter2');
    }
    expect(() => readWebhookSettings({ PAYMENT_WEBHOOK_SECRET: CURRENT, PAYMENT_WEBHOOK_SECRET_PREVIOUS: 'old' })).toThrow('PAYMENT_WEBHOOK_SECRET_PREVIOUS is too short');
  });

  it('refuses a previous secret with no current one', () => {
    expect(() => readWebhookSettings({ PAYMENT_WEBHOOK_SECRET_PREVIOUS: PREVIOUS })).toThrow('without PAYMENT_WEBHOOK_SECRET');
  });

  it('reads the replay tolerance within 30 to 3600 seconds, else the default', () => {
    expect(readWebhookSettings({ PAYMENT_WEBHOOK_TOLERANCE_SECONDS: '60' }).toleranceSeconds).toBe(60);
    expect(readWebhookSettings({ PAYMENT_WEBHOOK_TOLERANCE_SECONDS: '5' }).toleranceSeconds).toBe(300);
    expect(readWebhookSettings({ PAYMENT_WEBHOOK_TOLERANCE_SECONDS: 'x' }).toleranceSeconds).toBe(300);
  });
});

describe('createWebhookVerifier', () => {
  it('is null (endpoint off) without a secret, and the HMAC verifier with one', () => {
    expect(createWebhookVerifier({})).toBeNull();
    expect(createWebhookVerifier({ PAYMENT_WEBHOOK_SECRET: CURRENT })).toBeInstanceOf(StripeStyleWebhookVerifier);
  });
});
