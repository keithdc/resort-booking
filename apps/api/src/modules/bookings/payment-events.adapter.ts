/**
 * @file apps/api/src/modules/bookings/payment-events.adapter.ts
 * @feature bookings
 * @dependencies BookingsRepository, StaffRefundsRepository, RefundIssuer, PaymentEventsRegistry
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  PaymentEventsRegistry,
  type LatePayment,
  type PaymentEventsPort,
  type RefundUpdate,
  type RefundUpdateResult,
} from '../payments/payment-events';
import { BookingsRepository } from './bookings.repository';
import { RefundIssuer, type RefundPlan } from './refund-issuer';
import { StaffRefundsRepository } from './staff-refunds.repository';

const LATE_REFUND_REASON = 'Automatic refund: the payment arrived after the held dates were released or were no longer free';

/**
 * The booking side of the payment webhooks: refunds a payment that arrived too late through the normal refund path, and
 * settles refunds when the provider reports them. Registered with the payment module on start-up, which keeps payments
 * from importing bookings.
 */
@Injectable()
export class PaymentEventsAdapter implements PaymentEventsPort, OnModuleInit {
  public constructor(
    private readonly bookings: BookingsRepository,
    private readonly refunds: StaffRefundsRepository,
    private readonly issuer: RefundIssuer,
    private readonly registry: PaymentEventsRegistry,
  ) {}

  public onModuleInit(): void {
    this.registry.register(this);
  }

  public recordLateRefund(client: PoolClient, payment: LatePayment): Promise<string | null> {
    // Pending, online, full amount: it holds the processing lease from the insert, like any other online refund.
    // `staff` with no staff member: nobody asked for it, the system did (the reason code says so).
    return this.bookings.insertRefund(client, {
      organizationId: payment.organizationId,
      propertyId: payment.propertyId,
      bookingId: payment.bookingId,
      paymentId: payment.id,
      provider: payment.provider,
      amountCents: payment.amountCents,
      percent: 100,
      currencyCode: payment.currencyCode,
      status: 'pending',
      reason: LATE_REFUND_REASON,
      kind: 'late_payment',
      reasonCode: 'late_payment',
      initiatedBy: 'staff',
      createdByStaffId: null,
    });
  }

  public settleLateRefund(refundId: string, payment: LatePayment): Promise<'succeeded' | 'failed' | 'pending'> {
    const plan: RefundPlan = {
      amountCents: payment.amountCents,
      percent: 100,
      currencyCode: payment.currencyCode,
      paymentId: payment.id,
      provider: payment.provider,
      status: 'pending',
      viaProvider: true,
      reason: LATE_REFUND_REASON,
      chunks: [{ paymentId: payment.id, providerRef: payment.providerRef, provider: payment.provider, amountCents: payment.amountCents }],
      keyGeneration: 1,
    };
    return this.issuer.settle(refundId, payment.bookingId, plan);
  }

  public async applyRefundUpdate(client: PoolClient, update: RefundUpdate): Promise<RefundUpdateResult> {
    const refund = await this.refunds.lockByProviderRefund(client, update.providerRefundId, update.refundId);
    if (refund === null) {
      return 'unknown_refund';
    }
    if (update.status === 'pending') {
      return 'unchanged';
    }
    if (refund.status === 'succeeded') {
      // A repeated success is harmless; a "failed" for money we recorded as paid is a conflict for a person to look at.
      return update.status === 'succeeded' ? 'unchanged' : 'conflict';
    }
    const changed = await this.refunds.settleFromProvider(client, refund.id, update.status, update.providerRefundId, update.failureReason);
    return changed ? 'settled' : 'unchanged';
  }
}
