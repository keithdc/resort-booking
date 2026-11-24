/**
 * @file apps/api/src/modules/bookings/refund-issuer.spec.ts
 * @feature bookings
 */

import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PaymentsService } from '../payments/payments.service';
import type { RefundRequest, RefundResult } from '../payments/payment-provider';
import { BookingsRepository, type BookingRow } from './bookings.repository';
import { RefundIssuer } from './refund-issuer';

function row(payments: BookingRow['payments']): BookingRow {
  return { id: 'b', currency_code: 'EUR', payments } as BookingRow;
}

const NEWER = { id: 'p2', provider: 'mock', providerRef: 'mock_pi_2', refundableCents: 2000 };
const OLDER = { id: 'p1', provider: 'mock', providerRef: 'mock_pi_1', refundableCents: 96000 };

describe('RefundIssuer', () => {
  const describeProvider = jest.fn<{ name: string; simulated: boolean }, []>();
  const issueRefund = jest.fn<Promise<RefundResult>, [RefundRequest]>();
  const completeRefund = jest.fn<Promise<void>, [string, 'succeeded' | 'failed', string, string | null]>();
  let issuer: RefundIssuer;

  beforeEach(async () => {
    jest.resetAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation((): void => undefined);
    describeProvider.mockReturnValue({ name: 'mock', simulated: true });
    issueRefund.mockImplementation((request) => Promise.resolve({ providerRef: `re_${request.providerRef}`, status: 'succeeded' }));
    completeRefund.mockResolvedValue(undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [
        RefundIssuer,
        { provide: BookingsRepository, useValue: { completeRefund } },
        { provide: PaymentsService, useValue: { describeProvider, issueRefund } },
      ],
    }).compile();
    issuer = moduleRef.get(RefundIssuer);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('plan', () => {
    it('sends the money back through the provider when one payment covers it', () => {
      const plan = issuer.plan(row([OLDER]), 50000, 75, 'Guest cancelled online');

      expect(plan).toMatchObject({ viaProvider: true, provider: 'mock', status: 'pending', paymentId: 'p1', amountCents: 50000, percent: 75, reason: 'Guest cancelled online' });
      expect(plan.chunks).toEqual([{ paymentId: 'p1', providerRef: 'mock_pi_1', provider: 'mock', amountCents: 50000 }]);
    });

    it('spreads a refund over two payments, newest first, and records the first one', () => {
      const plan = issuer.plan(row([NEWER, OLDER]), 50000, 100, 'Guest cancelled online');

      expect(plan.chunks.map((chunk) => [chunk.paymentId, chunk.amountCents])).toEqual([['p2', 2000], ['p1', 48000]]);
      expect(plan.paymentId).toBe('p2');
      expect(plan.viaProvider).toBe(true);
    });

    it('hands it to the operator when the payments cannot cover all of it', () => {
      const plan = issuer.plan(row([NEWER]), 50000, 100, 'Guest cancelled online');

      expect(plan).toMatchObject({ viaProvider: false, provider: 'manual', status: 'pending', chunks: [] });
      expect(plan.reason).toContain('cannot cover it');
    });

    it('hands it to the operator when there is no online payment on record', () => {
      const plan = issuer.plan(row([]), 50000, 100, 'Guest cancelled online');

      expect(plan).toMatchObject({ viaProvider: false, provider: 'manual', paymentId: null });
      expect(plan.reason).toContain('no online payment is on record');
    });

    it('hands it to the operator when a payment was taken with another provider', () => {
      describeProvider.mockReturnValue({ name: 'stripe', simulated: false });

      const plan = issuer.plan(row([OLDER]), 50000, 100, 'Guest cancelled online');

      expect(plan).toMatchObject({ viaProvider: false, provider: 'manual', paymentId: 'p1' });
      expect(plan.reason).toContain('different provider');
    });

    it('records a zero refund as done and never plans a provider call for nothing', () => {
      const plan = issuer.plan(row([OLDER]), 0, 0, 'Guest cancelled online');

      expect(plan).toMatchObject({ amountCents: 0, status: 'succeeded', viaProvider: false, chunks: [] });
      expect(plan.reason).toBe('Guest cancelled online; no refund under the policy');
    });

    it('uses the currency of the booking, falling back to euros', () => {
      expect(issuer.plan(row([OLDER]), 100, 100, 'x').currencyCode).toBe('EUR');
      expect(issuer.plan({ ...row([OLDER]), currency_code: 'GBP' }, 100, 100, 'x').currencyCode).toBe('GBP');
    });
  });

  describe('settle', () => {
    it('asks the provider once per payment and records the references together', async () => {
      const plan = issuer.plan(row([NEWER, OLDER]), 50000, 100, 'why');

      const outcome = await issuer.settle('refund-1', 'b', plan);

      expect(issueRefund.mock.calls.map((call) => [call[0].providerRef, call[0].amountCents])).toEqual([['mock_pi_2', 2000], ['mock_pi_1', 48000]]);
      expect(completeRefund).toHaveBeenCalledWith('refund-1', 'succeeded', 're_mock_pi_2,re_mock_pi_1', null);
      expect(outcome).toBe('succeeded');
    });

    it('records a failure with the provider\'s message and still returns, never throws', async () => {
      issueRefund.mockRejectedValue(new Error('provider unreachable'));
      const plan = issuer.plan(row([OLDER]), 1000, 100, 'why');

      await expect(issuer.settle('refund-1', 'b', plan)).resolves.toBe('failed');

      expect(completeRefund).toHaveBeenCalledWith('refund-1', 'failed', '', 'provider unreachable');
      expect(Logger.prototype.error).toHaveBeenCalled();
    });

    it('keeps the references of refunds that already went through when a later one fails', async () => {
      issueRefund.mockResolvedValueOnce({ providerRef: 're_first', status: 'succeeded' }).mockRejectedValueOnce(new Error('second failed'));
      const plan = issuer.plan(row([NEWER, OLDER]), 50000, 100, 'why');

      await issuer.settle('refund-1', 'b', plan);

      expect(completeRefund).toHaveBeenCalledWith('refund-1', 'failed', 're_first', 'second failed');
    });

    it('does not throw if saving the provider\'s answer fails (the money already moved)', async () => {
      completeRefund.mockRejectedValue(new Error('db down'));
      const plan = issuer.plan(row([OLDER]), 1000, 100, 'why');

      await expect(issuer.settle('refund-1', 'b', plan)).resolves.toBe('succeeded');
      expect(Logger.prototype.error).toHaveBeenCalled();
    });
  });
});
