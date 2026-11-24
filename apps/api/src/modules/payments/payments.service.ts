/**
 * @file apps/api/src/modules/payments/payments.service.ts
 * @feature payments
 * @dependencies PaymentProvider, PaymentsRepository, InventoryService, DiscountsService, PaymentSettlementRegistry
 */

import { isDeepStrictEqual } from 'node:util';
import { ConflictException, HttpException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  MockPaymentOutcome,
  MockPaymentResult,
  PaymentSummary,
  ReservationConfirmation,
} from '@resort-booking/shared-types';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../shared/database/database.service';
import { RedisService } from '../../shared/redis/redis.service';
import { DiscountsService } from '../discounts/discounts.service';
import { InventoryService } from '../inventory/inventory.service';
import { PAYMENT_PROVIDER, type PaymentProvider, type RefundRequest, type RefundResult } from './payment-provider';
import { PaymentSettlementRegistry, type SettlingPayment } from './payment-settlement';
import { PaymentsRepository, type InsertManualPaymentInput, type PaymentRow } from './payments.repository';

interface PgErrorLike {
  code?: string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  public constructor(
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly payments: PaymentsRepository,
    private readonly inventory: InventoryService,
    private readonly discounts: DiscountsService,
    private readonly database: DatabaseService,
    private readonly redis: RedisService,
    private readonly settlements: PaymentSettlementRegistry,
  ) {}

  /**
   * Which provider is active, and whether it moves real money. Refund rows record this.
   */
  public describeProvider(): { name: string; simulated: boolean } {
    return { name: this.provider.name, simulated: this.provider.simulated };
  }

  /**
   * Records a payment the guest made outside the system, confirmed by staff, inside the caller's
   * transaction. It is a real payment on the booking from then on (it counts toward what was paid).
   */
  public recordManualPayment(client: PoolClient, input: InsertManualPaymentInput): Promise<string> {
    return this.payments.insertSucceededManual(client, input);
  }

  /**
   * Gives money back on a succeeded payment through the active provider. Throws if it refuses.
   */
  public issueRefund(request: RefundRequest): Promise<RefundResult> {
    return this.provider.refund(request);
  }

  /**
   * Starts paying for a card hold. Repeating the call returns the same open payment, so a double
   * tap never starts two charges. Refuses holds that ended or timed out: nobody is charged for
   * dates they no longer hold.
   */
  public async startPayment(holdId: string): Promise<PaymentSummary> {
    const hold = await this.inventory.getPayableHold(holdId);
    if (hold.paymentMethod !== 'card') {
      throw new ConflictException({
        message: 'Bank transfers are confirmed by the operator once the money arrives.',
        code: 'PAYMENT_METHOD_UNSUPPORTED',
      });
    }
    const open = await this.payments.findOpenForHold(holdId);
    if (open !== null) {
      return this.summary(open);
    }
    const intent = await this.provider.createIntent({
      holdId,
      amountCents: hold.totalCents,
      currencyCode: hold.currencyCode,
      description: `Booking ${holdId}`,
    });
    try {
      const row = await this.payments.insert({
        organizationId: hold.organizationId,
        propertyId: hold.propertyId,
        holdId,
        provider: this.provider.name,
        providerRef: intent.providerRef,
        amountCents: hold.totalCents,
        currencyCode: hold.currencyCode,
      });
      return this.summary(row);
    } catch (error: unknown) {
      // Two requests raced; the unique index let only one in. Return the winner.
      if (isUniqueViolation(error)) {
        const winner = await this.payments.findOpenForHold(holdId);
        if (winner !== null) {
          return this.summary(winner);
        }
      }
      throw error;
    }
  }

  /**
   * Opens the payment for the balance of a date change (the guest owes more for the new dates).
   * Nothing changes on the booking until it succeeds. Asking again for the same change returns the same
   * open payment; asking for a different change cancels the old attempt first (one open payment per booking).
   */
  public async openRebookPayment(input: OpenRebookPaymentInput): Promise<PaymentSummary> {
    const open = await this.payments.findOpenForHold(input.bookingId);
    if (open !== null) {
      if (open.purpose === 'rebook' && open.amount_cents === input.amountCents && isDeepStrictEqual(open.payload, input.payload)) {
        return this.summary(open);
      }
      await this.payments.markEnded(open.id, 'cancelled', 'superseded');
    }
    const intent = await this.provider.createIntent({
      holdId: input.bookingId,
      amountCents: input.amountCents,
      currencyCode: input.currencyCode,
      description: `Date change for booking ${input.bookingId}`,
    });
    try {
      const row = await this.payments.insert({
        organizationId: input.organizationId,
        propertyId: input.propertyId,
        holdId: input.bookingId,
        provider: this.provider.name,
        providerRef: intent.providerRef,
        amountCents: input.amountCents,
        currencyCode: input.currencyCode,
        purpose: 'rebook',
        payload: input.payload,
      });
      return this.summary(row);
    } catch (error: unknown) {
      // Two requests raced; the unique index let only one in. Return the winner.
      if (isUniqueViolation(error)) {
        const winner = await this.payments.findOpenForHold(input.bookingId);
        if (winner !== null) {
          return this.summary(winner);
        }
      }
      throw error;
    }
  }

  /**
   * Test-mode "pay" button: settles a payment as the provider would. Only exists with the mock
   * provider; with a real one this is a 404.
   *
   * Success confirms the stay (or applies the date change the payment was for), records the payment,
   * and counts discount use in ONE transaction. Failure marks the payment failed and gives the dates
   * back (a failed date-change payment leaves the booking exactly as it was). Repeating a success is harmless.
   */
  public async completeMock(paymentId: string, outcome: MockPaymentOutcome): Promise<MockPaymentResult> {
    if (!this.provider.simulated) {
      throw new NotFoundException({ message: 'Not found', code: 'MOCK_PAYMENTS_DISABLED' });
    }
    const payment = await this.payments.getById(paymentId);
    if (payment === null) {
      throw new NotFoundException({ message: 'Payment not found', code: 'PAYMENT_NOT_FOUND' });
    }

    if (payment.status === 'succeeded') {
      if (outcome === 'success') {
        return this.alreadySucceeded(payment);
      }
      throw this.alreadySettled();
    }
    if (payment.status !== 'requires_payment') {
      throw this.alreadySettled();
    }

    if (outcome === 'failure') {
      const failed = await this.payments.markEnded(paymentId, 'failed', 'card_declined');
      if (payment.purpose === 'booking') {
        // Only a booking payment holds dates. A failed balance payment leaves the guest's booking alone.
        await this.inventory.releaseHold(payment.inventory_block_id);
      }
      return { payment: this.summary(failed ?? { ...payment, status: 'failed' }), confirmation: null, rebookedBooking: null };
    }
    return payment.purpose === 'rebook' ? this.settleRebook(payment) : this.settleSuccess(payment);
  }

  // --- Helpers ---

  private async settleSuccess(payment: PaymentRow): Promise<MockPaymentResult> {
    const holdId = payment.inventory_block_id;
    let discounts;
    try {
      discounts = (await this.inventory.getPayableHold(holdId)).discounts;
    } catch (error: unknown) {
      // The hold ended while the guest was paying: the attempt is cancelled and nothing is confirmed.
      await this.payments.markEnded(payment.id, 'cancelled', 'hold_expired');
      throw error;
    }

    let confirmation: ReservationConfirmation;
    try {
      confirmation = await this.database.withClient(async (client): Promise<ReservationConfirmation> => {
        await client.query('BEGIN');
        try {
          const confirmed = await this.inventory.confirmPaidHold(client, holdId);
          if (!(await this.payments.markSucceeded(client, payment.id))) {
            throw this.alreadySettled();
          }
          await this.payments.creditBooking(client, payment.id);
          await this.discounts.recordRedemptions(client, holdId, discounts);
          await client.query('COMMIT');
          return confirmed;
        } catch (error: unknown) {
          await client.query('ROLLBACK');
          throw error;
        }
      });
    } catch (error: unknown) {
      if (error instanceof ConflictException && isHoldExpired(error)) {
        await this.payments.markEnded(payment.id, 'cancelled', 'hold_expired');
      }
      throw error;
    }

    try {
      await this.redis.deleteHoldTtl(holdId);
    } catch {
      // The Redis key only mirrors the hold timer and expires by itself; the database is the truth.
      this.logger.warn(`Could not clear the hold timer for ${holdId}`);
    }
    return { payment: this.summary({ ...payment, status: 'succeeded' }), confirmation, rebookedBooking: null };
  }

  /**
   * A balance payment succeeded: apply the date change it was for, in ONE transaction with marking it paid.
   * If the change is refused (the new dates were taken meanwhile, the booking was cancelled) everything
   * rolls back and the payment is cancelled, not charged. A real provider would also need to refund here.
   */
  private async settleRebook(payment: PaymentRow): Promise<MockPaymentResult> {
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
    try {
      await this.database.withClient(async (client): Promise<void> => {
        await client.query('BEGIN');
        try {
          if (!(await this.payments.markSucceeded(client, payment.id))) {
            throw this.alreadySettled();
          }
          await handler.settle(client, settling);
          await client.query('COMMIT');
        } catch (error: unknown) {
          await client.query('ROLLBACK');
          throw error;
        }
      });
    } catch (error: unknown) {
      if (error instanceof HttpException && error.getStatus() < 500 && !isAlreadySettled(error)) {
        // The change was refused for a reason that will not go away: the attempt ends, nobody is charged.
        await this.payments.markEnded(payment.id, 'cancelled', refusalReason(error));
      }
      throw error;
    }
    return {
      payment: this.summary({ ...payment, status: 'succeeded' }),
      confirmation: null,
      rebookedBooking: await handler.presentSettled(payment.id),
    };
  }

  /**
   * The same success reported again: nothing is applied twice, the guest just gets the same result.
   */
  private async alreadySucceeded(payment: PaymentRow): Promise<MockPaymentResult> {
    if (payment.purpose === 'rebook') {
      const handler = this.settlements.find('rebook');
      return {
        payment: this.summary(payment),
        confirmation: null,
        rebookedBooking: handler === null ? null : await handler.presentSettled(payment.id),
      };
    }
    return {
      payment: this.summary(payment),
      confirmation: await this.inventory.getConfirmation(payment.inventory_block_id),
      rebookedBooking: null,
    };
  }

  private summary(row: Pick<PaymentRow, 'id' | 'inventory_block_id' | 'provider' | 'status' | 'amount_cents' | 'currency_code'>): PaymentSummary {
    return {
      id: row.id,
      holdId: row.inventory_block_id,
      provider: row.provider,
      status: row.status,
      amountCents: row.amount_cents,
      currencyCode: row.currency_code,
      simulated: this.provider.simulated,
    };
  }

  private alreadySettled(): ConflictException {
    return new ConflictException({ message: 'This payment was already settled', code: 'PAYMENT_ALREADY_SETTLED' });
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as PgErrorLike).code === '23505';
}

/** What openRebookPayment needs to open a balance payment. */
export interface OpenRebookPaymentInput {
  /** The booking whose dates are changing. */
  bookingId: string;
  organizationId: string;
  propertyId: string;
  amountCents: number;
  currencyCode: string;
  /** The change the guest agreed to, kept with the payment until it settles. */
  payload: object;
}

function isAlreadySettled(error: HttpException): boolean {
  return responseCode(error) === 'PAYMENT_ALREADY_SETTLED';
}

function responseCode(error: HttpException): string | null {
  const body = error.getResponse();
  return typeof body === 'object' && body !== null && 'code' in body && typeof body.code === 'string' ? body.code : null;
}

/** The refusal's code, lower case, as the reason saved on the cancelled payment. */
function refusalReason(error: HttpException): string {
  return (responseCode(error) ?? 'change_refused').toLowerCase();
}

function isHoldExpired(error: ConflictException): boolean {
  const body = error.getResponse();
  return typeof body === 'object' && body !== null && 'code' in body && body.code === 'HOLD_EXPIRED';
}
