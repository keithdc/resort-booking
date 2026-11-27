/**
 * @file apps/api/src/modules/bookings/staff-refunds.service.spec.ts
 * @feature bookings
 * @dependencies StaffRefundsService
 */

import { ConflictException, NotFoundException } from '@nestjs/common';
import type { RefundStatus, StaffProfile, StaffRefund } from '@resort-booking/shared-types';
import type { PoolClient } from 'pg';
import { AuditService } from '../../shared/audit/audit.service';
import type { StaffAccount } from '../../shared/roles/staff-role';
import { Test } from '@nestjs/testing';
import { PaymentsService } from '../payments/payments.service';
import { BookingsRepository } from './bookings.repository';
import { RefundIssuer, type RefundPlan } from './refund-issuer';
import { RefundTimings } from './refund-timings';
import { StaffRefundsRepository, type ManualPaidOutcome, type RefundActionRow, type RefundClaim } from './staff-refunds.repository';
import { StaffRefundsService, statusesFor } from './staff-refunds.service';

const STAFF: StaffProfile = { id: 'staff-1', organizationId: 'org', fullName: 'Sam', email: 's@example.com' };
const STAFF_ACCOUNT: StaffAccount = { ...STAFF, role: 'employee', organizationName: 'Humphreys', canManageRefunds: true };

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
    key_generation: 1,
    processing_started_at: null,
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
  const claimForRetry = jest.fn<Promise<RefundClaim | null>, [string, number]>();
  const refundablePayments = jest.fn();
  const markManualPaid = jest.fn<Promise<ManualPaidOutcome>, [string, string, string, number, ((client: PoolClient) => Promise<void>)?]>();
  const recordInTransaction = jest.fn<Promise<void>, [PoolClient, { organizationId: string; staffUserId: string }, string, Record<string, unknown>?]>();
  const settle = jest.fn<Promise<RefundStatus>, [string, string, RefundPlan]>();
  const completeRefund = jest.fn();
  let service: StaffRefundsService;

  beforeEach(async (): Promise<void> => {
    jest.resetAllMocks();
    findForAction.mockResolvedValue(action());
    claimForRetry.mockResolvedValue({ keyGeneration: 1, attempts: 1 });
    refundablePayments.mockResolvedValue([{ id: 'p1', provider: 'mock', providerRef: 'mock_pi', refundableCents: 5000 }]);
    getStaffRefund.mockResolvedValue({ id: 'r1', status: 'succeeded' } as StaffRefund);
    markManualPaid.mockResolvedValue('paid');
    recordInTransaction.mockResolvedValue(undefined);
    settle.mockResolvedValue('succeeded');
    const moduleRef = await Test.createTestingModule({
      providers: [
        StaffRefundsService,
        { provide: StaffRefundsRepository, useValue: { list, getStaffRefund, findForAction, claimForRetry, refundablePayments, markManualPaid } },
        { provide: RefundIssuer, useValue: { settle } },
        { provide: BookingsRepository, useValue: { completeRefund } },
        { provide: PaymentsService, useValue: { describeProvider: () => ({ name: 'mock', simulated: true }) } },
        { provide: RefundTimings, useValue: { values: { leaseSeconds: 150 } } },
        { provide: AuditService, useValue: { recordInTransaction } },
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
      expect(claimForRetry).toHaveBeenCalledWith('r1', 150);
      expect(settle).toHaveBeenCalledWith('r1', 'b1', expect.objectContaining({ amountCents: 5000, viaProvider: true, provider: 'mock', keyGeneration: 1 }));
      expect(refund).toEqual({ id: 'r1', status: 'succeeded' });
    });

    it('sends the key generation the claim handed back, so a retry after a definitive refusal uses a fresh key', async () => {
      claimForRetry.mockResolvedValue({ keyGeneration: 3, attempts: 4 });

      await service.retry(STAFF, 'r1');

      expect(settle).toHaveBeenCalledWith('r1', 'b1', expect.objectContaining({ keyGeneration: 3 }));
    });

    it('can retry a refund left pending (an unknown outcome) once its lease is stale, with the same generation', async () => {
      findForAction.mockResolvedValue(action({ status: 'pending' }));

      await service.retry(STAFF, 'r1');

      expect(settle).toHaveBeenCalledWith('r1', 'b1', expect.objectContaining({ keyGeneration: 1 }));
    });

    it('is double-click safe: when the claim is lost the provider is never called', async () => {
      claimForRetry.mockResolvedValue(null);

      await expect(service.retry(STAFF, 'r1')).rejects.toMatchObject({ response: { code: 'REFUND_NOT_RETRYABLE', message: expect.stringContaining('already being processed') } });
      expect(settle).not.toHaveBeenCalled();
    });

    it('refuses a refund staff must send by hand', async () => {
      findForAction.mockResolvedValue(action({ status: 'pending', provider: 'manual' }));

      await expect(service.retry(STAFF, 'r1')).rejects.toMatchObject({ response: { code: 'REFUND_NOT_RETRYABLE' } });
      expect(claimForRetry).not.toHaveBeenCalled();
    });

    it('hands the repository an audit writer for the SAME transaction: who, the booking reference, the amount and reason, never the note', async () => {
      findForAction.mockResolvedValue(action({ status: 'failed' }));
      const client = Object.create(null) as PoolClient;
      markManualPaid.mockImplementation(async (_id, _staff, _note, _lease, audit) => {
        await audit?.(client);
        return 'paid';
      });

      await service.markPaid(STAFF_ACCOUNT, 'r1', 'bank transfer FR76 secret');

      expect(recordInTransaction).toHaveBeenCalledTimes(1);
      const [usedClient, actor, auditAction, details] = recordInTransaction.mock.calls[0] ?? [];
      expect(usedClient).toBe(client);
      expect(actor).toEqual({ organizationId: 'org', staffUserId: 'staff-1' });
      expect(auditAction).toBe('refund.marked_paid');
      expect(details).toMatchObject({ targetType: 'refund', targetId: 'r1', metadata: { actorRole: 'employee', viaRefundAccess: true, refundStatus: 'succeeded', bookingReference: expect.stringMatching(/^BK-/) } });
      expect(JSON.stringify(details)).not.toContain('FR76');
    });

    it('does not mark the refund paid when the audit row cannot be written', async () => {
      findForAction.mockResolvedValue(action({ status: 'pending' }));
      recordInTransaction.mockRejectedValue(new Error('audit insert failed'));
      markManualPaid.mockImplementation(async (_id, _staff, _note, _lease, audit) => {
        await audit?.(Object.create(null) as PoolClient);
        return 'paid';
      });

      await expect(service.markPaid(STAFF_ACCOUNT, 'r1', 'abc')).rejects.toThrow('audit insert failed');
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

      await service.markPaid(STAFF_ACCOUNT, 'r1', 'Bank transfer 12 May');

      expect(markManualPaid).toHaveBeenCalledWith('r1', 'staff-1', 'Bank transfer 12 May', 150, expect.any(Function));
    });

    it('refuses a refund that is already paid', async () => {
      findForAction.mockResolvedValue(action({ status: 'succeeded' }));

      await expect(service.markPaid(STAFF_ACCOUNT, 'r1', 'abc')).rejects.toMatchObject({ response: { code: 'REFUND_ALREADY_SETTLED' } });
      expect(markManualPaid).not.toHaveBeenCalled();
    });

    it('refuses when it was settled between the read and the write', async () => {
      markManualPaid.mockResolvedValue('not_open');

      await expect(service.markPaid(STAFF_ACCOUNT, 'r1', 'abc')).rejects.toMatchObject({ response: { code: 'REFUND_ALREADY_SETTLED' } });
    });

    it('refuses while the provider is still working on the refund, so the guest cannot be paid twice', async () => {
      markManualPaid.mockResolvedValue('busy');

      await expect(service.markPaid(STAFF_ACCOUNT, 'r1', 'abc')).rejects.toMatchObject({ response: { code: 'REFUND_BEING_PROCESSED' } });
    });

    it('404s for another organization', async () => {
      findForAction.mockResolvedValue(action({ organization_id: 'other' }));

      await expect(service.markPaid(STAFF_ACCOUNT, 'r1', 'abc')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
