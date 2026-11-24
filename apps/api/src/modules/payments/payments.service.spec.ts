/**
 * @file apps/api/src/modules/payments/payments.service.spec.ts
 * @feature payments
 * @dependencies PaymentsService, @nestjs/testing
 */

import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PaymentStatus, QuoteDiscountLine, ReservationConfirmation } from '@resort-booking/shared-types';
import { Client, type PoolClient } from 'pg';
import { DatabaseService } from '../../shared/database/database.service';
import { RedisService } from '../../shared/redis/redis.service';
import { DiscountsService } from '../discounts/discounts.service';
import { InventoryService, type PayableHold } from '../inventory/inventory.service';
import { MockPaymentProvider } from './mock-payment.provider';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider';
import { PaymentsRepository, type InsertPaymentInput, type PaymentRow } from './payments.repository';
import { PaymentsService } from './payments.service';

const HOLD = 'hold-1';
const PAYMENT = 'pay-1';

const DISCOUNTS: QuoteDiscountLine[] = [{ discountId: 'd1', label: 'Long stay', amountCents: 6000 }];

function payable(overrides: Partial<PayableHold> = {}): PayableHold {
  return {
    id: HOLD,
    organizationId: 'org',
    propertyId: 'prop',
    houseId: 'house',
    paymentMethod: 'card',
    totalCents: 54000,
    currencyCode: 'EUR',
    discounts: DISCOUNTS,
    ...overrides,
  };
}

function payment(status: PaymentStatus = 'requires_payment'): PaymentRow {
  return {
    id: PAYMENT,
    organization_id: 'org',
    property_id: 'prop',
    inventory_block_id: HOLD,
    provider: 'mock',
    provider_ref: 'mock_pi_x',
    amount_cents: 54000,
    currency_code: 'EUR',
    status,
    failure_reason: null,
  };
}

const CONFIRMATION: ReservationConfirmation = {
  reservationId: HOLD,
  reference: 'BK-HOLD',
  houseId: 'house',
  propertyId: 'prop',
  checkIn: '2027-07-10',
  checkOut: '2027-07-13',
  guestCount: 2,
  totalCents: 54000,
  currencyCode: 'EUR',
  bookerName: 'Ada',
  bookerEmail: 'ada@example.com',
};

function expired(): ConflictException {
  return new ConflictException({ message: 'Time ran out', code: 'HOLD_EXPIRED' });
}

describe('PaymentsService', () => {
  const getPayableHold = jest.fn<Promise<PayableHold>, [string]>();
  const confirmPaidHold = jest.fn<Promise<ReservationConfirmation>, [PoolClient, string]>();
  const getConfirmation = jest.fn<Promise<ReservationConfirmation | null>, [string]>();
  const releaseHold = jest.fn<Promise<void>, [string]>();
  const findOpenForHold = jest.fn<Promise<PaymentRow | null>, [string]>();
  const getById = jest.fn<Promise<PaymentRow | null>, [string]>();
  const insert = jest.fn<Promise<PaymentRow>, [InsertPaymentInput]>();
  const markSucceeded = jest.fn<Promise<boolean>, [PoolClient, string]>();
  const markEnded = jest.fn<Promise<PaymentRow | null>, [string, 'failed' | 'cancelled', string]>();
  const recordRedemptions = jest.fn<Promise<void>, [PoolClient, string, readonly QuoteDiscountLine[]]>();
  const deleteHoldTtl = jest.fn<Promise<void>, [string]>();
  const clientQuery = jest.fn<Promise<unknown>, [string]>();
  const createIntent = jest.fn<ReturnType<PaymentProvider['createIntent']>, Parameters<PaymentProvider['createIntent']>>();
  let service: PaymentsService;

  async function build(provider: PaymentProvider): Promise<PaymentsService> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PAYMENT_PROVIDER, useValue: provider },
        { provide: PaymentsRepository, useValue: { findOpenForHold, getById, insert, markSucceeded, markEnded } },
        { provide: InventoryService, useValue: { getPayableHold, confirmPaidHold, getConfirmation, releaseHold } },
        { provide: DiscountsService, useValue: { recordRedemptions } },
        {
          provide: DatabaseService,
          useValue: {
            withClient: (work: (client: PoolClient) => Promise<unknown>) =>
              work(Object.assign(new Client(), { release: (): void => undefined, query: clientQuery })),
          },
        },
        { provide: RedisService, useValue: { deleteHoldTtl } },
      ],
    }).compile();
    return moduleRef.get(PaymentsService);
  }

  beforeEach(async (): Promise<void> => {
    jest.resetAllMocks();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation((): void => undefined);
    getPayableHold.mockResolvedValue(payable());
    findOpenForHold.mockResolvedValue(null);
    getById.mockResolvedValue(payment());
    insert.mockImplementation((input) => Promise.resolve({ ...payment(), provider_ref: input.providerRef, amount_cents: input.amountCents }));
    confirmPaidHold.mockResolvedValue(CONFIRMATION);
    markSucceeded.mockResolvedValue(true);
    markEnded.mockResolvedValue({ ...payment('failed') });
    recordRedemptions.mockResolvedValue(undefined);
    releaseHold.mockResolvedValue(undefined);
    deleteHoldTtl.mockResolvedValue(undefined);
    clientQuery.mockResolvedValue({ rows: [] });
    service = await build(new MockPaymentProvider());
  });

  afterEach((): void => {
    jest.restoreAllMocks();
  });

  describe('startPayment', () => {
    it('opens a payment for the quoted total, tagged as simulated', async () => {
      const summary = await service.startPayment(HOLD);

      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({ holdId: HOLD, amountCents: 54000, currencyCode: 'EUR', provider: 'mock' }),
      );
      expect(summary).toMatchObject({ holdId: HOLD, status: 'requires_payment', amountCents: 54000, simulated: true });
    });

    it('returns the same open payment on a repeat call instead of starting a second', async () => {
      findOpenForHold.mockResolvedValue(payment());

      const summary = await service.startPayment(HOLD);

      expect(summary.id).toBe(PAYMENT);
      expect(insert).not.toHaveBeenCalled();
    });

    it('returns the winner when two requests race and the unique index rejects one', async () => {
      findOpenForHold.mockResolvedValueOnce(null).mockResolvedValueOnce(payment());
      insert.mockRejectedValue(Object.assign(new Error('duplicate'), { code: '23505' }));

      const summary = await service.startPayment(HOLD);

      expect(summary.id).toBe(PAYMENT);
    });

    it('rethrows unexpected database errors', async () => {
      const failure = new Error('connection lost');
      insert.mockRejectedValue(failure);

      await expect(service.startPayment(HOLD)).rejects.toBe(failure);
    });

    it('never charges for a hold that ended or timed out', async () => {
      getPayableHold.mockRejectedValue(expired());

      await expect(service.startPayment(HOLD)).rejects.toMatchObject({ response: { code: 'HOLD_EXPIRED' } });
      expect(insert).not.toHaveBeenCalled();
    });

    it('says bank transfers are confirmed by the operator, not paid here', async () => {
      getPayableHold.mockResolvedValue(payable({ paymentMethod: 'bank_transfer' }));

      await expect(service.startPayment(HOLD)).rejects.toMatchObject({ response: { code: 'PAYMENT_METHOD_UNSUPPORTED' } });
      expect(insert).not.toHaveBeenCalled();
    });

    it('can start a payment for a free stay', async () => {
      getPayableHold.mockResolvedValue(payable({ totalCents: 0 }));

      await expect(service.startPayment(HOLD)).resolves.toMatchObject({ amountCents: 0 });
    });
  });

  describe('completeMock: success', () => {
    it('confirms the stay, records the payment and counts discount use, all in one transaction', async () => {
      const result = await service.completeMock(PAYMENT, 'success');

      expect(clientQuery.mock.calls.map((call) => call[0])).toEqual(['BEGIN', 'COMMIT']);
      expect(confirmPaidHold).toHaveBeenCalledWith(expect.anything(), HOLD);
      expect(markSucceeded).toHaveBeenCalledWith(expect.anything(), PAYMENT);
      expect(recordRedemptions).toHaveBeenCalledWith(expect.anything(), HOLD, DISCOUNTS);
      expect(result.confirmation?.reference).toBe('BK-HOLD');
      expect(result.payment.status).toBe('succeeded');
    });

    it('clears the hold timer after the stay is confirmed', async () => {
      await service.completeMock(PAYMENT, 'success');

      expect(deleteHoldTtl).toHaveBeenCalledWith(HOLD);
    });

    it('still confirms when the Redis timer cannot be cleared (it expires on its own)', async () => {
      deleteHoldTtl.mockRejectedValue(new Error('redis down'));

      const result = await service.completeMock(PAYMENT, 'success');

      expect(result.confirmation).not.toBeNull();
    });

    it('rolls everything back when the stay cannot be confirmed', async () => {
      confirmPaidHold.mockRejectedValue(expired());

      await expect(service.completeMock(PAYMENT, 'success')).rejects.toMatchObject({ response: { code: 'HOLD_EXPIRED' } });

      expect(clientQuery.mock.calls.map((call) => call[0])).toEqual(['BEGIN', 'ROLLBACK']);
      expect(recordRedemptions).not.toHaveBeenCalled();
      expect(markEnded).toHaveBeenCalledWith(PAYMENT, 'cancelled', 'hold_expired');
    });

    it('does not confirm a hold that already timed out before paying', async () => {
      getPayableHold.mockRejectedValue(expired());

      await expect(service.completeMock(PAYMENT, 'success')).rejects.toMatchObject({ response: { code: 'HOLD_EXPIRED' } });

      expect(confirmPaidHold).not.toHaveBeenCalled();
      expect(markEnded).toHaveBeenCalledWith(PAYMENT, 'cancelled', 'hold_expired');
    });

    it('rolls back if another request settled the payment first', async () => {
      markSucceeded.mockResolvedValue(false);

      await expect(service.completeMock(PAYMENT, 'success')).rejects.toMatchObject({ response: { code: 'PAYMENT_ALREADY_SETTLED' } });

      expect(clientQuery.mock.calls.map((call) => call[0])).toEqual(['BEGIN', 'ROLLBACK']);
      expect(recordRedemptions).not.toHaveBeenCalled();
    });

    it('is harmless to repeat: a second success returns the same confirmation without confirming again', async () => {
      getById.mockResolvedValue(payment('succeeded'));
      getConfirmation.mockResolvedValue(CONFIRMATION);

      const result = await service.completeMock(PAYMENT, 'success');

      expect(result.confirmation).toEqual(CONFIRMATION);
      expect(confirmPaidHold).not.toHaveBeenCalled();
      expect(recordRedemptions).not.toHaveBeenCalled();
    });

    it('does not let a paid stay be "failed" afterwards', async () => {
      getById.mockResolvedValue(payment('succeeded'));

      await expect(service.completeMock(PAYMENT, 'failure')).rejects.toMatchObject({ response: { code: 'PAYMENT_ALREADY_SETTLED' } });
      expect(releaseHold).not.toHaveBeenCalled();
    });
  });

  describe('completeMock: failure', () => {
    it('marks the payment failed and gives the dates back', async () => {
      const result = await service.completeMock(PAYMENT, 'failure');

      expect(markEnded).toHaveBeenCalledWith(PAYMENT, 'failed', 'card_declined');
      expect(releaseHold).toHaveBeenCalledWith(HOLD);
      expect(result.payment.status).toBe('failed');
      expect(result.confirmation).toBeNull();
      expect(confirmPaidHold).not.toHaveBeenCalled();
      expect(recordRedemptions).not.toHaveBeenCalled();
    });
  });

  describe('completeMock: guards', () => {
    it.each<PaymentStatus>(['failed', 'cancelled'])('refuses a payment that already ended as %s', async (status) => {
      getById.mockResolvedValue(payment(status));

      await expect(service.completeMock(PAYMENT, 'success')).rejects.toMatchObject({ response: { code: 'PAYMENT_ALREADY_SETTLED' } });
      expect(confirmPaidHold).not.toHaveBeenCalled();
    });

    it('returns not found for an unknown payment', async () => {
      getById.mockResolvedValue(null);

      await expect(service.completeMock('nope', 'success')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('does not exist at all when a real provider is active', async () => {
      const real: PaymentProvider = { name: 'stripe', simulated: false, createIntent };
      const live = await build(real);

      await expect(live.completeMock(PAYMENT, 'success')).rejects.toMatchObject({ response: { code: 'MOCK_PAYMENTS_DISABLED' } });
      expect(getById).not.toHaveBeenCalled();
      expect(confirmPaidHold).not.toHaveBeenCalled();
    });

    it('tells the guest UI a real provider is not simulated', async () => {
      const real: PaymentProvider = { name: 'stripe', simulated: false, createIntent };
      createIntent.mockResolvedValue({ providerRef: 'pi_123', clientSecret: 'secret' });
      const live = await build(real);

      const summary = await live.startPayment(HOLD);

      expect(summary.simulated).toBe(false);
      expect(insert).toHaveBeenCalledWith(expect.objectContaining({ provider: 'stripe', providerRef: 'pi_123' }));
    });
  });
});
