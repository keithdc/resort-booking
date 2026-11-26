/**
 * @file apps/api/src/modules/payments/payment-webhook.service.spec.ts
 * @feature payments
 * Signed fixtures through the whole handler: valid, wrong secret, tampered body, old timestamp, duplicate event,
 * unknown type, late success, refund updates, failed payments.
 */

import { ConflictException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { PoolClient } from 'pg';
import { AuditService } from '../../shared/audit/audit.service';
import type { AuditEntry } from '../../shared/audit/audit.types';
import { DatabaseService } from '../../shared/database/database.service';
import { RedisService } from '../../shared/redis/redis.service';
import { DiscountsService } from '../discounts/discounts.service';
import { InventoryService, type PayableHold } from '../inventory/inventory.service';
import { PaymentEventsRegistry, type LatePayment, type PaymentEventsPort, type RefundUpdate, type RefundUpdateResult } from './payment-events';
import { PAYMENT_PROVIDER } from './payment-provider';
import { PaymentSettlementRegistry, type PaymentSettlementHandler, type SettlingPayment } from './payment-settlement';
import { PaymentWebhookRepository, type EventRegistration } from './payment-webhook.repository';
import { PaymentWebhookService, WEBHOOK_BODY_LIMIT_BYTES } from './payment-webhook.service';
import { PaymentsRepository, type PaymentRow } from './payments.repository';
import { PAYMENT_WEBHOOK_VERIFIER } from './webhook-config';
import { StripeStyleWebhookVerifier, stripeStyleHeader } from './webhook-verifier';

const SECRET = 'whsec_current_secret_value_0123456789';
const HOLD = 'hold-1';
const PAYMENT = 'pay-1';
const EVENT_ROW = 'event-row-1';

const PAYABLE: PayableHold = {
  id: HOLD,
  organizationId: 'org',
  propertyId: 'prop',
  houseId: 'house',
  paymentMethod: 'card',
  totalCents: 54000,
  currencyCode: 'EUR',
  discounts: [{ discountId: 'd1', label: 'Long stay', amountCents: 6000 }],
};

function payment(overrides: Partial<PaymentRow> = {}): PaymentRow {
  return {
    id: PAYMENT,
    organization_id: 'org',
    property_id: 'prop',
    inventory_block_id: HOLD,
    provider: 'mock',
    provider_ref: 'pi_1',
    amount_cents: 54000,
    currency_code: 'EUR',
    status: 'requires_payment',
    failure_reason: null,
    purpose: 'booking',
    payload: null,
    ...overrides,
  };
}

function expired(): ConflictException {
  return new ConflictException({ message: 'Time ran out', code: 'HOLD_EXPIRED' });
}

describe('PaymentWebhookService', () => {
  const register = jest.fn<Promise<EventRegistration>, [unknown]>();
  const finish = jest.fn<Promise<void>, [PoolClient, string, string, string | null]>();
  const markFailed = jest.fn<Promise<void>, [string, string]>();
  const findByProviderRef = jest.fn<Promise<PaymentRow | null>, [string, string]>();
  const lockById = jest.fn<Promise<PaymentRow | null>, [PoolClient, string]>();
  const markSucceeded = jest.fn<Promise<boolean>, [PoolClient, string]>();
  const creditBooking = jest.fn<Promise<void>, [PoolClient, string]>();
  const markLateSucceeded = jest.fn<Promise<boolean>, [PoolClient, string]>();
  const markEndedIn = jest.fn<Promise<boolean>, [PoolClient, string, string, string]>();
  const getPayableHold = jest.fn<Promise<PayableHold>, [string]>();
  const confirmPaidHold = jest.fn<Promise<unknown>, [PoolClient, string]>();
  const releaseHold = jest.fn<Promise<void>, [string]>();
  const recordRedemptions = jest.fn<Promise<void>, [PoolClient, string, unknown]>();
  const deleteHoldTtl = jest.fn<Promise<void>, [string]>();
  const hitWindowWithTtl = jest.fn();
  const record = jest.fn<Promise<boolean>, [AuditEntry]>();
  const recordLateRefund = jest.fn<Promise<string | null>, [PoolClient, LatePayment]>();
  const settleLateRefund = jest.fn<Promise<'succeeded' | 'failed' | 'pending'>, [string, LatePayment]>();
  const applyRefundUpdate = jest.fn<Promise<RefundUpdateResult>, [PoolClient, RefundUpdate]>();
  const rebookSettle = jest.fn<Promise<void>, [PoolClient, SettlingPayment]>();
  const clientQuery = jest.fn<Promise<unknown>, [string]>();
  let service: PaymentWebhookService;
  let errorLog: jest.SpyInstance;
  let warnLog: jest.SpyInstance;
  let eventNumber = 0;

  async function build(verifier: StripeStyleWebhookVerifier | null = new StripeStyleWebhookVerifier([SECRET], 300)): Promise<PaymentWebhookService> {
    const settlements = new PaymentSettlementRegistry();
    const rebookHandler: PaymentSettlementHandler = { purpose: 'rebook', settle: rebookSettle, presentSettled: () => Promise.resolve(null) };
    settlements.register(rebookHandler);
    const events = new PaymentEventsRegistry();
    const port: PaymentEventsPort = { recordLateRefund, settleLateRefund, applyRefundUpdate };
    events.register(port);
    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentWebhookService,
        { provide: PAYMENT_PROVIDER, useValue: { name: 'mock', simulated: true } },
        { provide: PAYMENT_WEBHOOK_VERIFIER, useValue: verifier },
        { provide: ConfigService, useValue: { get: (): undefined => undefined } },
        { provide: PaymentWebhookRepository, useValue: { register, finish, markFailed } },
        { provide: PaymentsRepository, useValue: { findByProviderRef, lockById, markSucceeded, creditBooking, markLateSucceeded, markEndedIn } },
        { provide: InventoryService, useValue: { getPayableHold, confirmPaidHold, releaseHold } },
        { provide: DiscountsService, useValue: { recordRedemptions } },
        {
          provide: DatabaseService,
          useValue: { withClient: (fn: (client: { query: typeof clientQuery }) => Promise<unknown>): Promise<unknown> => fn({ query: clientQuery }) },
        },
        { provide: RedisService, useValue: { deleteHoldTtl, hitWindowWithTtl } },
        { provide: PaymentSettlementRegistry, useValue: settlements },
        { provide: PaymentEventsRegistry, useValue: events },
        { provide: AuditService, useValue: { record } },
      ],
    }).compile();
    return moduleRef.get(PaymentWebhookService);
  }

  function envelope(type: string, object: unknown, id?: string): Buffer {
    eventNumber += 1;
    return Buffer.from(JSON.stringify({ id: id ?? `evt_${String(eventNumber)}`, type, data: { object } }));
  }

  function signed(body: Buffer, secret = SECRET, at = Math.floor(Date.now() / 1000)): Record<string, string> {
    return { 'stripe-signature': stripeStyleHeader(secret, body, at) };
  }

  function deliver(body: Buffer, headers: Record<string, string> = signed(body), provider = 'mock'): ReturnType<PaymentWebhookService['handle']> {
    return service.handle(provider, { rawBody: body, headers, ip: '203.0.113.9' });
  }

  function statements(): string[] {
    return clientQuery.mock.calls.map((call) => String(call[0]));
  }

  beforeEach(async () => {
    jest.resetAllMocks();
    eventNumber = 0;
    errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation((): void => undefined);
    warnLog = jest.spyOn(Logger.prototype, 'warn').mockImplementation((): void => undefined);
    clientQuery.mockResolvedValue({ rows: [] });
    hitWindowWithTtl.mockResolvedValue({ count: 1, ttlSeconds: 60 });
    register.mockResolvedValue({ outcome: 'new', id: EVENT_ROW });
    finish.mockResolvedValue(undefined);
    markFailed.mockResolvedValue(undefined);
    findByProviderRef.mockResolvedValue(payment());
    lockById.mockImplementation(() => Promise.resolve(payment()));
    markSucceeded.mockResolvedValue(true);
    creditBooking.mockResolvedValue(undefined);
    markLateSucceeded.mockResolvedValue(true);
    markEndedIn.mockResolvedValue(true);
    getPayableHold.mockResolvedValue(PAYABLE);
    confirmPaidHold.mockResolvedValue({ reservationId: HOLD });
    releaseHold.mockResolvedValue(undefined);
    recordRedemptions.mockResolvedValue(undefined);
    deleteHoldTtl.mockResolvedValue(undefined);
    record.mockResolvedValue(true);
    recordLateRefund.mockResolvedValue('refund-1');
    settleLateRefund.mockResolvedValue('succeeded');
    applyRefundUpdate.mockResolvedValue('settled');
    rebookSettle.mockResolvedValue(undefined);
    service = await build();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('availability: not there unless configured', () => {
    it('is a 404 when no secret is configured (no verifier), whatever the body', async () => {
      service = await build(null);
      const body = envelope('payment_intent.succeeded', { id: 'pi_1' });

      await expect(deliver(body)).rejects.toMatchObject({ status: 404 });
      expect(register).not.toHaveBeenCalled();
    });

    it('is a 404 for a provider that is not the configured one, in any letter case', async () => {
      const body = envelope('payment_intent.succeeded', { id: 'pi_1' });

      await expect(deliver(body, signed(body), 'stripe')).rejects.toMatchObject({ status: 404 });
      await expect(deliver(body, signed(body), 'MOCK')).resolves.toEqual({ received: true });
    });
  });

  describe('signature, size and shape: uniform refusals', () => {
    it('accepts a valid signed event', async () => {
      await expect(deliver(envelope('payment_intent.succeeded', { id: 'pi_1' }))).resolves.toEqual({ received: true });
    });

    it('answers 401 for a wrong secret and applies nothing', async () => {
      const body = envelope('payment_intent.succeeded', { id: 'pi_1' });

      await expect(deliver(body, signed(body, 'whsec_someone_elses_secret_value_1'))).rejects.toMatchObject({ status: 401, response: { code: 'WEBHOOK_SIGNATURE_INVALID' } });
      expect(register).not.toHaveBeenCalled();
      expect(clientQuery).not.toHaveBeenCalled();
    });

    it('answers 401 for a tampered body', async () => {
      const body = envelope('payment_intent.succeeded', { id: 'pi_1' });
      const headers = signed(body);

      await expect(deliver(Buffer.from(body.toString().replace('pi_1', 'pi_2')), headers)).rejects.toMatchObject({ status: 401 });
      expect(register).not.toHaveBeenCalled();
    });

    it('answers 401 for an old timestamp (replay) and for a missing signature', async () => {
      const body = envelope('payment_intent.succeeded', { id: 'pi_1' });

      await expect(deliver(body, signed(body, SECRET, Math.floor(Date.now() / 1000) - 3600))).rejects.toMatchObject({ status: 401 });
      await expect(deliver(body, {})).rejects.toMatchObject({ status: 401 });
      expect(register).not.toHaveBeenCalled();
    });

    it('gives every signature failure the SAME answer, so nothing leaks about why', async () => {
      const body = envelope('payment_intent.succeeded', { id: 'pi_1' });
      const answers: unknown[] = [];
      for (const headers of [{}, signed(body, 'whsec_someone_elses_secret_value_1'), signed(body, SECRET, 1), { 'stripe-signature': 'garbage' }]) {
        try {
          await deliver(body, headers);
        } catch (error: unknown) {
          answers.push((error as { getResponse(): unknown }).getResponse());
        }
      }

      expect(answers).toHaveLength(4);
      expect(new Set(answers.map((answer) => JSON.stringify(answer))).size).toBe(1);
    });

    it('answers 400 for a body that is signed but unreadable, and for no body, an empty body or an oversized one', async () => {
      const junk = Buffer.from('not json at all');
      await expect(deliver(junk)).rejects.toMatchObject({ status: 400, response: { code: 'WEBHOOK_INVALID' } });
      await expect(service.handle('mock', { rawBody: undefined, headers: {}, ip: undefined })).rejects.toMatchObject({ status: 400 });
      await expect(service.handle('mock', { rawBody: Buffer.alloc(0), headers: {}, ip: undefined })).rejects.toMatchObject({ status: 400 });
      const big = Buffer.alloc(WEBHOOK_BODY_LIMIT_BYTES + 1, 'a');
      await expect(deliver(big)).rejects.toMatchObject({ status: 400 });
      expect(register).not.toHaveBeenCalled();
    });

    it('checks the signature BEFORE it looks at the body: an unsigned junk body is a 401, not a 400', async () => {
      await expect(deliver(Buffer.from('junk'), {})).rejects.toMatchObject({ status: 401 });
    });

    it('never puts the secret or the signature in a log line', async () => {
      const body = envelope('payment_intent.succeeded', { id: 'pi_1' });
      const headers = signed(body, 'whsec_someone_elses_secret_value_1');

      await deliver(body, headers).catch((): undefined => undefined);

      const logged = JSON.stringify([...warnLog.mock.calls, ...errorLog.mock.calls]);
      expect(logged).not.toContain(SECRET);
      expect(logged).not.toContain('whsec_');
      expect(logged).not.toContain(headers['stripe-signature'] ?? 'x');
    });

    it('is rate limited per caller IP', async () => {
      hitWindowWithTtl.mockResolvedValue({ count: 301, ttlSeconds: 42 });

      await expect(deliver(envelope('payment_intent.succeeded', { id: 'pi_1' }))).rejects.toMatchObject({ status: 429 });
      expect(hitWindowWithTtl).toHaveBeenCalledWith('ratelimit:payment-webhook:203.0.113.9', 60);
      expect(register).not.toHaveBeenCalled();
    });
  });

  describe('idempotency', () => {
    it('acknowledges a duplicate event id without applying it again', async () => {
      register.mockResolvedValue({ outcome: 'duplicate', id: EVENT_ROW, status: 'processed', sameBody: true });

      await expect(deliver(envelope('payment_intent.succeeded', { id: 'pi_1' }, 'evt_dup'))).resolves.toEqual({ received: true, duplicate: true });

      expect(clientQuery).not.toHaveBeenCalled();
      expect(findByProviderRef).not.toHaveBeenCalled();
      expect(finish).not.toHaveBeenCalled();
    });

    it('registers the event BEFORE it applies anything', async () => {
      await deliver(envelope('payment_intent.succeeded', { id: 'pi_1' }));

      expect(register.mock.invocationCallOrder[0]).toBeLessThan(clientQuery.mock.invocationCallOrder[0] ?? 0);
      expect(register).toHaveBeenCalledWith(expect.objectContaining({ provider: 'mock', payloadSha256: expect.stringMatching(/^[0-9a-f]{64}$/) }));
    });

    it('warns when a known event id comes back with a different body, and still does not apply it', async () => {
      register.mockResolvedValue({ outcome: 'duplicate', id: EVENT_ROW, status: 'processed', sameBody: false });

      await deliver(envelope('payment_intent.succeeded', { id: 'pi_1' }, 'evt_dup'));

      expect(warnLog).toHaveBeenCalledWith(expect.stringContaining('DIFFERENT body'));
      expect(clientQuery).not.toHaveBeenCalled();
    });

    it('applies an event taken again after an earlier failure', async () => {
      register.mockResolvedValue({ outcome: 'retry', id: EVENT_ROW });

      await deliver(envelope('payment_intent.succeeded', { id: 'pi_1' }));

      expect(finish).toHaveBeenCalledWith(expect.anything(), EVENT_ROW, 'processed', null);
    });

    it('acknowledges success on a payment that already succeeded and changes nothing', async () => {
      lockById.mockResolvedValue(payment({ status: 'succeeded' }));

      await deliver(envelope('payment_intent.succeeded', { id: 'pi_1' }));

      expect(confirmPaidHold).not.toHaveBeenCalled();
      expect(markLateSucceeded).not.toHaveBeenCalled();
      expect(finish).toHaveBeenCalledWith(expect.anything(), EVENT_ROW, 'processed', 'already_succeeded');
    });
  });

  describe('unknown things are acknowledged, not errors', () => {
    it('ignores an event type we do not act on', async () => {
      await expect(deliver(envelope('customer.created', { id: 'cus_1' }))).resolves.toEqual({ received: true });

      expect(finish).toHaveBeenCalledWith(expect.anything(), EVENT_ROW, 'ignored', 'event_type_not_handled');
      expect(findByProviderRef).not.toHaveBeenCalled();
    });

    it('ignores a payment we never created', async () => {
      findByProviderRef.mockResolvedValue(null);

      await deliver(envelope('payment_intent.succeeded', { id: 'pi_unknown' }));

      expect(finish).toHaveBeenCalledWith(expect.anything(), EVENT_ROW, 'ignored', 'unknown_payment');
      expect(confirmPaidHold).not.toHaveBeenCalled();
    });
  });

  describe('payment succeeded, hold still valid', () => {
    it('confirms the hold, marks the payment paid, credits the booking and counts the discounts in ONE transaction', async () => {
      await deliver(envelope('payment_intent.succeeded', { id: 'pi_1' }));

      expect(statements()).toEqual(['BEGIN', 'SAVEPOINT webhook_settle', 'RELEASE SAVEPOINT webhook_settle', 'COMMIT']);
      expect(confirmPaidHold).toHaveBeenCalledWith(expect.anything(), HOLD);
      expect(markSucceeded).toHaveBeenCalledWith(expect.anything(), PAYMENT);
      expect(creditBooking).toHaveBeenCalledWith(expect.anything(), PAYMENT);
      expect(recordRedemptions).toHaveBeenCalledWith(expect.anything(), HOLD, PAYABLE.discounts);
      expect(finish.mock.invocationCallOrder[0]).toBeLessThan(clientQuery.mock.invocationCallOrder[clientQuery.mock.invocationCallOrder.length - 1] ?? 0);
      expect(recordLateRefund).not.toHaveBeenCalled();
      expect(deleteHoldTtl).toHaveBeenCalledWith(HOLD);
    });

    it('locks the payment row so two deliveries cannot both settle it', async () => {
      await deliver(envelope('payment_intent.succeeded', { id: 'pi_1' }));

      expect(lockById).toHaveBeenCalledWith(expect.anything(), PAYMENT);
    });

    it('still succeeds when the hold timer in Redis cannot be cleared', async () => {
      deleteHoldTtl.mockRejectedValue(new Error('redis down'));

      await expect(deliver(envelope('payment_intent.succeeded', { id: 'pi_1' }))).resolves.toEqual({ received: true });
    });

    it('applies a paid date change through the registered handler', async () => {
      lockById.mockResolvedValue(payment({ purpose: 'rebook', payload: { to: '2027-09-01' } }));

      await deliver(envelope('payment_intent.succeeded', { id: 'pi_1' }));

      expect(rebookSettle).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: PAYMENT, bookingId: HOLD, payload: { to: '2027-09-01' } }));
      expect(confirmPaidHold).not.toHaveBeenCalled();
      expect(recordLateRefund).not.toHaveBeenCalled();
    });
  });

  describe('LATE SUCCESS: the money is never kept silently', () => {
    it('refunds in full when the hold already expired before the payment arrived', async () => {
      getPayableHold.mockRejectedValue(expired());

      await deliver(envelope('payment_intent.succeeded', { id: 'pi_1' }));

      expect(confirmPaidHold).not.toHaveBeenCalled();
      expect(markLateSucceeded).toHaveBeenCalledWith(expect.anything(), PAYMENT);
      expect(recordLateRefund).toHaveBeenCalledWith(expect.anything(), {
        id: PAYMENT,
        organizationId: 'org',
        propertyId: 'prop',
        bookingId: HOLD,
        provider: 'mock',
        providerRef: 'pi_1',
        amountCents: 54000,
        currencyCode: 'EUR',
      });
      expect(finish).toHaveBeenCalledWith(expect.anything(), EVENT_ROW, 'processed', 'late_success:hold_expired');
    });

    it('creates the refund in the SAME transaction, and asks the provider only after it committed', async () => {
      getPayableHold.mockRejectedValue(expired());

      await deliver(envelope('payment_intent.succeeded', { id: 'pi_1' }));

      const commit = clientQuery.mock.invocationCallOrder[statements().indexOf('COMMIT')] ?? 0;
      expect(recordLateRefund.mock.invocationCallOrder[0]).toBeLessThan(commit);
      expect(settleLateRefund.mock.invocationCallOrder[0]).toBeGreaterThan(commit);
      expect(settleLateRefund).toHaveBeenCalledWith('refund-1', expect.objectContaining({ id: PAYMENT, amountCents: 54000 }));
    });

    it('logs an ERROR line and writes an audit entry with the facts (no values from the body)', async () => {
      getPayableHold.mockRejectedValue(expired());

      await deliver(envelope('payment_intent.succeeded', { id: 'pi_1', client_secret: 'pi_1_secret_xyz' }));

      expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('LATE PAYMENT SUCCESS'));
      expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('Automatic full refund refund-1 created'));
      expect(record).toHaveBeenCalledWith({
        organizationId: 'org',
        staffUserId: null,
        action: 'payment.late_success',
        targetType: 'payment',
        targetId: PAYMENT,
        metadata: {
          reason: 'hold_expired',
          refundId: 'refund-1',
          refundCreated: true,
          refundOutcome: 'succeeded',
          amountCents: 54000,
          currencyCode: 'EUR',
          provider: 'mock',
          bookingId: HOLD,
          source: 'webhook',
        },
      });
      expect(JSON.stringify(record.mock.calls)).not.toContain('secret');
    });

    it('refunds when our attempt had already been cancelled because the hold expired', async () => {
      lockById.mockResolvedValue(payment({ status: 'cancelled', failure_reason: 'hold_expired' }));

      await deliver(envelope('payment_intent.succeeded', { id: 'pi_1' }));

      expect(getPayableHold).not.toHaveBeenCalled();
      expect(markLateSucceeded).toHaveBeenCalled();
      expect(recordLateRefund).toHaveBeenCalled();
      expect(finish).toHaveBeenCalledWith(expect.anything(), EVENT_ROW, 'processed', 'late_success:hold_expired');
    });

    it('refunds when our attempt had already been recorded as failed', async () => {
      lockById.mockResolvedValue(payment({ status: 'failed', failure_reason: 'card_declined' }));

      await deliver(envelope('payment_intent.succeeded', { id: 'pi_1' }));

      expect(recordLateRefund).toHaveBeenCalled();
      expect(finish).toHaveBeenCalledWith(expect.anything(), EVENT_ROW, 'processed', 'late_success:attempt_had_failed');
    });

    it('refunds when the hold was released or cancelled meanwhile', async () => {
      getPayableHold.mockRejectedValue(new ConflictException({ message: 'no longer active', code: 'HOLD_NOT_ACTIVE' }));

      await deliver(envelope('payment_intent.succeeded', { id: 'pi_1' }));

      expect(finish).toHaveBeenCalledWith(expect.anything(), EVENT_ROW, 'processed', 'late_success:hold_not_active');
    });

    it('refunds when the hold expired between the check and the confirmation, undoing the attempt first', async () => {
      confirmPaidHold.mockRejectedValue(expired());

      await deliver(envelope('payment_intent.succeeded', { id: 'pi_1' }));

      expect(statements()).toEqual(['BEGIN', 'SAVEPOINT webhook_settle', 'ROLLBACK TO SAVEPOINT webhook_settle', 'COMMIT']);
      expect(creditBooking).not.toHaveBeenCalled();
      expect(recordRedemptions).not.toHaveBeenCalled();
      expect(recordLateRefund).toHaveBeenCalled();
      expect(deleteHoldTtl).not.toHaveBeenCalled();
    });

    it('refunds when the dates are no longer free (the database refuses the overlap)', async () => {
      confirmPaidHold.mockRejectedValue(Object.assign(new Error('conflicting key value violates exclusion constraint'), { code: '23P01' }));

      await deliver(envelope('payment_intent.succeeded', { id: 'pi_1' }));

      expect(statements()).toContain('ROLLBACK TO SAVEPOINT webhook_settle');
      expect(finish).toHaveBeenCalledWith(expect.anything(), EVENT_ROW, 'processed', 'late_success:dates_not_free');
    });

    it('refunds a paid date change that can no longer be applied (the new dates were taken)', async () => {
      lockById.mockResolvedValue(payment({ purpose: 'rebook', payload: { to: '2027-09-01' } }));
      rebookSettle.mockRejectedValue(new ConflictException({ message: 'taken', code: 'DATES_UNAVAILABLE' }));

      await deliver(envelope('payment_intent.succeeded', { id: 'pi_1' }));

      expect(statements()).toContain('ROLLBACK TO SAVEPOINT webhook_settle');
      expect(recordLateRefund).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: PAYMENT }));
      expect(finish).toHaveBeenCalledWith(expect.anything(), EVENT_ROW, 'processed', 'late_success:dates_unavailable');
    });

    it('says so loudly when a late-payment refund already exists for the booking: no silent keep, staff must act', async () => {
      getPayableHold.mockRejectedValue(expired());
      recordLateRefund.mockResolvedValue(null);

      await deliver(envelope('payment_intent.succeeded', { id: 'pi_1' }));

      expect(settleLateRefund).not.toHaveBeenCalled();
      expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('STAFF MUST REFUND IT BY HAND'));
      expect(record).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ refundCreated: false, refundId: null }) }));
    });

    it('records a refund the provider could not take as pending or failed, in the audit entry', async () => {
      getPayableHold.mockRejectedValue(expired());
      settleLateRefund.mockResolvedValue('failed');

      await deliver(envelope('payment_intent.succeeded', { id: 'pi_1' }));

      expect(record).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ refundOutcome: 'failed' }) }));
    });

    it('does not fail the delivery when the provider call or the audit write fails afterwards (the reconciler repeats the refund)', async () => {
      getPayableHold.mockRejectedValue(expired());
      settleLateRefund.mockRejectedValue(new Error('provider down'));

      await expect(deliver(envelope('payment_intent.succeeded', { id: 'pi_1' }))).resolves.toEqual({ received: true });

      expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('a follow-up step failed'));
    });
  });

  describe('payment failed or cancelled', () => {
    it('ends the open attempt with the provider\'s code and gives the dates back', async () => {
      await deliver(envelope('payment_intent.payment_failed', { id: 'pi_1', last_payment_error: { code: 'card_declined' } }));

      expect(markEndedIn).toHaveBeenCalledWith(expect.anything(), PAYMENT, 'failed', 'card_declined');
      expect(releaseHold).toHaveBeenCalledWith(HOLD);
      expect(finish).toHaveBeenCalledWith(expect.anything(), EVENT_ROW, 'processed', null);
    });

    it('ends a cancelled attempt as cancelled', async () => {
      await deliver(envelope('payment_intent.canceled', { id: 'pi_1' }));

      expect(markEndedIn).toHaveBeenCalledWith(expect.anything(), PAYMENT, 'cancelled', 'cancelled_by_provider');
    });

    it('leaves a failed balance payment\'s booking alone', async () => {
      lockById.mockResolvedValue(payment({ purpose: 'rebook' }));

      await deliver(envelope('payment_intent.payment_failed', { id: 'pi_1' }));

      expect(markEndedIn).toHaveBeenCalled();
      expect(releaseHold).not.toHaveBeenCalled();
    });

    it('never moves a succeeded payment back: it only warns', async () => {
      lockById.mockResolvedValue(payment({ status: 'succeeded' }));

      await deliver(envelope('payment_intent.payment_failed', { id: 'pi_1' }));

      expect(markEndedIn).not.toHaveBeenCalled();
      expect(releaseHold).not.toHaveBeenCalled();
      expect(warnLog).toHaveBeenCalledWith(expect.stringContaining('recorded as succeeded'));
      expect(finish).toHaveBeenCalledWith(expect.anything(), EVENT_ROW, 'processed', 'no_open_attempt:succeeded');
    });

    it('ignores a failure for a payment we do not know', async () => {
      findByProviderRef.mockResolvedValue(null);

      await deliver(envelope('payment_intent.payment_failed', { id: 'pi_x' }));

      expect(finish).toHaveBeenCalledWith(expect.anything(), EVENT_ROW, 'ignored', 'unknown_payment');
    });
  });

  describe('refund updates', () => {
    it('settles our refund from the provider\'s word, in the transaction that finishes the event', async () => {
      await deliver(envelope('refund.updated', { id: 're_1', status: 'succeeded' }));

      expect(applyRefundUpdate).toHaveBeenCalledWith(expect.anything(), { providerRefundId: 're_1', refundId: null, status: 'succeeded', failureReason: null });
      expect(statements()).toEqual(['BEGIN', 'COMMIT']);
      expect(finish).toHaveBeenCalledWith(expect.anything(), EVENT_ROW, 'processed', null);
    });

    it('ignores a refund we never made', async () => {
      applyRefundUpdate.mockResolvedValue('unknown_refund');

      await deliver(envelope('refund.updated', { id: 're_x', status: 'succeeded' }));

      expect(finish).toHaveBeenCalledWith(expect.anything(), EVENT_ROW, 'ignored', 'unknown_refund');
    });

    it('flags, but does not change, a "failed" for a refund we recorded as paid', async () => {
      applyRefundUpdate.mockResolvedValue('conflict');

      await deliver(envelope('refund.updated', { id: 're_1', status: 'failed' }));

      expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('already paid'));
      expect(finish).toHaveBeenCalledWith(expect.anything(), EVENT_ROW, 'processed', 'conflict_refund_already_paid');
    });

    it('is harmless when repeated: an unchanged refund is just acknowledged', async () => {
      applyRefundUpdate.mockResolvedValue('unchanged');

      await deliver(envelope('refund.updated', { id: 're_1', status: 'succeeded' }));

      expect(finish).toHaveBeenCalledWith(expect.anything(), EVENT_ROW, 'processed', 'unchanged');
    });
  });

  describe('a processing failure', () => {
    it('rolls everything back, marks the event failed with a short code and lets the provider retry (generic 500, no reason)', async () => {
      confirmPaidHold.mockRejectedValue(new Error('connection to server lost: SELECT secret FROM x'));

      await expect(deliver(envelope('payment_intent.succeeded', { id: 'pi_1' }))).rejects.toThrow('connection to server lost');

      expect(statements()).toEqual(['BEGIN', 'SAVEPOINT webhook_settle', 'ROLLBACK']);
      expect(markFailed).toHaveBeenCalledWith(EVENT_ROW, 'processing_error');
      expect(finish).not.toHaveBeenCalled();
      expect(record).not.toHaveBeenCalled();
    });

    it('still rethrows when even marking the event failed fails', async () => {
      confirmPaidHold.mockRejectedValue(new Error('boom'));
      markFailed.mockRejectedValue(new Error('db gone'));

      await expect(deliver(envelope('payment_intent.succeeded', { id: 'pi_1' }))).rejects.toThrow('boom');
    });
  });
});
