/**
 * @file apps/api/src/modules/payments/payments.service.spec.ts
 * @feature payments
 * @dependencies PaymentsService, @nestjs/testing
 */

import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { GuestBooking, PaymentStatus, QuoteDiscountLine, ReservationConfirmation } from '@resort-booking/shared-types';
import { Client, type PoolClient } from 'pg';
import { DatabaseService } from '../../shared/database/database.service';
import { RedisService } from '../../shared/redis/redis.service';
import { DiscountsService } from '../discounts/discounts.service';
import { InventoryService, type PayableHold } from '../inventory/inventory.service';
import { MockPaymentProvider } from './mock-payment.provider';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider';
import { PaymentSettlementRegistry, type PaymentSettlementHandler, type SettlingPayment } from './payment-settlement';
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

function payment(status: PaymentStatus = 'requires_payment', overrides: Partial<PaymentRow> = {}): PaymentRow {
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
    purpose: 'booking',
    payload: null,
    ...overrides,
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

const CHANGED_BOOKING: GuestBooking = {
  reference: 'BK-NEW0000000',
  reservationId: 'new-booking',
  stayName: 'Lake Chalet',
  propertyName: 'Alpine Lake',
  checkIn: '2027-08-01',
  checkOut: '2027-08-04',
  guestCount: 2,
  bookerName: 'Ada',
  totalCents: 60000,
  currencyCode: 'EUR',
  status: 'confirmed',
  canCancel: true,
  cancelBlockedReason: null,
  refundQuote: null,
  refund: null,
  rebookable: true,
  canChangeDates: true,
  changeDatesBlockedReason: null,
  replacedByReference: null,
  extras: [],
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
  const creditBooking = jest.fn<Promise<void>, [PoolClient, string]>();
  const insertSucceededManual = jest.fn<Promise<string>, [PoolClient, unknown]>();
  const settle = jest.fn<Promise<void>, [PoolClient, SettlingPayment]>();
  const presentSettled = jest.fn<Promise<GuestBooking | null>, [string]>();
  let registry: PaymentSettlementRegistry;
  const markEnded = jest.fn<Promise<PaymentRow | null>, [string, 'failed' | 'cancelled', string]>();
  const recordRedemptions = jest.fn<Promise<void>, [PoolClient, string, readonly QuoteDiscountLine[]]>();
  const deleteHoldTtl = jest.fn<Promise<void>, [string]>();
  const clientQuery = jest.fn<Promise<unknown>, [string]>();
  const createIntent = jest.fn<ReturnType<PaymentProvider['createIntent']>, Parameters<PaymentProvider['createIntent']>>();
  const refund = jest.fn<ReturnType<PaymentProvider['refund']>, Parameters<PaymentProvider['refund']>>();
  let service: PaymentsService;

  async function build(provider: PaymentProvider): Promise<PaymentsService> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PAYMENT_PROVIDER, useValue: provider },
        { provide: PaymentsRepository, useValue: { findOpenForHold, getById, insert, markSucceeded, markEnded, creditBooking, insertSucceededManual } },
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
        { provide: PaymentSettlementRegistry, useValue: registry },
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
    creditBooking.mockResolvedValue(undefined);
    settle.mockResolvedValue(undefined);
    presentSettled.mockResolvedValue(CHANGED_BOOKING);
    registry = new PaymentSettlementRegistry();
    const handler: PaymentSettlementHandler = { purpose: 'rebook', settle, presentSettled };
    registry.register(handler);
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
      const real: PaymentProvider = { name: 'stripe', simulated: false, createIntent, refund };
      const live = await build(real);

      await expect(live.completeMock(PAYMENT, 'success')).rejects.toMatchObject({ response: { code: 'MOCK_PAYMENTS_DISABLED' } });
      expect(getById).not.toHaveBeenCalled();
      expect(confirmPaidHold).not.toHaveBeenCalled();
    });

    it('tells the guest UI a real provider is not simulated', async () => {
      const real: PaymentProvider = { name: 'stripe', simulated: false, createIntent, refund };
      createIntent.mockResolvedValue({ providerRef: 'pi_123', clientSecret: 'secret' });
      const live = await build(real);

      const summary = await live.startPayment(HOLD);

      expect(summary.simulated).toBe(false);
      expect(insert).toHaveBeenCalledWith(expect.objectContaining({ provider: 'stripe', providerRef: 'pi_123' }));
    });
  });

  describe('provider access for refunds', () => {
    it('says which provider is active and whether it is simulated', () => {
      expect(service.describeProvider()).toEqual({ name: 'mock', simulated: true });
    });

    it('describes a real provider as not simulated', async () => {
      const live = await build({ name: 'stripe', simulated: false, createIntent, refund });

      expect(live.describeProvider()).toEqual({ name: 'stripe', simulated: false });
    });

    it('passes a refund request to the active provider and returns its result', async () => {
      refund.mockResolvedValue({ providerRef: 're_1', status: 'succeeded' });
      const live = await build({ name: 'stripe', simulated: false, createIntent, refund });
      const request = { providerRef: 'pi_1', amountCents: 4000, currencyCode: 'EUR', reason: 'Guest cancelled', idempotencyKey: 'refund-r1-g1-c0' };

      await expect(live.issueRefund(request)).resolves.toEqual({ providerRef: 're_1', status: 'succeeded' });

      expect(refund).toHaveBeenCalledWith(request);
    });

    it('lets a provider failure reach the caller so the booking can record a failed refund', async () => {
      refund.mockRejectedValue(new Error('provider down'));
      const live = await build({ name: 'stripe', simulated: false, createIntent, refund });

      await expect(live.issueRefund({ providerRef: 'pi_1', amountCents: 100, currencyCode: 'EUR', reason: 'x', idempotencyKey: 'refund-r1-g1-c0' })).rejects.toThrow('provider down');
    });
  });

  describe('booking payments are credited to the booking', () => {
    it('adds what was paid to the booking in the same transaction that confirms it', async () => {
      await service.completeMock(PAYMENT, 'success');

      expect(creditBooking).toHaveBeenCalledWith(expect.anything(), PAYMENT);
      expect(clientQuery.mock.calls.map((call) => call[0])).toEqual(['BEGIN', 'COMMIT']);
    });

    it('credits nothing when the stay could not be confirmed', async () => {
      confirmPaidHold.mockRejectedValue(expired());

      await expect(service.completeMock(PAYMENT, 'success')).rejects.toBeInstanceOf(ConflictException);

      expect(creditBooking).not.toHaveBeenCalled();
    });

    it('reports no date-change result for an ordinary booking payment', async () => {
      const result = await service.completeMock(PAYMENT, 'success');

      expect(result.rebookedBooking).toBeNull();
    });
  });

  describe('paying the balance of a date change', () => {
    const PAYLOAD = { oldBookingId: HOLD, newCheckIn: '2027-08-01', newCheckOut: '2027-08-04', newTotalCents: 60000, feeCents: 2000 };
    const OPEN_INPUT = {
      bookingId: HOLD,
      organizationId: 'org',
      propertyId: 'prop',
      amountCents: 24000,
      currencyCode: 'EUR',
      payload: PAYLOAD,
    };

    function rebookPayment(status: PaymentStatus = 'requires_payment'): PaymentRow {
      return payment(status, { purpose: 'rebook', payload: PAYLOAD, amount_cents: 24000 });
    }

    describe('opening it', () => {
      it('opens a balance payment for the amount owed, tagged as a date change, holding the agreed change', async () => {
        insert.mockImplementation((input) => Promise.resolve(payment('requires_payment', { purpose: input.purpose ?? 'booking', payload: input.payload ?? null, amount_cents: input.amountCents })));

        const summary = await service.openRebookPayment(OPEN_INPUT);

        expect(insert).toHaveBeenCalledWith(expect.objectContaining({ holdId: HOLD, amountCents: 24000, purpose: 'rebook', payload: PAYLOAD, provider: 'mock' }));
        expect(summary).toMatchObject({ holdId: HOLD, status: 'requires_payment', amountCents: 24000, simulated: true });
      });

      it('returns the SAME open payment when the same change is asked for again', async () => {
        findOpenForHold.mockResolvedValue(rebookPayment());

        const summary = await service.openRebookPayment(OPEN_INPUT);

        expect(summary.id).toBe(PAYMENT);
        expect(insert).not.toHaveBeenCalled();
        expect(markEnded).not.toHaveBeenCalled();
      });

      it('cancels the earlier attempt and opens a new one when a DIFFERENT change is asked for', async () => {
        findOpenForHold.mockResolvedValue(rebookPayment());

        await service.openRebookPayment({ ...OPEN_INPUT, payload: { ...PAYLOAD, newCheckOut: '2027-08-05' } });

        expect(markEnded).toHaveBeenCalledWith(PAYMENT, 'cancelled', 'superseded');
        expect(insert).toHaveBeenCalledTimes(1);
      });

      it('replaces an open payment of the same change when the amount owed moved', async () => {
        findOpenForHold.mockResolvedValue(rebookPayment());

        await service.openRebookPayment({ ...OPEN_INPUT, amountCents: 26000 });

        expect(markEnded).toHaveBeenCalledWith(PAYMENT, 'cancelled', 'superseded');
        expect(insert).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 26000 }));
      });

      it('returns the winner when two requests race and the unique index rejects one', async () => {
        findOpenForHold.mockResolvedValueOnce(null).mockResolvedValueOnce(rebookPayment());
        insert.mockRejectedValue(Object.assign(new Error('duplicate'), { code: '23505' }));

        const summary = await service.openRebookPayment(OPEN_INPUT);

        expect(summary.id).toBe(PAYMENT);
      });

      it('rethrows unexpected database errors', async () => {
        const failure = new Error('connection lost');
        insert.mockRejectedValue(failure);

        await expect(service.openRebookPayment(OPEN_INPUT)).rejects.toBe(failure);
      });
    });

    describe('when it succeeds', () => {
      beforeEach(() => {
        getById.mockResolvedValue(rebookPayment());
      });

      it('marks it paid and applies the change in ONE transaction, then returns the new booking', async () => {
        const result = await service.completeMock(PAYMENT, 'success');

        expect(clientQuery.mock.calls.map((call) => call[0])).toEqual(['BEGIN', 'COMMIT']);
        expect(markSucceeded).toHaveBeenCalledWith(expect.anything(), PAYMENT);
        expect(settle).toHaveBeenCalledWith(
          expect.anything(),
          { id: PAYMENT, bookingId: HOLD, amountCents: 24000, currencyCode: 'EUR', payload: PAYLOAD },
        );
        expect(result).toMatchObject({ payment: { status: 'succeeded' }, confirmation: null, rebookedBooking: CHANGED_BOOKING });
      });

      it('never confirms a hold, credits a booking, or counts discounts the way a booking payment does', async () => {
        await service.completeMock(PAYMENT, 'success');

        expect(getPayableHold).not.toHaveBeenCalled();
        expect(confirmPaidHold).not.toHaveBeenCalled();
        expect(creditBooking).not.toHaveBeenCalled();
        expect(recordRedemptions).not.toHaveBeenCalled();
      });

      it('applies the change only after the payment is marked paid', async () => {
        const order: string[] = [];
        markSucceeded.mockImplementation(() => {
          order.push('markSucceeded');
          return Promise.resolve(true);
        });
        settle.mockImplementation(() => {
          order.push('settle');
          return Promise.resolve();
        });

        await service.completeMock(PAYMENT, 'success');

        expect(order).toEqual(['markSucceeded', 'settle']);
      });

      it('rolls everything back and CANCELS the payment (nobody is charged) when the new dates were taken meanwhile', async () => {
        settle.mockRejectedValue(new ConflictException({ message: 'Those dates are not available', code: 'DATES_UNAVAILABLE' }));

        await expect(service.completeMock(PAYMENT, 'success')).rejects.toMatchObject({ response: { code: 'DATES_UNAVAILABLE' } });

        expect(clientQuery.mock.calls.map((call) => call[0])).toEqual(['BEGIN', 'ROLLBACK']);
        expect(markEnded).toHaveBeenCalledWith(PAYMENT, 'cancelled', 'dates_unavailable');
        expect(presentSettled).not.toHaveBeenCalled();
      });

      it('cancels the payment for any other refusal too, naming the reason', async () => {
        settle.mockRejectedValue(new ConflictException({ message: 'Already started', code: 'BOOKING_ALREADY_STARTED' }));

        await expect(service.completeMock(PAYMENT, 'success')).rejects.toBeInstanceOf(ConflictException);

        expect(markEnded).toHaveBeenCalledWith(PAYMENT, 'cancelled', 'booking_already_started');
      });

      it('leaves the payment OPEN (retry-able) when something unexpected breaks, because that is not a refusal', async () => {
        settle.mockRejectedValue(new Error('connection lost'));

        await expect(service.completeMock(PAYMENT, 'success')).rejects.toThrow('connection lost');

        expect(clientQuery.mock.calls.map((call) => call[0])).toEqual(['BEGIN', 'ROLLBACK']);
        expect(markEnded).not.toHaveBeenCalled();
      });

      it('does not cancel a payment another request already settled', async () => {
        markSucceeded.mockResolvedValue(false);

        await expect(service.completeMock(PAYMENT, 'success')).rejects.toMatchObject({ response: { code: 'PAYMENT_ALREADY_SETTLED' } });

        expect(settle).not.toHaveBeenCalled();
        expect(markEnded).not.toHaveBeenCalled();
      });

      it('fails before touching anything if nothing is registered to apply the change', async () => {
        registry = new PaymentSettlementRegistry();
        service = await build(new MockPaymentProvider());

        await expect(service.completeMock(PAYMENT, 'success')).rejects.toThrow('No settlement handler');

        expect(markSucceeded).not.toHaveBeenCalled();
      });

      it('is harmless to repeat: the same success returns the same new booking and applies nothing twice', async () => {
        getById.mockResolvedValue(rebookPayment('succeeded'));

        const result = await service.completeMock(PAYMENT, 'success');

        expect(result.rebookedBooking).toEqual(CHANGED_BOOKING);
        expect(presentSettled).toHaveBeenCalledWith(PAYMENT);
        expect(settle).not.toHaveBeenCalled();
        expect(markSucceeded).not.toHaveBeenCalled();
      });

      it('does not let a paid date change be "failed" afterwards', async () => {
        getById.mockResolvedValue(rebookPayment('succeeded'));

        await expect(service.completeMock(PAYMENT, 'failure')).rejects.toMatchObject({ response: { code: 'PAYMENT_ALREADY_SETTLED' } });
      });
    });

    describe('when it fails', () => {
      it('marks it failed, changes nothing, and does NOT give back any dates (they are the guest\'s booking)', async () => {
        getById.mockResolvedValue(rebookPayment());

        const result = await service.completeMock(PAYMENT, 'failure');

        expect(markEnded).toHaveBeenCalledWith(PAYMENT, 'failed', 'card_declined');
        expect(releaseHold).not.toHaveBeenCalled();
        expect(settle).not.toHaveBeenCalled();
        expect(result).toMatchObject({ payment: { status: 'failed' }, confirmation: null, rebookedBooking: null });
      });
    });
  });

  describe('recordManualPayment', () => {
    it('hands the payment to the repository inside the caller\'s transaction and returns its id', async () => {
      insertSucceededManual.mockResolvedValue('pay-m');
      const client = Object.assign(new Client(), { release: (): void => undefined, query: clientQuery });
      const input = { bookingId: 'b', organizationId: 'o', propertyId: 'pr', amountCents: 500, currencyCode: 'EUR' };

      await expect(service.recordManualPayment(client, input)).resolves.toBe('pay-m');
      expect(insertSucceededManual).toHaveBeenCalledWith(client, input);
    });
  });
});
