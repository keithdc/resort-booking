/**
 * @file apps/api/src/modules/payments/webhook-verifier.ts
 * @feature payments
 * @dependencies node:crypto
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

/** The signature did not check out. The reason is for the log only: callers answer one uniform 401. */
export class WebhookSignatureError extends Error {
  public constructor(public readonly reason: 'missing' | 'malformed' | 'stale' | 'mismatch') {
    super(`webhook signature rejected: ${reason}`);
    this.name = 'WebhookSignatureError';
  }
}

/**
 * Proves that a webhook body came from the payment provider. The real provider's verifier (Stripe's SDK, say) drops in
 * behind this interface; the HMAC scheme below is what the mock and the tests sign with.
 */
export interface WebhookVerifier {
  /** The lower-case request header that carries the signature. */
  readonly signatureHeader: string;
  /** Throws WebhookSignatureError unless `signature` is valid for exactly these bytes. Never logs the secret. */
  verify(rawBody: Buffer, signature: string | undefined, nowMs?: number): void;
}

/** Longest signature header accepted: a header with hundreds of candidate signatures is an attack, not a rotation. */
const MAX_HEADER_LENGTH = 1024;
const MAX_CANDIDATES = 8;

/**
 * The Stripe-style scheme: header `t=<unix seconds>,v1=<hex HMAC-SHA256>` where the HMAC is over `<t>.<raw body>`. Several
 * `v1=` values and several secrets are accepted (a secret being rotated), the comparison is timing-safe, and a timestamp
 * further than `toleranceSeconds` from now, in either direction, is refused (replay protection). It signs the RAW bytes, so
 * a body that was parsed and re-serialised on the way fails.
 */
export class StripeStyleWebhookVerifier implements WebhookVerifier {
  public readonly signatureHeader = 'stripe-signature';

  public constructor(
    private readonly secrets: readonly string[],
    private readonly toleranceSeconds: number = 300,
  ) {
    if (secrets.length === 0 || secrets.some((secret: string): boolean => secret === '')) {
      throw new Error('A webhook verifier needs at least one non-empty secret');
    }
  }

  public verify(rawBody: Buffer, signature: string | undefined, nowMs: number = Date.now()): void {
    if (signature === undefined || signature.trim() === '') {
      throw new WebhookSignatureError('missing');
    }
    if (signature.length > MAX_HEADER_LENGTH) {
      throw new WebhookSignatureError('malformed');
    }
    const { timestamp, candidates } = parseSignatureHeader(signature);
    if (timestamp === null || candidates.length === 0 || candidates.length > MAX_CANDIDATES) {
      throw new WebhookSignatureError('malformed');
    }
    const ageSeconds = Math.abs(nowMs / 1000 - timestamp);
    // Checked before the HMAC is computed, but only a signature that is otherwise well formed gets this far.
    if (ageSeconds > this.toleranceSeconds) {
      throw new WebhookSignatureError('stale');
    }
    let matched = false;
    for (const secret of this.secrets) {
      const expected = Buffer.from(signStripeStyle(secret, rawBody, timestamp), 'hex');
      for (const candidate of candidates) {
        // Both are 32 bytes, so timingSafeEqual never throws on a length mismatch.
        if (timingSafeEqual(expected, candidate)) {
          matched = true;
        }
      }
    }
    if (!matched) {
      throw new WebhookSignatureError('mismatch');
    }
  }
}

/**
 * The hex HMAC-SHA256 of `<timestamp>.<body>`. Exported so the mock provider and the tests sign the same way.
 */
export function signStripeStyle(secret: string, rawBody: Buffer, timestampSeconds: number): string {
  return createHmac('sha256', secret).update(`${String(timestampSeconds)}.`).update(rawBody).digest('hex');
}

/**
 * A complete `Stripe-Signature` style header value for a body.
 */
export function stripeStyleHeader(secret: string, rawBody: Buffer, timestampSeconds: number): string {
  return `t=${String(timestampSeconds)},v1=${signStripeStyle(secret, rawBody, timestampSeconds)}`;
}

function parseSignatureHeader(header: string): { timestamp: number | null; candidates: Buffer[] } {
  let timestamp: number | null = null;
  const candidates: Buffer[] = [];
  for (const part of header.split(',')) {
    const separator = part.indexOf('=');
    if (separator < 1) {
      continue;
    }
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === 't' && /^\d{1,12}$/.test(value)) {
      timestamp = Number(value);
    } else if (key === 'v1' && /^[0-9a-fA-F]{64}$/.test(value)) {
      candidates.push(Buffer.from(value, 'hex'));
    }
  }
  return { timestamp, candidates };
}
