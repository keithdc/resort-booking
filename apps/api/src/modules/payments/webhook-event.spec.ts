/**
 * @file apps/api/src/modules/payments/webhook-event.spec.ts
 * @feature payments
 */

import { parseWebhookEvent, payloadSha256, WebhookPayloadError } from './webhook-event';

function body(value: unknown): Buffer {
  return Buffer.from(JSON.stringify(value));
}

function event(type: string, object: unknown, id = 'evt_1'): Buffer {
  return body({ id, type, data: { object } });
}

describe('parseWebhookEvent', () => {
  it('maps a succeeded payment intent', () => {
    expect(parseWebhookEvent(event('payment_intent.succeeded', { id: 'pi_1', amount: 100, client_secret: 'sensitive' }))).toEqual({
      id: 'evt_1',
      type: 'payment_intent.succeeded',
      event: { kind: 'payment_succeeded', paymentRef: 'pi_1' },
    });
  });

  it('maps a failed payment with a short failure code, and falls back for free text', () => {
    expect(parseWebhookEvent(event('payment_intent.payment_failed', { id: 'pi_1', last_payment_error: { code: 'card_declined' } })).event).toEqual({
      kind: 'payment_failed',
      paymentRef: 'pi_1',
      cancelled: false,
      reason: 'card_declined',
    });
    expect(parseWebhookEvent(event('payment_intent.payment_failed', { id: 'pi_1', last_payment_error: { code: 'Your card was declined, call 555-0100' } })).event).toMatchObject({
      reason: 'payment_failed',
    });
    expect(parseWebhookEvent(event('payment_intent.payment_failed', { id: 'pi_1' })).event).toMatchObject({ reason: 'payment_failed' });
  });

  it('maps a cancelled payment intent', () => {
    expect(parseWebhookEvent(event('payment_intent.canceled', { id: 'pi_1' })).event).toEqual({
      kind: 'payment_failed',
      paymentRef: 'pi_1',
      cancelled: true,
      reason: 'cancelled_by_provider',
    });
  });

  it.each([
    ['succeeded', 'succeeded'],
    ['failed', 'failed'],
    ['canceled', 'failed'],
    ['pending', 'pending'],
    ['requires_action', 'pending'],
    [undefined, 'pending'],
  ])('maps the refund status %p to %s', (status, expected) => {
    expect(parseWebhookEvent(event('refund.updated', { id: 're_1', status })).event).toMatchObject({ kind: 'refund_updated', providerRefundId: 're_1', status: expected });
  });

  it('reads our refund id from the metadata only when it is a UUID, and a short failure code', () => {
    const id = '0f8fad5b-d9cb-469f-a165-70867728950e';

    expect(parseWebhookEvent(event('charge.refund.updated', { id: 're_1', status: 'failed', failure_reason: 'lost_or_stolen_card', metadata: { refund_id: id.toUpperCase() } })).event).toEqual({
      kind: 'refund_updated',
      providerRefundId: 're_1',
      refundId: id,
      status: 'failed',
      failureReason: 'lost_or_stolen_card',
    });
    expect(parseWebhookEvent(event('refund.updated', { id: 're_1', status: 'failed', metadata: { refund_id: "1'; DROP TABLE refunds" } })).event).toMatchObject({ refundId: null });
  });

  it('answers "ignored" for a type we do not act on, not an error (the provider must be told it was received)', () => {
    expect(parseWebhookEvent(event('customer.created', { id: 'cus_1' })).event).toEqual({ kind: 'ignored' });
    expect(parseWebhookEvent(body({ id: 'evt_9', type: 'ping' })).event).toEqual({ kind: 'ignored' });
  });

  it.each([
    ['not JSON', Buffer.from('<xml/>')],
    ['an array', body([1])],
    ['null', body(null)],
    ['no id', body({ type: 'payment_intent.succeeded', data: { object: { id: 'pi_1' } } })],
    ['an id with spaces', event('payment_intent.succeeded', { id: 'pi_1' }, 'evt 1')],
    ['an id that is too long', event('payment_intent.succeeded', { id: 'pi_1' }, 'e'.repeat(256))],
    ['a numeric id', body({ id: 5, type: 'x', data: {} })],
    ['no type', body({ id: 'evt_1' })],
    ['an upper-case type', body({ id: 'evt_1', type: 'PAYMENT', data: {} })],
    ['no object for a payment event', body({ id: 'evt_1', type: 'payment_intent.succeeded' })],
    ['an object id with a quote', event('payment_intent.succeeded', { id: "pi'1" })],
  ])('refuses %s', (_name, raw) => {
    expect(() => parseWebhookEvent(raw)).toThrow(WebhookPayloadError);
  });
});

describe('payloadSha256', () => {
  it('is the SHA-256 of the exact bytes', () => {
    expect(payloadSha256(Buffer.from('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
