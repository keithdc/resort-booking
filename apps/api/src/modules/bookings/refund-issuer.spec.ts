/**
 * @file apps/api/src/modules/bookings/refund-issuer.spec.ts
 * @feature bookings
 */

import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PaymentsService } from '../payments/payments.service';
import { ProviderOutcomeUnknownError, type RefundRequest, type RefundResult } from '../payments/payment-provider';
import { BookingsRepository, type BookingRow } from './bookings.repository';
import { RefundIssuer } from './refund-issuer';
import { RefundTimings } from './refund-timings';

function row(payments: BookingRow['payments']): BookingRow {
  return { id: 'b', currency_code: 'EUR', payments } as BookingRow;
}

const NEWER = { id: 'p2', provider: 'mock', providerRef: 'mock_pi_2', refundableCents: 2000 };
const OLDER = { id: 'p1', provider: 'mock', providerRef: 'mock_pi_1', refundableCents: 96000 };

describe('RefundIssuer', () => {
  const describeProvider = jest.fn<{ name: string; simulated: boolean }, []>();
  const issueRefund = jest.fn<Promise<RefundResult>, [RefundRequest]>();
  const completeRefund = jest.fn<Promise<boolean>, [string, 'succeeded' | 'failed', string, string | null, { bumpKeyGeneration?: boolean }?]>();
  const noteRefundOutcomeUnknown = jest.fn<Promise<void>, [string, string]>();
  let issuer: RefundIssuer;

  beforeEach(async () => {
    jest.resetAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation((): void => undefined);
    describeProvider.mockReturnValue({ name: 'mock', simulated: true });
    issueRefund.mockImplementation((request) => Promise.resolve({ providerRef: `re_${request.providerRef}`, status: 'succeeded' }));
    completeRefund.mockResolvedValue(true);
    noteRefundOutcomeUnknown.mockResolvedValue(undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [
        RefundIssuer,
        { provide: BookingsRepository, useValue: { completeRefund, noteRefundOutcomeUnknown } },
        { provide: RefundTimings, useValue: { values: { providerTimeoutMs: 20_000, leaseSeconds: 150 } } },
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
      expect(completeRefund).toHaveBeenCalledWith('refund-1', 'succeeded', 're_mock_pi_2,re_mock_pi_1', null, {});
      expect(outcome).toBe('succeeded');
    });

    it('records a failure with the provider\'s message and still returns, never throws', async () => {
      issueRefund.mockRejectedValue(new Error('provider unreachable'));
      const plan = issuer.plan(row([OLDER]), 1000, 100, 'why');

      await expect(issuer.settle('refund-1', 'b', plan)).resolves.toBe('failed');

      expect(completeRefund).toHaveBeenCalledWith('refund-1', 'failed', '', 'provider unreachable', { bumpKeyGeneration: true });
      expect(Logger.prototype.error).toHaveBeenCalled();
    });

    it('keeps the references of refunds that already went through when a later one fails', async () => {
      issueRefund.mockResolvedValueOnce({ providerRef: 're_first', status: 'succeeded' }).mockRejectedValueOnce(new Error('second failed'));
      const plan = issuer.plan(row([NEWER, OLDER]), 50000, 100, 'why');

      await issuer.settle('refund-1', 'b', plan);

      expect(completeRefund).toHaveBeenCalledWith('refund-1', 'failed', 're_first', 'second failed', { bumpKeyGeneration: false });
    });

    it('sends a deterministic idempotency key per refund, key generation and chunk', async () => {
      const plan = { ...issuer.plan(row([NEWER, OLDER]), 50000, 100, 'why'), keyGeneration: 2 };

      await issuer.settle('refund-1', 'b', plan);

      expect(issueRefund.mock.calls.map((call) => call[0].idempotencyKey)).toEqual(['refund-refund-1-g2-c0', 'refund-refund-1-g2-c1']);
    });

    it('sends the SAME keys when the same refund is settled again (a retry after a lost answer cannot pay twice)', async () => {
      const plan = issuer.plan(row([NEWER, OLDER]), 50000, 100, 'why');

      await issuer.settle('refund-1', 'b', plan);
      await issuer.settle('refund-1', 'b', plan);

      const keys = issueRefund.mock.calls.map((call) => call[0].idempotencyKey);
      expect(keys.slice(0, 2)).toEqual(keys.slice(2));
    });

    it('leaves the refund pending, with a note, when the provider cannot say what happened', async () => {
      issueRefund.mockRejectedValue(new ProviderOutcomeUnknownError('connection reset'));
      const plan = issuer.plan(row([OLDER]), 1000, 100, 'why');

      await expect(issuer.settle('refund-1', 'b', plan)).resolves.toBe('pending');

      expect(completeRefund).not.toHaveBeenCalled();
      expect(noteRefundOutcomeUnknown).toHaveBeenCalledWith('refund-1', expect.stringContaining('connection reset'));
      expect(Logger.prototype.error).toHaveBeenCalledWith(expect.stringContaining('asked again with the same idempotency key'));
    });

    describe('with fake timers', () => {
      beforeEach(() => {
        jest.useFakeTimers();
      });
      afterEach(() => {
        jest.useRealTimers();
      });

      it('treats a provider call that outlasts the timeout as an unknown outcome, never as a refusal', async () => {
        issueRefund.mockImplementation(() => new Promise<RefundResult>(() => undefined));
        const plan = issuer.plan(row([OLDER]), 1000, 100, 'why');

        const settled = issuer.settle('refund-1', 'b', plan);
        await jest.advanceTimersByTimeAsync(20_001);

        await expect(settled).resolves.toBe('pending');
        expect(completeRefund).not.toHaveBeenCalled();
        expect(noteRefundOutcomeUnknown).toHaveBeenCalledWith('refund-1', expect.stringContaining('no answer from the provider within 20 seconds'));
      });

      it('does not start the next payment\'s call when the lease is about to run out', async () => {
        issueRefund.mockImplementation(async (request) => {
          jest.setSystemTime(Date.now() + 140_000);
          return { providerRef: `re_${request.providerRef}`, status: 'succeeded' as const };
        });
        const plan = issuer.plan(row([NEWER, OLDER]), 50000, 100, 'why');

        await expect(issuer.settle('refund-1', 'b', plan)).resolves.toBe('pending');

        expect(issueRefund).toHaveBeenCalledTimes(1);
        expect(noteRefundOutcomeUnknown).toHaveBeenCalledWith('refund-1', expect.stringContaining('Already refunded: re_mock_pi_2'));
      });

      it('retries saving the provider\'s answer, then leaves the row pending for the reconciler', async () => {
        completeRefund.mockRejectedValue(new Error('db down'));
        const plan = issuer.plan(row([OLDER]), 1000, 100, 'why');

        const settled = issuer.settle('refund-1', 'b', plan);
        await jest.advanceTimersByTimeAsync(2000);

        await expect(settled).resolves.toBe('succeeded');
        expect(completeRefund).toHaveBeenCalledTimes(3);
        expect(Logger.prototype.error).toHaveBeenCalledWith(expect.stringContaining('until the reconciler settles it with the same idempotency key'));
      });

      it('stops retrying the save as soon as it works', async () => {
        completeRefund.mockRejectedValueOnce(new Error('blip')).mockResolvedValue(true);
        const plan = issuer.plan(row([OLDER]), 1000, 100, 'why');

        const settled = issuer.settle('refund-1', 'b', plan);
        await jest.advanceTimersByTimeAsync(2000);

        await expect(settled).resolves.toBe('succeeded');
        expect(completeRefund).toHaveBeenCalledTimes(2);
        expect(Logger.prototype.error).not.toHaveBeenCalled();
      });
    });
  });
});
