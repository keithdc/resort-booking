/**
 * @file apps/api/src/modules/payments/payments.repository.ts
 * @feature payments
 * @dependencies DatabaseService
 */

import { Injectable } from '@nestjs/common';
import type { PaymentStatus } from '@resort-booking/shared-types';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../shared/database/database.service';

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
}

export interface InsertPaymentInput {
  organizationId: string;
  propertyId: string;
  holdId: string;
  provider: string;
  providerRef: string;
  amountCents: number;
  currencyCode: string;
}

const COLUMNS = `id, organization_id, property_id, inventory_block_id, provider, provider_ref,
  amount_cents, currency_code, status, failure_reason`;

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
   * Starts a payment attempt. A unique index allows only one open attempt per hold, so two taps
   * cannot start two charges (the caller handles the 23505 by reading the open one).
   */
  public async insert(input: InsertPaymentInput): Promise<PaymentRow> {
    const result = await this.database.query<PaymentRow>(
      `
      INSERT INTO payments (
        organization_id, property_id, inventory_block_id, provider, provider_ref,
        amount_cents, currency_code, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'requires_payment')
      RETURNING ${COLUMNS}
      `,
      [input.organizationId, input.propertyId, input.holdId, input.provider, input.providerRef, input.amountCents, input.currencyCode],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error('Payment insert returned no row');
    }
    return row;
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
