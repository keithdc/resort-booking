/**
 * @file apps/api/src/modules/payments/payment-webhook.service.ts
 * @feature payments
 * @dependencies PaymentProvider, WebhookVerifier, PaymentWebhookRepository, PaymentsRepository, InventoryService,
 *   DiscountsService, PaymentSettlementRegistry, PaymentEventsRegistry, AuditService
 */

import {
  BadRequestException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PoolClient } from 'pg';
import { AuditService } from '../../shared/audit/audit.service';
import { DatabaseService } from '../../shared/database/database.service';
import { enforceWindowLimit, limitSettingFromConfig, type LimitSetting } from '../../shared/redis/rate-limit';
import { RedisService } from '../../shared/redis/redis.service';
import { DiscountsService } from '../discounts/discounts.service';
import { InventoryService } from '../inventory/inventory.service';
import { PaymentEventsRegistry, type LatePayment } from './payment-events';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider';
import { PaymentSettlementRegistry, type SettlingPayment } from './payment-settlement';
import { PaymentWebhookRepository, type EventRegistration } from './payment-webhook.repository';
import { PaymentsRepository, type PaymentRow } from './payments.repository';
import { PAYMENT_WEBHOOK_VERIFIER } from './webhook-config';
import { parseWebhookEvent, payloadSha256, WebhookPayloadError, type NormalizedWebhookEvent, type ParsedWebhookEvent } from './webhook-event';
import { WebhookSignatureError, type WebhookVerifier } from './webhook-verifier';

/** Bodies larger than this are refused (the real events are a few kilobytes). Also enforced before parsing, in main.ts. */
export const WEBHOOK_BODY_LIMIT_BYTES = 64 * 1024;

export const WEBHOOK_LIMIT_DEFAULT: LimitSetting = { limit: 300, windowSeconds: 60 };

/** What the controller hands over: the exact bytes, the headers, the caller. */
export interface WebhookRequestInfo {
  rawBody: Buffer | undefined;
  headers: Readonly<Record<string, string | string[] | undefined>>;
  ip: string | undefined;
}

export interface WebhookAck {
  received: true;
  /** True when the event id had been handled before: acknowledged, nothing applied twice. */
  duplicate?: true;
}

type Applied = { status: 'processed' | 'ignored'; note: string | null };
type AfterCommit = () => Promise<void>;

interface PgErrorLike {
  code?: string;
}

/**
 * Receives payment events from the provider. In order: the provider must be the configured one (else 404, as if the
 * route did not exist); the caller is rate limited; the signature is checked against the RAW bytes (timing safe, with a
 * replay tolerance); the event id is written to a unique table BEFORE anything is applied; then the event is applied and
 * the event row finished in ONE transaction. A duplicate id is acknowledged without reprocessing.
 *
 * - payment succeeded: confirms the hold if it is still valid. If the hold ended, was cancelled or the dates are no
 *   longer free, the money is NEVER kept silently: the payment is recorded as a late success, an automatic full refund is
 *   created through the normal refund path, an ERROR line and an audit entry say so, and the refund shows in the staff queue.
 * - payment failed or cancelled: ends the attempt and gives the dates back.
 * - refund updated: settles our refund (never moving a paid one back).
 *
 * Refusals are uniform (400 for an unreadable body, 401 for a bad signature); the reason goes to the log only.
 */
@Injectable()
export class PaymentWebhookService {
  private readonly logger = new Logger(PaymentWebhookService.name);
  private readonly limit: LimitSetting;

  public constructor(
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @Inject(PAYMENT_WEBHOOK_VERIFIER) private readonly verifier: WebhookVerifier | null,
    config: ConfigService,
    private readonly events: PaymentWebhookRepository,
    private readonly payments: PaymentsRepository,
    private readonly inventory: InventoryService,
    private readonly discounts: DiscountsService,
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
    private readonly settlements: PaymentSettlementRegistry,
    private readonly bookingSide: PaymentEventsRegistry,
    private readonly audit: AuditService,
  ) {
    this.limit = limitSettingFromConfig(config, 'PAYMENT_WEBHOOK', WEBHOOK_LIMIT_DEFAULT);
  }

  /**
   * Handles one delivery. Throws 404 (not configured), 429, 400, 401, or 500 (a processing failure: the provider retries
   * and the event is taken again). Returns the acknowledgement for everything else.
   */
  public async handle(providerName: string, request: WebhookRequestInfo): Promise<WebhookAck> {
    const verifier = this.verifier;
    if (verifier === null || providerName.trim().toLowerCase() !== this.provider.name) {
      throw new NotFoundException({ message: 'Not found', code: 'NOT_FOUND' });
    }
    await enforceWindowLimit(this.redis, this.logger, {
      keyPrefix: 'ratelimit:payment-webhook:',
      callerId: request.ip,
      limit: this.limit.limit,
      windowSeconds: this.limit.windowSeconds,
      code: 'WEBHOOK_RATE_LIMITED',
      message: 'Too many requests. Slow down.',
    });

    const rawBody = request.rawBody;
    if (rawBody === undefined || rawBody.length === 0 || rawBody.length > WEBHOOK_BODY_LIMIT_BYTES) {
      this.logger.warn(`Webhook refused: ${rawBody === undefined ? 'no raw body' : `body of ${String(rawBody.length)} bytes`}`);
      throw this.invalid();
    }
    const header = request.headers[verifier.signatureHeader];
    try {
      verifier.verify(rawBody, Array.isArray(header) ? header[0] : header);
    } catch (error: unknown) {
      this.logger.warn(`Webhook refused: ${error instanceof WebhookSignatureError ? error.reason : 'signature check failed'}`);
      throw new UnauthorizedException({ message: 'Invalid webhook signature', code: 'WEBHOOK_SIGNATURE_INVALID' });
    }
    let parsed: ParsedWebhookEvent;
    try {
      parsed = parseWebhookEvent(rawBody);
    } catch (error: unknown) {
      this.logger.warn(`Webhook refused: ${error instanceof WebhookPayloadError ? error.message : 'unreadable body'}`);
      throw this.invalid();
    }

    const registration = await this.events.register({
      provider: this.provider.name,
      eventId: parsed.id,
      type: parsed.type,
      payloadSha256: payloadSha256(rawBody),
    });
    if (registration.outcome === 'duplicate') {
      this.noteDuplicate(parsed, registration);
      return { received: true, duplicate: true };
    }
    await this.processEvent(registration.id, parsed);
    return { received: true };
  }

  // --- Processing ---

  private async processEvent(eventRowId: string, parsed: ParsedWebhookEvent): Promise<void> {
    const after: AfterCommit[] = [];
    try {
      await this.database.withClient(async (client): Promise<void> => {
        await client.query('BEGIN');
        try {
          const applied = await this.apply(client, parsed.event, after);
          await this.events.finish(client, eventRowId, applied.status, applied.note);
          await client.query('COMMIT');
        } catch (error: unknown) {
          await client.query('ROLLBACK');
          throw error;
        }
      });
    } catch (error: unknown) {
      // Rolled back: nothing was applied. The row says "failed" so the provider's retry takes it again.
      await this.events.markFailed(eventRowId, 'processing_error').catch((): undefined => undefined);
      this.logger.error(`Webhook event ${parsed.id} (${parsed.type}) failed and will be retried by the provider: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
    for (const effect of after) {
      try {
        await effect();
      } catch (error: unknown) {
        // Committed already; what is left is housekeeping or the refund call, which the reconciler repeats.
        this.logger.error(`Webhook event ${parsed.id}: a follow-up step failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private apply(client: PoolClient, event: NormalizedWebhookEvent, after: AfterCommit[]): Promise<Applied> {
    switch (event.kind) {
      case 'payment_succeeded':
        return this.applyPaymentSucceeded(client, event.paymentRef, after);
      case 'payment_failed':
        return this.applyPaymentEnded(client, event, after);
      case 'refund_updated':
        return this.applyRefundUpdated(client, event);
      case 'ignored':
        return Promise.resolve({ status: 'ignored', note: 'event_type_not_handled' });
    }
  }

  private async applyPaymentSucceeded(client: PoolClient, paymentRef: string, after: AfterCommit[]): Promise<Applied> {
    const found = await this.payments.findByProviderRef(this.provider.name, paymentRef);
    if (found === null) {
      this.logger.warn('Webhook for a payment we never created: ignored');
      return { status: 'ignored', note: 'unknown_payment' };
    }
    const payment = await this.payments.lockById(client, found.id);
    if (payment === null) {
      return { status: 'ignored', note: 'unknown_payment' };
    }
    if (payment.status === 'succeeded') {
      return { status: 'processed', note: 'already_succeeded' };
    }
    const lateReason =
      payment.status === 'requires_payment'
        ? await this.trySettle(client, payment, after)
        : payment.status === 'failed'
          ? 'attempt_had_failed'
          : (payment.failure_reason ?? 'attempt_was_cancelled');
    if (lateReason === null) {
      return { status: 'processed', note: null };
    }

    // The provider took the money and we cannot give the guest the stay: record it, and give the money back.
    if (!(await this.payments.markLateSucceeded(client, payment.id))) {
      return { status: 'processed', note: 'already_succeeded' };
    }
    const late = latePaymentOf(payment);
    const refundId = await this.bookingSide.get().recordLateRefund(client, late);
    after.push((): Promise<void> => this.afterLateSuccess(late, refundId, lateReason));
    return { status: 'processed', note: `late_success:${lateReason}`.slice(0, 200) };
  }

  /**
   * Tries to give the guest what the payment was for. Returns null when it worked, or the reason it cannot be done
   * (hold ended or cancelled, dates taken, change refused). Everything the attempt wrote is undone before it returns a
   * reason, so the caller can record the late success in the same transaction.
   */
  private async trySettle(client: PoolClient, payment: PaymentRow, after: AfterCommit[]): Promise<string | null> {
    if (payment.purpose === 'rebook') {
      const handler = this.settlements.find('rebook');
      if (handler === null) {
        throw new Error('No settlement handler is registered for date-change payments');
      }
      const settling: SettlingPayment = {
        id: payment.id,
        bookingId: payment.inventory_block_id,
        amountCents: payment.amount_cents,
        currencyCode: payment.currency_code,
        payload: payment.payload,
      };
      return this.inSavepoint(client, async (): Promise<void> => {
        if (!(await this.payments.markSucceeded(client, payment.id))) {
          throw new HoldNotConfirmable('payment_not_open');
        }
        await handler.settle(client, settling);
      });
    }

    let discounts;
    try {
      discounts = (await this.inventory.getPayableHold(payment.inventory_block_id)).discounts;
    } catch (error: unknown) {
      if (error instanceof HttpException && error.getStatus() < 500) {
        return reasonOf(error);
      }
      throw error;
    }
    const reason = await this.inSavepoint(client, async (): Promise<void> => {
      await this.inventory.confirmPaidHold(client, payment.inventory_block_id);
      if (!(await this.payments.markSucceeded(client, payment.id))) {
        throw new HoldNotConfirmable('payment_not_open');
      }
      await this.payments.creditBooking(client, payment.id);
      await this.discounts.recordRedemptions(client, payment.inventory_block_id, discounts);
    });
    if (reason === null) {
      after.push(async (): Promise<void> => {
        try {
          await this.redis.deleteHoldTtl(payment.inventory_block_id);
        } catch {
          // The Redis key only mirrors the hold timer and expires by itself.
          this.logger.warn(`Could not clear the hold timer for ${payment.inventory_block_id}`);
        }
      });
    }
    return reason;
  }

  /**
   * Runs `work` inside a savepoint. A refusal (an HTTP error below 500, or the database's "dates taken" rules) rolls
   * back only the work and is returned as a reason; anything else is a real failure and propagates.
   */
  private async inSavepoint(client: PoolClient, work: () => Promise<void>): Promise<string | null> {
    await client.query('SAVEPOINT webhook_settle');
    try {
      await work();
      await client.query('RELEASE SAVEPOINT webhook_settle');
      return null;
    } catch (error: unknown) {
      const refusal = refusalOf(error);
      if (refusal === null) {
        throw error;
      }
      await client.query('ROLLBACK TO SAVEPOINT webhook_settle');
      return refusal;
    }
  }

  private async afterLateSuccess(late: LatePayment, refundId: string | null, reason: string): Promise<void> {
    let refundOutcome: string = 'none';
    if (refundId === null) {
      this.logger.error(
        `LATE PAYMENT SUCCESS: payment ${late.id} (${String(late.amountCents)} ${late.currencyCode}) for booking ${late.bookingId} succeeded at the provider but ${reason}. A late-payment refund already exists for this booking, so NO automatic refund was created: STAFF MUST REFUND IT BY HAND.`,
      );
    } else {
      this.logger.error(
        `LATE PAYMENT SUCCESS: payment ${late.id} (${String(late.amountCents)} ${late.currencyCode}) for booking ${late.bookingId} succeeded at the provider but ${reason}. Automatic full refund ${refundId} created; staff attention needed.`,
      );
      refundOutcome = await this.bookingSide.get().settleLateRefund(refundId, late);
    }
    await this.audit.record({
      organizationId: late.organizationId,
      staffUserId: null,
      action: 'payment.late_success',
      targetType: 'payment',
      targetId: late.id,
      metadata: {
        reason,
        refundId,
        refundCreated: refundId !== null,
        refundOutcome,
        amountCents: late.amountCents,
        currencyCode: late.currencyCode,
        provider: late.provider,
        bookingId: late.bookingId,
        source: 'webhook',
      },
    });
  }

  private async applyPaymentEnded(
    client: PoolClient,
    event: Extract<NormalizedWebhookEvent, { kind: 'payment_failed' }>,
    after: AfterCommit[],
  ): Promise<Applied> {
    const found = await this.payments.findByProviderRef(this.provider.name, event.paymentRef);
    if (found === null) {
      return { status: 'ignored', note: 'unknown_payment' };
    }
    const payment = await this.payments.lockById(client, found.id);
    if (payment === null) {
      return { status: 'ignored', note: 'unknown_payment' };
    }
    if (payment.status !== 'requires_payment') {
      if (payment.status === 'succeeded') {
        this.logger.warn(`Webhook says payment ${payment.id} failed but it is recorded as succeeded: left as it is`);
      }
      return { status: 'processed', note: `no_open_attempt:${payment.status}` };
    }
    await this.payments.markEndedIn(client, payment.id, event.cancelled ? 'cancelled' : 'failed', event.reason);
    if (payment.purpose === 'booking') {
      // Only a booking payment holds dates; a failed balance payment leaves the guest's booking alone.
      after.push((): Promise<void> => this.inventory.releaseHold(payment.inventory_block_id));
    }
    return { status: 'processed', note: null };
  }

  private async applyRefundUpdated(client: PoolClient, event: Extract<NormalizedWebhookEvent, { kind: 'refund_updated' }>): Promise<Applied> {
    const result = await this.bookingSide.get().applyRefundUpdate(client, {
      providerRefundId: event.providerRefundId,
      refundId: event.refundId,
      status: event.status,
      failureReason: event.failureReason,
    });
    if (result === 'unknown_refund') {
      this.logger.warn('Webhook for a refund we never created: ignored');
      return { status: 'ignored', note: 'unknown_refund' };
    }
    if (result === 'conflict') {
      this.logger.error(`Webhook says refund ${event.providerRefundId} is ${event.status} but our record says it is already paid: left as it is. Check the provider dashboard.`);
      return { status: 'processed', note: 'conflict_refund_already_paid' };
    }
    return { status: 'processed', note: result === 'unchanged' ? 'unchanged' : null };
  }

  private noteDuplicate(parsed: ParsedWebhookEvent, registration: Extract<EventRegistration, { outcome: 'duplicate' }>): void {
    if (!registration.sameBody) {
      this.logger.warn(`Webhook event ${parsed.id} arrived again with a DIFFERENT body: acknowledged and not applied`);
    }
  }

  private invalid(): BadRequestException {
    return new BadRequestException({ message: 'Invalid webhook', code: 'WEBHOOK_INVALID' });
  }
}

/** The hold or payment could not be settled for a reason that will not go away. */
class HoldNotConfirmable extends Error {
  public constructor(public readonly reason: string) {
    super(reason);
    this.name = 'HoldNotConfirmable';
  }
}

function latePaymentOf(payment: PaymentRow): LatePayment {
  return {
    id: payment.id,
    organizationId: payment.organization_id,
    propertyId: payment.property_id,
    bookingId: payment.inventory_block_id,
    provider: payment.provider,
    providerRef: payment.provider_ref,
    amountCents: payment.amount_cents,
    currencyCode: payment.currency_code,
  };
}

/** The HTTP refusal's code, lower case, as the short reason ("hold_expired"). */
function reasonOf(error: HttpException): string {
  const body = error.getResponse();
  const code = typeof body === 'object' && body !== null && 'code' in body && typeof body.code === 'string' ? body.code : 'change_refused';
  return code.toLowerCase().slice(0, 60);
}

/** The reason when `error` is a refusal that makes the payment a late one, else null (a real failure). */
function refusalOf(error: unknown): string | null {
  if (error instanceof HoldNotConfirmable) {
    return error.reason;
  }
  if (error instanceof HttpException && error.getStatus() < 500) {
    return reasonOf(error);
  }
  // The database's no-overlap rule: the dates were given to somebody else meanwhile.
  if (typeof error === 'object' && error !== null && (error as PgErrorLike).code === '23P01') {
    return 'dates_not_free';
  }
  return null;
}
