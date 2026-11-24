/**
 * @file apps/api/src/modules/bookings/staff-refunds.service.ts
 * @feature bookings
 * @dependencies StaffRefundsRepository, RefundIssuer, BookingsRepository, PaymentsService
 */

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { RefundStatus, StaffProfile, StaffRefund } from '@resort-booking/shared-types';
import { PaymentsService } from '../payments/payments.service';
import { allocateRefund } from './bookings.rules';
import { RefundIssuer, type RefundPlan } from './refund-issuer';
import { StaffRefundsRepository, type RefundActionRow } from './staff-refunds.repository';
import { BookingsRepository } from './bookings.repository';

/** Which refunds the queue shows. The default is the ones a person still has to deal with. */
export type RefundQueueFilter = 'needs_attention' | 'pending' | 'failed' | 'succeeded' | 'all';

export const REFUND_NOT_FOUND_MESSAGE = 'Refund not found';

/**
 * The refund queue staff work from: refunds that failed at the provider, and refunds the app cannot
 * send (no online payment on record) that staff must send by hand.
 */
@Injectable()
export class StaffRefundsService {
  public constructor(
    private readonly refunds: StaffRefundsRepository,
    private readonly issuer: RefundIssuer,
    private readonly bookings: BookingsRepository,
    private readonly payments: PaymentsService,
  ) {}

  /**
   * Refunds in the staff member's organization, newest first. One query.
   */
  public list(staff: StaffProfile, filter: RefundQueueFilter, propertyId: string | null): Promise<StaffRefund[]> {
    return this.refunds.list(staff.organizationId, statusesFor(filter), propertyId);
  }

  /**
   * Asks the payment provider to send a refund again.
   *
   * Only a failed refund, or an online one stuck pending, can be retried; one that staff must send by
   * hand cannot. The refund is taken in one atomic step first, so a double click cannot send it twice.
   * The result is the refund as it now stands: paid, or failed again with the provider's reason.
   */
  public async retry(staff: StaffProfile, refundId: string): Promise<StaffRefund> {
    const action = await this.requireRefund(staff, refundId);
    if (action.status === 'succeeded') {
      throw this.notRetryable('This refund has already been paid.');
    }
    if (action.status === 'pending' && action.provider === 'manual') {
      throw this.notRetryable('This refund has to be sent by hand. Mark it as refunded once you have sent the money.');
    }
    if (!(await this.refunds.claimForRetry(refundId))) {
      throw this.notRetryable('This refund is already being processed. Check it again in a minute.');
    }

    const provider = this.payments.describeProvider();
    const payments = await this.refunds.refundablePayments(action.inventory_block_id, refundId);
    const allocation = allocateRefund(payments, action.amount_cents);
    const coverable =
      allocation.chunks.length > 0 &&
      allocation.uncoveredCents === 0 &&
      allocation.chunks.every((chunk): boolean => chunk.provider === provider.name);
    if (!coverable) {
      const reason = 'The online payments can no longer cover this refund';
      await this.bookings.completeRefund(refundId, 'failed', '', reason);
      throw this.notRetryable('The online payment cannot cover this refund. Send the money yourself, then mark it as refunded.');
    }

    const plan: RefundPlan = {
      amountCents: action.amount_cents,
      percent: action.percent,
      currencyCode: action.currency_code,
      paymentId: allocation.chunks[0]?.paymentId ?? null,
      provider: provider.name,
      status: 'pending',
      viaProvider: true,
      reason: action.reason,
      chunks: allocation.chunks,
    };
    await this.issuer.settle(refundId, action.inventory_block_id, plan);
    return this.reload(refundId);
  }

  /**
   * Staff sent the money themselves (bank transfer, cash): the refund is done, with who and how.
   */
  public async markPaid(staff: StaffProfile, refundId: string, note: string): Promise<StaffRefund> {
    const action = await this.requireRefund(staff, refundId);
    if (action.status === 'succeeded') {
      throw this.alreadySettled();
    }
    if (!(await this.refunds.markManualPaid(refundId, staff.id, note))) {
      throw this.alreadySettled();
    }
    return this.reload(refundId);
  }

  private async requireRefund(staff: StaffProfile, refundId: string): Promise<RefundActionRow> {
    const action = await this.refunds.findForAction(refundId);
    // Another organization's refund looks exactly like one that does not exist.
    if (action === null || action.organization_id !== staff.organizationId) {
      throw new NotFoundException({ message: REFUND_NOT_FOUND_MESSAGE, code: 'REFUND_NOT_FOUND' });
    }
    return action;
  }

  private async reload(refundId: string): Promise<StaffRefund> {
    const refund = await this.refunds.getStaffRefund(refundId);
    if (refund === null) {
      throw new NotFoundException({ message: REFUND_NOT_FOUND_MESSAGE, code: 'REFUND_NOT_FOUND' });
    }
    return refund;
  }

  private notRetryable(message: string): ConflictException {
    return new ConflictException({ message, code: 'REFUND_NOT_RETRYABLE' });
  }

  private alreadySettled(): ConflictException {
    return new ConflictException({ message: 'This refund has already been paid.', code: 'REFUND_ALREADY_SETTLED' });
  }
}

/**
 * The statuses a queue filter stands for, or null for "all of them".
 */
export function statusesFor(filter: RefundQueueFilter): RefundStatus[] | null {
  switch (filter) {
    case 'needs_attention':
      return ['pending', 'failed'];
    case 'all':
      return null;
    default:
      return [filter];
  }
}
