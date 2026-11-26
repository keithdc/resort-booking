/**
 * @file apps/api/src/modules/bookings/payment-events.adapter.spec.ts
 * @feature bookings
 */

import { Test } from '@nestjs/testing';
import { Client, type PoolClient } from 'pg';
import { PaymentEventsRegistry, type LatePayment } from '../payments/payment-events';
import { BookingsRepository, type InsertRefundInput } from './bookings.repository';
import { PaymentEventsAdapter } from './payment-events.adapter';
import { RefundIssuer, type RefundPlan } from './refund-issuer';
import { StaffRefundsRepository } from './staff-refunds.repository';

const LATE: LatePayment = {
  id: 'pay-1',
  organizationId: 'org',
  propertyId: 'prop',
  bookingId: 'hold-1',
  provider: 'mock',
  providerRef: 'pi_1',
  amountCents: 54000,
  currencyCode: 'EUR',
};
const CLIENT: PoolClient = Object.assign(new Client(), { release: (): void => undefined, query: jest.fn() });

describe('PaymentEventsAdapter', () => {
  const insertRefund = jest.fn<Promise<string | null>, [PoolClient, InsertRefundInput]>();
  const settle = jest.fn<Promise<'succeeded' | 'failed' | 'pending'>, [string, string, RefundPlan]>();
  const lockByProviderRefund = jest.fn();
  const settleFromProvider = jest.fn();
  let adapter: PaymentEventsAdapter;
  let registry: PaymentEventsRegistry;

  beforeEach(async () => {
    jest.resetAllMocks();
    insertRefund.mockResolvedValue('refund-1');
    settle.mockResolvedValue('succeeded');
    settleFromProvider.mockResolvedValue(true);
    registry = new PaymentEventsRegistry();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentEventsAdapter,
        { provide: BookingsRepository, useValue: { insertRefund } },
        { provide: StaffRefundsRepository, useValue: { lockByProviderRefund, settleFromProvider } },
        { provide: RefundIssuer, useValue: { settle } },
        { provide: PaymentEventsRegistry, useValue: registry },
      ],
    }).compile();
    adapter = moduleRef.get(PaymentEventsAdapter);
  });

  it('registers itself with the payment module on start-up', () => {
    adapter.onModuleInit();

    expect(registry.get()).toBe(adapter);
  });

  it('records the late refund through the normal refund path: pending, online, the full amount, flagged late_payment', async () => {
    await expect(adapter.recordLateRefund(CLIENT, LATE)).resolves.toBe('refund-1');

    expect(insertRefund).toHaveBeenCalledWith(CLIENT, {
      organizationId: 'org',
      propertyId: 'prop',
      bookingId: 'hold-1',
      paymentId: 'pay-1',
      provider: 'mock',
      amountCents: 54000,
      percent: 100,
      currencyCode: 'EUR',
      status: 'pending',
      reason: expect.stringContaining('Automatic refund'),
      kind: 'late_payment',
      reasonCode: 'late_payment',
      initiatedBy: 'staff',
      createdByStaffId: null,
    });
  });

  it('answers null when a late-payment refund already exists for the booking', async () => {
    insertRefund.mockResolvedValue(null);

    await expect(adapter.recordLateRefund(CLIENT, LATE)).resolves.toBeNull();
  });

  it('asks the provider for the whole payment back, with key generation 1 (the key comes from the refund id)', async () => {
    await expect(adapter.settleLateRefund('refund-1', LATE)).resolves.toBe('succeeded');

    expect(settle).toHaveBeenCalledWith(
      'refund-1',
      'hold-1',
      expect.objectContaining({
        amountCents: 54000,
        viaProvider: true,
        keyGeneration: 1,
        chunks: [{ paymentId: 'pay-1', providerRef: 'pi_1', provider: 'mock', amountCents: 54000 }],
      }),
    );
  });

  describe('applyRefundUpdate', () => {
    const update = { providerRefundId: 're_1', refundId: null, status: 'succeeded' as const, failureReason: null };

    it('says unknown for a refund we never made', async () => {
      lockByProviderRefund.mockResolvedValue(null);

      await expect(adapter.applyRefundUpdate(CLIENT, update)).resolves.toBe('unknown_refund');
    });

    it('settles a pending refund from the provider\'s success', async () => {
      lockByProviderRefund.mockResolvedValue({ id: 'r1', status: 'pending' });

      await expect(adapter.applyRefundUpdate(CLIENT, update)).resolves.toBe('settled');

      expect(settleFromProvider).toHaveBeenCalledWith(CLIENT, 'r1', 'succeeded', 're_1', null);
    });

    it('lets a failed refund be settled by a later provider success', async () => {
      lockByProviderRefund.mockResolvedValue({ id: 'r1', status: 'failed' });

      await expect(adapter.applyRefundUpdate(CLIENT, update)).resolves.toBe('settled');
    });

    it('treats a repeated success on a paid refund as unchanged, and a failure on a paid refund as a conflict, changing nothing', async () => {
      lockByProviderRefund.mockResolvedValue({ id: 'r1', status: 'succeeded' });

      await expect(adapter.applyRefundUpdate(CLIENT, update)).resolves.toBe('unchanged');
      await expect(adapter.applyRefundUpdate(CLIENT, { ...update, status: 'failed' })).resolves.toBe('conflict');
      expect(settleFromProvider).not.toHaveBeenCalled();
    });

    it('does nothing for a pending report', async () => {
      lockByProviderRefund.mockResolvedValue({ id: 'r1', status: 'pending' });

      await expect(adapter.applyRefundUpdate(CLIENT, { ...update, status: 'pending' })).resolves.toBe('unchanged');
      expect(settleFromProvider).not.toHaveBeenCalled();
    });

    it('answers unchanged when the row moved on between the read and the write', async () => {
      lockByProviderRefund.mockResolvedValue({ id: 'r1', status: 'pending' });
      settleFromProvider.mockResolvedValue(false);

      await expect(adapter.applyRefundUpdate(CLIENT, { ...update, status: 'failed', failureReason: 'x' })).resolves.toBe('unchanged');
    });
  });
});
