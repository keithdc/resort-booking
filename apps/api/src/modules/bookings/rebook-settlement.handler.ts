/**
 * @file apps/api/src/modules/bookings/rebook-settlement.handler.ts
 * @feature bookings
 * @dependencies RebookService, PaymentSettlementRegistry
 */

import { Injectable, OnModuleInit } from '@nestjs/common';
import type { GuestBooking } from '@resort-booking/shared-types';
import type { PoolClient } from 'pg';
import {
  PaymentSettlementRegistry,
  type PaymentPurpose,
  type PaymentSettlementHandler,
  type SettlingPayment,
} from '../payments/payment-settlement';
import { RebookService } from './rebook.service';

/**
 * Tells the payment service what to do when a date-change balance payment succeeds: apply the change.
 * Registered with the payment service on start-up, which keeps payments from importing bookings.
 */
@Injectable()
export class RebookSettlementHandler implements PaymentSettlementHandler, OnModuleInit {
  public readonly purpose: PaymentPurpose = 'rebook';

  public constructor(
    private readonly rebooks: RebookService,
    private readonly registry: PaymentSettlementRegistry,
  ) {}

  public onModuleInit(): void {
    this.registry.register(this);
  }

  public settle(client: PoolClient, payment: SettlingPayment): Promise<void> {
    return this.rebooks.applySettledChange(client, payment);
  }

  public presentSettled(paymentId: string): Promise<GuestBooking | null> {
    return this.rebooks.presentSettled(paymentId);
  }
}
