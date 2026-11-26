/**
 * @file apps/api/src/modules/payments/payments.repository.ts
 * @feature payments
 * @dependencies DatabaseService
 */

import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { PaymentStatus } from '@resort-booking/shared-types';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../shared/database/database.service';
import type { PaymentPurpose } from './payment-settlement';

export interface PaymentRow {
  id: string;
  organization_id: string;
  property_id: string;
  inventory_block_id: string;
  provider: string;
  provider_ref: string;
  amount_cents: number;
  currency_code: string;
  status: PaymentStatus;
  failure_reason: string | null;
  purpose: PaymentPurpose;
  /** The change the guest agreed to pay for (balance payments), until it settles. */
  payload: unknown;
}

export interface InsertManualPaymentInput {
  bookingId: string;
  organizationId: string;
  propertyId: string;
  amountCents: number;
  currencyCode: string;
}

export interface InsertPaymentInput {
  organizationId: string;
  propertyId: string;
  holdId: string;
  provider: string;
  providerRef: string;
  amountCents: number;
  currencyCode: string;
  /** Defaults to a payment for the booking itself. */
  purpose?: PaymentPurpose;
  payload?: object;
}

const COLUMNS = `id, organization_id, property_id, inventory_block_id, provider, provider_ref,
  amount_cents, currency_code, status, failure_reason, purpose, payload`;

@Injectable()
export class PaymentsRepository {
  public constructor(private readonly database: DatabaseService) {}

  /**
   * The payment attempt still waiting for the guest on a hold, if any.
   */
  public async findOpenForHold(holdId: string): Promise<PaymentRow | null> {
    const result = await this.database.query<PaymentRow>(
      `SELECT ${COLUMNS} FROM payments WHERE inventory_block_id = $1 AND status = 'requires_payment'`,
      [holdId],
    );
    return result.rows[0] ?? null;
  }

  /**
   * One payment by id.
   */
  public async getById(paymentId: string): Promise<PaymentRow | null> {
    const result = await this.database.query<PaymentRow>(`SELECT ${COLUMNS} FROM payments WHERE id = $1`, [paymentId]);
    return result.rows[0] ?? null;
  }

  /**
   * The payment a provider event is about, by the provider's own reference. Null when we never created it.
   */
  public async findByProviderRef(provider: string, providerRef: string): Promise<PaymentRow | null> {
    const result = await this.database.query<PaymentRow>(
      `SELECT ${COLUMNS} FROM payments WHERE provider = $1 AND provider_ref = $2`,
      [provider, providerRef],
    );
    return result.rows[0] ?? null;
  }

  /**
   * Re-reads a payment and locks it for the rest of the caller's transaction, so two deliveries (or a delivery and
   * the mock button) cannot both settle it.
   */
  public async lockById(client: PoolClient, paymentId: string): Promise<PaymentRow | null> {
    const result = await client.query<PaymentRow>(`SELECT ${COLUMNS} FROM payments WHERE id = $1 FOR UPDATE`, [paymentId]);
    return result.rows[0] ?? null;
  }

  /**
   * Starts a payment attempt. A unique index allows only one open attempt per hold, so two taps
   * cannot start two charges (the caller handles the 23505 by reading the open one).
   */
  public async insert(input: InsertPaymentInput): Promise<PaymentRow> {
    const result = await this.database.query<PaymentRow>(
      `
      INSERT INTO payments (
        organization_id, property_id, inventory_block_id, provider, provider_ref,
        amount_cents, currency_code, status, purpose, payload
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'requires_payment', $8, $9::jsonb)
      RETURNING ${COLUMNS}
      `,
      [
        input.organizationId,
        input.propertyId,
        input.holdId,
        input.provider,
        input.providerRef,
        input.amountCents,
        input.currencyCode,
        input.purpose ?? 'booking',
        input.payload === undefined ? null : JSON.stringify(input.payload),
      ],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error('Payment insert returned no row');
    }
    return row;
  }

  /**
   * Records money the guest paid OUTSIDE the system (cash or bank at the desk, confirmed by staff) as an
   * already-succeeded payment, inside the caller's transaction. Provider "manual": a refund against it can
   * only be done by hand, never through the card provider.
   */
  public async insertSucceededManual(client: PoolClient, input: InsertManualPaymentInput): Promise<string> {
    const result = await client.query<{ id: string }>(
      `
      INSERT INTO payments (
        organization_id, property_id, inventory_block_id, provider, provider_ref,
        amount_cents, currency_code, status, purpose
      ) VALUES ($1, $2, $3, 'manual', $4, $5, $6, 'succeeded', 'rebook')
      RETURNING id
      `,
      [input.organizationId, input.propertyId, input.bookingId, `manual_${randomUUID()}`, input.amountCents, input.currencyCode],
    );
    const id = result.rows[0]?.id;
    if (id === undefined) {
      throw new Error('Manual payment insert returned no row');
    }
    return id;
  }

  /**
   * Marks an open payment succeeded inside the caller's transaction. False if it was not open.
   */
  public async markSucceeded(client: PoolClient, paymentId: string): Promise<boolean> {
    const result = await client.query(
      `UPDATE payments SET status = 'succeeded', updated_at = now() WHERE id = $1 AND status = 'requires_payment'`,
      [paymentId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Adds a succeeded payment's amount to what has been paid for its booking, in the caller's transaction.
   */
  public async creditBooking(client: PoolClient, paymentId: string): Promise<void> {
    await client.query(
      `
      UPDATE inventory_blocks ib
      SET paid_cents = COALESCE(ib.paid_cents, 0) + p.amount_cents
      FROM payments p
      WHERE p.id = $1 AND ib.id = p.inventory_block_id
      `,
      [paymentId],
    );
  }

  /**
   * The provider reports a success for a payment our records had open, failed or cancelled and whose stay could not be
   * given to the guest: the money WAS taken. The payment becomes `succeeded` with the reason `late_success`, so reports
   * count the money in (the automatic refund counts it out). It is not credited to any booking. False if it was
   * already succeeded.
   */
  public async markLateSucceeded(client: PoolClient, paymentId: string): Promise<boolean> {
    const result = await client.query(
      `
      UPDATE payments SET status = 'succeeded', failure_reason = 'late_success', updated_at = now()
      WHERE id = $1 AND status IN ('requires_payment', 'failed', 'cancelled')
      `,
      [paymentId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Like markEnded, inside the caller's transaction (a webhook ends the attempt together with finishing its event).
   */
  public async markEndedIn(client: PoolClient, paymentId: string, status: 'failed' | 'cancelled', reason: string): Promise<boolean> {
    const result = await client.query(
      `UPDATE payments SET status = $2, failure_reason = $3, updated_at = now() WHERE id = $1 AND status = 'requires_payment'`,
      [paymentId, status, reason],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Marks an open payment failed or cancelled, with why. Returns the updated row, or null if it
   * was not open (already settled).
   */
  public async markEnded(paymentId: string, status: 'failed' | 'cancelled', reason: string): Promise<PaymentRow | null> {
    const result = await this.database.query<PaymentRow>(
      `
      UPDATE payments SET status = $2, failure_reason = $3, updated_at = now()
      WHERE id = $1 AND status = 'requires_payment'
      RETURNING ${COLUMNS}
      `,
      [paymentId, status, reason],
    );
    return result.rows[0] ?? null;
  }
}
