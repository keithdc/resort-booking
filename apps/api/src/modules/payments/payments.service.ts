/**
 * @file apps/api/src/modules/payments/payments.service.ts
 * @feature payments
 * @dependencies PaymentProvider, PaymentsRepository, InventoryService, DiscountsService
 */

import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  MockPaymentOutcome,
  MockPaymentResult,
  PaymentSummary,
  ReservationConfirmation,
} from '@resort-booking/shared-types';
import { DatabaseService } from '../../shared/database/database.service';
import { RedisService } from '../../shared/redis/redis.service';
import { DiscountsService } from '../discounts/discounts.service';
import { InventoryService } from '../inventory/inventory.service';
import { PAYMENT_PROVIDER, type PaymentProvider, type RefundRequest, type RefundResult } from './payment-provider';
import { PaymentsRepository, type PaymentRow } from './payments.repository';

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
  ) {}

  /**
   * Which provider is active, and whether it moves real money. Refund rows record this.
   */
  public describeProvider(): { name: string; simulated: boolean } {
    return { name: this.provider.name, simulated: this.provider.simulated };
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
   * Test-mode "pay" button: settles a payment as the provider would. Only exists with the mock
   * provider; with a real one this is a 404.
   *
   * Success confirms the stay, records the payment, and counts discount use in ONE transaction.
   * Failure marks the payment failed and gives the dates back. Repeating a success is harmless.
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
        return { payment: this.summary(payment), confirmation: await this.inventory.getConfirmation(payment.inventory_block_id) };
      }
      throw this.alreadySettled();
    }
    if (payment.status !== 'requires_payment') {
      throw this.alreadySettled();
    }

    if (outcome === 'failure') {
      const failed = await this.payments.markEnded(paymentId, 'failed', 'card_declined');
      await this.inventory.releaseHold(payment.inventory_block_id);
      return { payment: this.summary(failed ?? { ...payment, status: 'failed' }), confirmation: null };
    }
    return this.settleSuccess(payment);
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
    return { payment: this.summary({ ...payment, status: 'succeeded' }), confirmation };
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

function isHoldExpired(error: ConflictException): boolean {
  const body = error.getResponse();
  return typeof body === 'object' && body !== null && 'code' in body && body.code === 'HOLD_EXPIRED';
}
