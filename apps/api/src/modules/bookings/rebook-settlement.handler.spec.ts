/**
 * @file apps/api/src/modules/bookings/rebook-settlement.handler.spec.ts
 * @feature bookings
 */

import { Test } from '@nestjs/testing';
import type { GuestBooking } from '@resort-booking/shared-types';
import { Client, type PoolClient } from 'pg';
import { PaymentSettlementRegistry, type SettlingPayment } from '../payments/payment-settlement';
import { RebookSettlementHandler } from './rebook-settlement.handler';
import { RebookService } from './rebook.service';

const PAYMENT: SettlingPayment = { id: 'pay-1', bookingId: 'b-1', amountCents: 26000, currencyCode: 'EUR', payload: { x: 1 } };

describe('RebookSettlementHandler', () => {
  const applySettledChange = jest.fn<Promise<void>, [PoolClient, SettlingPayment]>();
  const presentSettled = jest.fn<Promise<GuestBooking | null>, [string]>();
  let registry: PaymentSettlementRegistry;
  let handler: RebookSettlementHandler;
  let client: PoolClient;

  beforeEach(async () => {
    jest.resetAllMocks();
    applySettledChange.mockResolvedValue(undefined);
    presentSettled.mockResolvedValue(null);
    registry = new PaymentSettlementRegistry();
    const moduleRef = await Test.createTestingModule({
      providers: [
        RebookSettlementHandler,
        { provide: RebookService, useValue: { applySettledChange, presentSettled } },
        { provide: PaymentSettlementRegistry, useValue: registry },
      ],
    }).compile();
    handler = moduleRef.get(RebookSettlementHandler);
    client = Object.assign(new Client(), { release: (): void => undefined });
  });

  it('handles date-change payments', () => {
    expect(handler.purpose).toBe('rebook');
  });

  it('registers itself with the payment service when the app starts', () => {
    expect(registry.find('rebook')).toBeNull();

    handler.onModuleInit();

    expect(registry.find('rebook')).toBe(handler);
  });

  it('refuses to register twice (a duplicate would be a wiring mistake)', () => {
    handler.onModuleInit();

    expect(() => handler.onModuleInit()).toThrow('already registered');
  });

  it('applies the change through the rebook service, on the payment\'s own transaction', async () => {
    await handler.settle(client, PAYMENT);

    expect(applySettledChange).toHaveBeenCalledWith(client, PAYMENT);
  });

  it('lets a refusal from the service reach the payment service, which then rolls back', async () => {
    applySettledChange.mockRejectedValue(new Error('dates taken'));

    await expect(handler.settle(client, PAYMENT)).rejects.toThrow('dates taken');
  });

  it('shows the new booking of a settled payment through the rebook service', async () => {
    presentSettled.mockResolvedValue({ reference: 'BK-NEW' } as GuestBooking);

    await expect(handler.presentSettled('pay-1')).resolves.toMatchObject({ reference: 'BK-NEW' });
    expect(presentSettled).toHaveBeenCalledWith('pay-1');
  });
});
