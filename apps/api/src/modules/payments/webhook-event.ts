/**
 * @file apps/api/src/modules/payments/webhook-event.ts
 * @feature payments
 * @dependencies node:crypto
 */

import { createHash } from 'node:crypto';

/** What a webhook means for us, whatever the provider calls it. */
export type NormalizedWebhookEvent =
  | { kind: 'payment_succeeded'; paymentRef: string }
  | { kind: 'payment_failed'; paymentRef: string; cancelled: boolean; reason: string }
  | {
      kind: 'refund_updated';
      /** The provider's id of the refund (stored in `refunds.provider_ref`). */
      providerRefundId: string;
      /** Our refund id, when the provider echoes it back (metadata). */
      refundId: string | null;
      status: 'succeeded' | 'failed' | 'pending';
      failureReason: string | null;
    }
  | { kind: 'ignored' };

export interface ParsedWebhookEvent {
  /** The provider's unique id for this event: the idempotency key of the whole handler. */
  id: string;
  type: string;
  event: NormalizedWebhookEvent;
}

/** The body is not an event we can read. Callers answer one uniform 400. */
export class WebhookPayloadError extends Error {
  public constructor(reason: string) {
    super(`webhook payload rejected: ${reason}`);
    this.name = 'WebhookPayloadError';
  }
}

const ID_PATTERN = /^[A-Za-z0-9_.:-]{1,255}$/;
const TYPE_PATTERN = /^[a-z0-9_.]{1,120}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE_PATTERN = /^[a-z0-9_]{1,60}$/;

/** SHA-256 of the exact bytes received: all the events table keeps of the body. */
export function payloadSha256(rawBody: Buffer): string {
  return createHash('sha256').update(rawBody).digest('hex');
}

/**
 * Reads a verified body in the Stripe event shape (`{ id, type, data: { object } }`) and maps the types we act on.
 * Everything is checked with the types and patterns it must have; nothing from the body is stored except the event id,
 * the type, short codes and ids. Unknown types come back as `ignored`, not as an error: the provider must be told "got it".
 */
export function parseWebhookEvent(rawBody: Buffer): ParsedWebhookEvent {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw new WebhookPayloadError('not JSON');
  }
  const root = asRecord(parsed);
  if (root === null) {
    throw new WebhookPayloadError('not an object');
  }
  const id = root.id;
  const type = root.type;
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    throw new WebhookPayloadError('bad event id');
  }
  if (typeof type !== 'string' || !TYPE_PATTERN.test(type)) {
    throw new WebhookPayloadError('bad event type');
  }
  const object = asRecord(asRecord(root.data)?.object);

  switch (type) {
    case 'payment_intent.succeeded':
      return { id, type, event: { kind: 'payment_succeeded', paymentRef: requireRef(object) } };
    case 'payment_intent.payment_failed':
      return {
        id,
        type,
        event: { kind: 'payment_failed', paymentRef: requireRef(object), cancelled: false, reason: failureCode(asRecord(object?.last_payment_error)?.code, 'payment_failed') },
      };
    case 'payment_intent.canceled':
      return { id, type, event: { kind: 'payment_failed', paymentRef: requireRef(object), cancelled: true, reason: 'cancelled_by_provider' } };
    case 'refund.updated':
    case 'charge.refund.updated': {
      const metadata = asRecord(object?.metadata);
      const hint = metadata?.refund_id;
      return {
        id,
        type,
        event: {
          kind: 'refund_updated',
          providerRefundId: requireRef(object),
          refundId: typeof hint === 'string' && UUID_PATTERN.test(hint) ? hint.toLowerCase() : null,
          status: refundStatus(object?.status),
          failureReason: object?.failure_reason === undefined || object.failure_reason === null ? null : failureCode(object.failure_reason, 'refund_failed'),
        },
      };
    }
    default:
      return { id, type, event: { kind: 'ignored' } };
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function requireRef(object: Record<string, unknown> | null): string {
  const ref = object?.id;
  if (typeof ref !== 'string' || !ID_PATTERN.test(ref)) {
    throw new WebhookPayloadError('bad object id');
  }
  return ref;
}

function refundStatus(value: unknown): 'succeeded' | 'failed' | 'pending' {
  if (value === 'succeeded') {
    return 'succeeded';
  }
  return value === 'failed' || value === 'canceled' ? 'failed' : 'pending';
}

/** A provider's failure code is kept only when it is a short snake_case code; free text from outside is never stored. */
function failureCode(value: unknown, fallback: string): string {
  return typeof value === 'string' && CODE_PATTERN.test(value) ? value : fallback;
}
