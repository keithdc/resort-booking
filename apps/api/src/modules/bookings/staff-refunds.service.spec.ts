/**
 * @file apps/api/src/modules/bookings/staff-refunds.service.spec.ts
 * @feature bookings
 * @dependencies StaffRefundsService
 */

import { ConflictException, NotFoundException } from '@nestjs/common';
import type { StaffProfile, StaffRefund } from '@resort-booking/shared-types';
import { Test } from '@nestjs/testing';
import { PaymentsService } from '../payments/payments.service';
import { BookingsRepository } from './bookings.repository';
import { RefundIssuer, type RefundPlan } from './refund-issuer';
import { StaffRefundsRepository, type RefundActionRow } from './staff-refunds.repository';
import { StaffRefundsService, statusesFor } from './staff-refunds.service';

const STAFF: StaffProfile = { id: 'staff-1', organizationId: 'org', fullName: 'Sam', email: 's@example.com' };

function action(overrides: Partial<RefundActionRow> = {}): RefundActionRow {
  return {
    id: 'r1',
    organization_id: 'org',
    inventory_block_id: 'b1',
    status: 'failed',
    provider: 'mock',
    amount_cents: 5000,
    percent: 50,
    currency_code: 'EUR',
    reason: 'Guest cancelled',
    ...overrides,
  };
}

describe('statusesFor', () => {
  it.each([
    ['needs_attention', ['pending', 'failed']],
    ['pending', ['pending']],
    ['failed', ['failed']],
    ['succeeded', ['succeeded']],
    ['all', null],
  ] as const)('%s', (filter, expected) => {
    expect(statusesFor(filter)).toEqual(expected);
  });
});

describe('StaffRefundsService', () => {
  const list = jest.fn();
  const getStaffRefund = jest.fn<Promise<StaffRefund | null>, [string]>();
  const findForAction = jest.fn<Promise<RefundActionRow | null>, [string]>();
  const claimForRetry = jest.fn<Promise<boolean>, [string]>();
  const refundablePayments = jest.fn();
  const markManualPaid = jest.fn<Promise<boolean>, [string, string, string]>();
  const settle = jest.fn<Promise<'succeeded' | 'failed'>, [string, string, RefundPlan]>();
  const completeRefund = jest.fn();
  let service: StaffRefundsService;

  beforeEach(async (): Promise<void> => {
    jest.resetAllMocks();
    findForAction.mockResolvedValue(action());
    claimForRetry.mockResolvedValue(true);
    refundablePayments.mockResolvedValue([{ id: 'p1', provider: 'mock', providerRef: 'mock_pi', refundableCents: 5000 }]);
    getStaffRefund.mockResolvedValue({ id: 'r1', status: 'succeeded' } as StaffRefund);
    markManualPaid.mockResolvedValue(true);
    settle.mockResolvedValue('succeeded');
    const moduleRef = await Test.createTestingModule({
      providers: [
        StaffRefundsService,
        { provide: StaffRefundsRepository, useValue: { list, getStaffRefund, findForAction, claimForRetry, refundablePayments, markManualPaid } },
        { provide: RefundIssuer, useValue: { settle } },
        { provide: BookingsRepository, useValue: { completeRefund } },
        { provide: PaymentsService, useValue: { describeProvider: () => ({ name: 'mock', simulated: true }) } },
      ],
    }).compile();
    service = moduleRef.get(StaffRefundsService);
  });

  it('lists the staff member\'s organization only, by filter and property, in one call', async () => {
    list.mockResolvedValue([]);

    await service.list(STAFF, 'failed', 'prop');

    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith('org', ['failed'], 'prop');
  });

  describe('retry', () => {
    it('claims the refund first, then asks the provider and returns the refund as it now stands', async () => {
      const refund = await service.retry(STAFF, 'r1');

      expect(claimForRetry.mock.invocationCallOrder[0]).toBeLessThan(settle.mock.invocationCallOrder[0] ?? 0);
      expect(refundablePayments).toHaveBeenCalledWith('b1', 'r1');
      expect(settle).toHaveBeenCalledWith('r1', 'b1', expect.objectContaining({ amountCents: 5000, viaProvider: true, provider: 'mock' }));
      expect(refund).toEqual({ id: 'r1', status: 'succeeded' });
    });

    it('is double-click safe: when the claim is lost the provider is never called', async () => {
      claimForRetry.mockResolvedValue(false);

      await expect(service.retry(STAFF, 'r1')).rejects.toMatchObject({ response: { code: 'REFUND_NOT_RETRYABLE' } });
      expect(settle).not.toHaveBeenCalled();
    });

    it('refuses a refund staff must send by hand', async () => {
      findForAction.mockResolvedValue(action({ status: 'pending', provider: 'manual' }));

      await expect(service.retry(STAFF, 'r1')).rejects.toMatchObject({ response: { code: 'REFUND_NOT_RETRYABLE' } });
      expect(claimForRetry).not.toHaveBeenCalled();
    });

    it('refuses a refund that is already paid', async () => {
      findForAction.mockResolvedValue(action({ status: 'succeeded' }));

      await expect(service.retry(STAFF, 'r1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('puts the refund back to failed when the online payments can no longer cover it', async () => {
      refundablePayments.mockResolvedValue([{ id: 'p1', provider: 'mock', providerRef: 'x', refundableCents: 1000 }]);

      await expect(service.retry(STAFF, 'r1')).rejects.toMatchObject({ response: { code: 'REFUND_NOT_RETRYABLE' } });
      expect(completeRefund).toHaveBeenCalledWith('r1', 'failed', '', expect.any(String));
      expect(settle).not.toHaveBeenCalled();
    });

    it('puts the refund back to failed when the money was taken by a payment of another provider', async () => {
      refundablePayments.mockResolvedValue([{ id: 'p1', provider: 'manual', providerRef: 'manual_1', refundableCents: 5000 }]);

      await expect(service.retry(STAFF, 'r1')).rejects.toMatchObject({ response: { code: 'REFUND_NOT_RETRYABLE' } });
      expect(settle).not.toHaveBeenCalled();
    });

    it('404s for another organization\'s refund and for an unknown one', async () => {
      findForAction.mockResolvedValue(action({ organization_id: 'other' }));
      await expect(service.retry(STAFF, 'r1')).rejects.toBeInstanceOf(NotFoundException);

      findForAction.mockResolvedValue(null);
      await expect(service.retry(STAFF, 'r1')).rejects.toMatchObject({ response: { code: 'REFUND_NOT_FOUND' } });
    });
  });

  describe('markPaid', () => {
    it.each(['pending', 'failed'] as const)('settles a %s refund with who and how', async (status) => {
      findForAction.mockResolvedValue(action({ status }));

      await service.markPaid(STAFF, 'r1', 'Bank transfer 12 May');

      expect(markManualPaid).toHaveBeenCalledWith('r1', 'staff-1', 'Bank transfer 12 May');
    });

    it('refuses a refund that is already paid', async () => {
      findForAction.mockResolvedValue(action({ status: 'succeeded' }));

      await expect(service.markPaid(STAFF, 'r1', 'abc')).rejects.toMatchObject({ response: { code: 'REFUND_ALREADY_SETTLED' } });
      expect(markManualPaid).not.toHaveBeenCalled();
    });

    it('refuses when it was settled between the read and the write', async () => {
      markManualPaid.mockResolvedValue(false);

      await expect(service.markPaid(STAFF, 'r1', 'abc')).rejects.toMatchObject({ response: { code: 'REFUND_ALREADY_SETTLED' } });
    });

    it('404s for another organization', async () => {
      findForAction.mockResolvedValue(action({ organization_id: 'other' }));

      await expect(service.markPaid(STAFF, 'r1', 'abc')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
