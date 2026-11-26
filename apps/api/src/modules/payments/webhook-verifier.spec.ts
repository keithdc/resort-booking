/**
 * @file apps/api/src/modules/payments/webhook-verifier.spec.ts
 * @feature payments
 * Signed fixtures: valid, wrong secret, tampered body, old timestamp, malformed headers, rotation.
 */

import { timingSafeEqual } from 'node:crypto';
import { signStripeStyle, StripeStyleWebhookVerifier, stripeStyleHeader, WebhookSignatureError } from './webhook-verifier';

// Wraps the real function so the test can count its calls; the behaviour is unchanged.
jest.mock('node:crypto', () => {
  const actual = jest.requireActual<typeof import('node:crypto')>('node:crypto');
  return { ...actual, timingSafeEqual: jest.fn(actual.timingSafeEqual) };
});

const SECRET = 'whsec_current_secret_value_0123456789';
const PREVIOUS = 'whsec_previous_secret_value_987654321';
const NOW_MS = Date.UTC(2027, 0, 15, 12, 0, 0);
const NOW_S = NOW_MS / 1000;
const BODY = Buffer.from('{"id":"evt_1","type":"payment_intent.succeeded","data":{"object":{"id":"pi_1"}}}');

function reasonOf(call: () => void): string {
  try {
    call();
  } catch (error: unknown) {
    if (error instanceof WebhookSignatureError) {
      return error.reason;
    }
    throw error;
  }
  return 'accepted';
}

describe('StripeStyleWebhookVerifier', () => {
  const verifier = new StripeStyleWebhookVerifier([SECRET], 300);

  it('accepts a body signed with the secret, over exactly its bytes', () => {
    expect(reasonOf(() => verifier.verify(BODY, stripeStyleHeader(SECRET, BODY, NOW_S), NOW_MS))).toBe('accepted');
  });

  it('reads the signature from the lower-case header it names', () => {
    expect(verifier.signatureHeader).toBe('stripe-signature');
  });

  it('refuses a body signed with another secret', () => {
    expect(reasonOf(() => verifier.verify(BODY, stripeStyleHeader('whsec_someone_elses_secret_value_1', BODY, NOW_S), NOW_MS))).toBe('mismatch');
  });

  it('refuses a body changed by one byte, and a body that was re-serialised (same JSON, different bytes)', () => {
    const header = stripeStyleHeader(SECRET, BODY, NOW_S);

    expect(reasonOf(() => verifier.verify(Buffer.from(BODY.toString().replace('pi_1', 'pi_2')), header, NOW_MS))).toBe('mismatch');
    expect(reasonOf(() => verifier.verify(Buffer.from(JSON.stringify(JSON.parse(BODY.toString()), null, 2)), header, NOW_MS))).toBe('mismatch');
  });

  it('refuses a timestamp changed after signing', () => {
    const signature = signStripeStyle(SECRET, BODY, NOW_S);

    expect(reasonOf(() => verifier.verify(BODY, `t=${String(NOW_S + 1)},v1=${signature}`, NOW_MS))).toBe('mismatch');
  });

  it('refuses an old timestamp (replay) and one from the future, but accepts the edge of the tolerance', () => {
    expect(reasonOf(() => verifier.verify(BODY, stripeStyleHeader(SECRET, BODY, NOW_S - 301), NOW_MS))).toBe('stale');
    expect(reasonOf(() => verifier.verify(BODY, stripeStyleHeader(SECRET, BODY, NOW_S + 301), NOW_MS))).toBe('stale');
    expect(reasonOf(() => verifier.verify(BODY, stripeStyleHeader(SECRET, BODY, NOW_S - 300), NOW_MS))).toBe('accepted');
  });

  it('honours the tolerance it was built with', () => {
    const strict = new StripeStyleWebhookVerifier([SECRET], 30);

    expect(reasonOf(() => strict.verify(BODY, stripeStyleHeader(SECRET, BODY, NOW_S - 60), NOW_MS))).toBe('stale');
  });

  it.each([
    [undefined, 'missing'],
    ['', 'missing'],
    ['   ', 'missing'],
    ['garbage', 'malformed'],
    ['t=abc,v1=' + 'a'.repeat(64), 'malformed'],
    ['t=1700000000', 'malformed'],
    ['v1=' + 'a'.repeat(64), 'malformed'],
    ['t=1700000000,v1=short', 'malformed'],
    ['t=1700000000,v1=' + 'z'.repeat(64), 'malformed'],
    ['x'.repeat(1025), 'malformed'],
  ])('refuses the header %p as %s', (header, reason) => {
    expect(reasonOf(() => verifier.verify(BODY, header, NOW_MS))).toBe(reason);
  });

  it('refuses a header with a flood of candidate signatures', () => {
    const header = `t=${String(NOW_S)},${Array.from({ length: 9 }, () => `v1=${'a'.repeat(64)}`).join(',')}`;

    expect(reasonOf(() => verifier.verify(BODY, header, NOW_MS))).toBe('malformed');
  });

  it('accepts one good signature among several (a provider that signs with two keys during rotation)', () => {
    const header = `t=${String(NOW_S)},v1=${'0'.repeat(64)},v1=${signStripeStyle(SECRET, BODY, NOW_S)}`;

    expect(reasonOf(() => verifier.verify(BODY, header, NOW_MS))).toBe('accepted');
  });

  it('accepts the previous secret while it is being rotated out, and refuses it afterwards', () => {
    const rotating = new StripeStyleWebhookVerifier([SECRET, PREVIOUS], 300);

    expect(reasonOf(() => rotating.verify(BODY, stripeStyleHeader(PREVIOUS, BODY, NOW_S), NOW_MS))).toBe('accepted');
    expect(reasonOf(() => verifier.verify(BODY, stripeStyleHeader(PREVIOUS, BODY, NOW_S), NOW_MS))).toBe('mismatch');
  });

  it('never puts the secret, the signature or the body in the error', () => {
    try {
      verifier.verify(BODY, stripeStyleHeader('whsec_someone_elses_secret_value_1', BODY, NOW_S), NOW_MS);
      throw new Error('should have been refused');
    } catch (error: unknown) {
      const text = error instanceof Error ? `${error.message} ${error.stack ?? ''}` : '';
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain('pi_1');
      expect(text).not.toMatch(/[0-9a-f]{64}/);
    }
  });

  it('compares signatures with crypto.timingSafeEqual, once per secret and candidate (no early exit)', () => {
    const spy = jest.mocked(timingSafeEqual);
    spy.mockClear();
    const rotating = new StripeStyleWebhookVerifier([SECRET, PREVIOUS], 300);
    const header = `t=${String(NOW_S)},v1=${signStripeStyle(SECRET, BODY, NOW_S)},v1=${'0'.repeat(64)}`;

    rotating.verify(BODY, header, NOW_MS);

    expect(spy).toHaveBeenCalledTimes(4);
  });

  it('refuses to be built without a secret', () => {
    expect(() => new StripeStyleWebhookVerifier([])).toThrow('at least one non-empty secret');
    expect(() => new StripeStyleWebhookVerifier([''])).toThrow('at least one non-empty secret');
  });
});
