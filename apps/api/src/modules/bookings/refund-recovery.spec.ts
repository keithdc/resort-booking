/**
 * @file apps/api/src/modules/bookings/refund-recovery.spec.ts
 * @feature bookings
 * The refund recovery story end to end with the real mock provider: a lost answer, then a second ask with the same key.
 */

import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MockPaymentProvider } from '../payments/mock-payment.provider';
import type { RefundRequest, RefundResult } from '../payments/payment-provider';
import { PaymentsService } from '../payments/payments.service';
import { BookingsRepository } from './bookings.repository';
import { RefundIssuer, type RefundPlan } from './refund-issuer';
import { RefundTimings } from './refund-timings';

const PLAN: RefundPlan = {
  amountCents: 5000,
  percent: 50,
  currencyCode: 'EUR',
  paymentId: 'p1',
  provider: 'mock',
  status: 'pending',
  viaProvider: true,
  reason: 'Guest cancelled online',
  chunks: [{ paymentId: 'p1', providerRef: 'mock_pi_1', provider: 'mock', amountCents: 5000 }],
};

describe('refund recovery after a lost provider answer', () => {
  const completeRefund = jest.fn();
  const noteRefundOutcomeUnknown = jest.fn();
  let provider: MockPaymentProvider;
  let issuer: RefundIssuer;
  let lostAnswers: number;

  beforeEach(async () => {
    jest.useFakeTimers();
    jest.resetAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation((): void => undefined);
    completeRefund.mockResolvedValue(true);
    noteRefundOutcomeUnknown.mockResolvedValue(undefined);
    provider = new MockPaymentProvider();
    lostAnswers = 1;
    const moduleRef = await Test.createTestingModule({
      providers: [
        RefundIssuer,
        { provide: BookingsRepository, useValue: { completeRefund, noteRefundOutcomeUnknown } },
        {
          provide: PaymentsService,
          useValue: {
            describeProvider: () => ({ name: 'mock', simulated: true }),
            // The provider really refunds, but the first answer never arrives (a dropped connection).
            issueRefund: (request: RefundRequest): Promise<RefundResult> => {
              const answer = provider.refund(request);
              if (lostAnswers > 0) {
                lostAnswers -= 1;
                return new Promise<RefundResult>(() => undefined);
              }
              return answer;
            },
          },
        },
        { provide: RefundTimings, useValue: { values: { providerTimeoutMs: 20_000, leaseSeconds: 150 } } },
      ],
    }).compile();
    issuer = moduleRef.get(RefundIssuer);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('pays once: the second ask carries the same key, the provider answers with the first result', async () => {
    const first = issuer.settle('refund-1', 'booking-1', PLAN);
    await jest.advanceTimersByTimeAsync(20_001);
    expect(await first).toBe('pending');
    expect(provider.issuedRefunds).toBe(1);

    // The reconciler (or a staff retry once the lease is stale) asks again with the same refund, generation and chunk.
    const second = await issuer.settle('refund-1', 'booking-1', PLAN);

    expect(second).toBe('succeeded');
    expect(provider.issuedRefunds).toBe(1);
    expect(completeRefund).toHaveBeenCalledWith('refund-1', 'succeeded', expect.stringMatching(/^mock_re_[0-9a-f]{18}$/), null, {});
  });

  it('would pay twice with a different key (the bug the key prevents): a new generation is a new refund', async () => {
    const first = issuer.settle('refund-1', 'booking-1', PLAN);
    await jest.advanceTimersByTimeAsync(20_001);
    await first;

    await issuer.settle('refund-1', 'booking-1', { ...PLAN, keyGeneration: 2 });

    expect(provider.issuedRefunds).toBe(2);
  });
});
