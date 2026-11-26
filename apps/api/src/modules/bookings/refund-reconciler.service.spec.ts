/**
 * @file apps/api/src/modules/bookings/refund-reconciler.service.spec.ts
 * @feature bookings
 */

import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { RefundStatus } from '@resort-booking/shared-types';
import { AuditService } from '../../shared/audit/audit.service';
import type { AuditEntry } from '../../shared/audit/audit.types';
import { DatabaseService } from '../../shared/database/database.service';
import { PaymentsService } from '../payments/payments.service';
import { BookingsRepository } from './bookings.repository';
import { RefundIssuer, type RefundPlan } from './refund-issuer';
import { REFUND_RECONCILER_LOCK_KEY, RefundReconcilerService } from './refund-reconciler.service';
import { RefundTimings, type RefundTimingValues } from './refund-timings';
import { StaffRefundsRepository, type RefundClaim, type StuckRefund } from './staff-refunds.repository';

const VALUES: RefundTimingValues = {
  providerTimeoutMs: 20_000,
  leaseSeconds: 150,
  reconcilerEnabled: true,
  reconcileAfterMinutes: 10,
  maxReconcileAttempts: 5,
  reconcileBatchSize: 20,
};

function stuck(id: string, overrides: Partial<StuckRefund> = {}): StuckRefund {
  return {
    id,
    organization_id: 'org',
    inventory_block_id: `block-${id}`,
    amount_cents: 5000,
    percent: 50,
    currency_code: 'EUR',
    reason: 'Guest cancelled online',
    attempts: 1,
    age_minutes: 14,
    ...overrides,
  };
}

const COVERING = [{ id: 'p1', provider: 'mock', providerRef: 'mock_pi_1', refundableCents: 5000 }];

describe('RefundReconcilerService', () => {
  const findStuck = jest.fn<Promise<StuckRefund[]>, [number, number, number]>();
  const claimStuck = jest.fn<Promise<RefundClaim | null>, [string, number]>();
  const refundablePayments = jest.fn();
  const settle = jest.fn<Promise<RefundStatus>, [string, string, RefundPlan]>();
  const completeRefund = jest.fn();
  const record = jest.fn<Promise<boolean>, [AuditEntry]>();
  const lockHeld = { value: false };
  const clientQuery = jest.fn();
  let timings: { values: RefundTimingValues };
  let service: RefundReconcilerService;
  let errorLog: jest.SpyInstance;

  async function build(): Promise<RefundReconcilerService> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        RefundReconcilerService,
        { provide: StaffRefundsRepository, useValue: { findStuck, claimStuck, refundablePayments } },
        { provide: RefundIssuer, useValue: { settle } },
        { provide: BookingsRepository, useValue: { completeRefund } },
        { provide: PaymentsService, useValue: { describeProvider: () => ({ name: 'mock', simulated: true }) } },
        { provide: AuditService, useValue: { record } },
        {
          provide: DatabaseService,
          useValue: { withClient: (fn: (client: { query: typeof clientQuery }) => Promise<unknown>): Promise<unknown> => fn({ query: clientQuery }) },
        },
        { provide: RefundTimings, useValue: timings },
      ],
    }).compile();
    return moduleRef.get(RefundReconcilerService);
  }

  beforeEach(async () => {
    jest.resetAllMocks();
    errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation((): void => undefined);
    timings = { values: { ...VALUES } };
    lockHeld.value = false;
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('pg_try_advisory_lock')) {
        const got = !lockHeld.value;
        lockHeld.value = true;
        return { rows: [{ locked: got }] };
      }
      lockHeld.value = false;
      return { rows: [] };
    });
    findStuck.mockResolvedValue([stuck('r1')]);
    claimStuck.mockResolvedValue({ keyGeneration: 1, attempts: 2 });
    refundablePayments.mockResolvedValue(COVERING);
    settle.mockResolvedValue('succeeded');
    completeRefund.mockResolvedValue(true);
    record.mockResolvedValue(true);
    service = await build();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does nothing at all when switched off (REFUND_RECONCILER_ENABLED=false)', async () => {
    timings.values.reconcilerEnabled = false;

    await expect(service.sweep()).resolves.toEqual({ skipped: true, items: [] });

    expect(clientQuery).not.toHaveBeenCalled();
    expect(findStuck).not.toHaveBeenCalled();
  });

  it('looks for refunds older than the threshold with a stale lease, in a batch', async () => {
    await service.sweep();

    expect(findStuck).toHaveBeenCalledWith(10, 150, 20);
  });

  it('asks the provider again with the SAME key generation and records the truth, with an ERROR line and an audit entry', async () => {
    const summary = await service.sweep();

    expect(summary.items).toEqual([{ refundId: 'r1', outcome: 'succeeded' }]);
    expect(claimStuck).toHaveBeenCalledWith('r1', 150);
    expect(settle).toHaveBeenCalledWith(
      'r1',
      'block-r1',
      expect.objectContaining({ keyGeneration: 1, amountCents: 5000, viaProvider: true, chunks: [expect.objectContaining({ providerRef: 'mock_pi_1', amountCents: 5000 })] }),
    );
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('Refund r1 was pending for 14 minutes and was reconciled: succeeded'));
    expect(record).toHaveBeenCalledWith({
      organizationId: 'org',
      staffUserId: null,
      action: 'refund.reconciled',
      targetType: 'refund',
      targetId: 'r1',
      metadata: { outcome: 'succeeded', attempts: 2, ageMinutes: 14, source: 'reconciler' },
    });
  });

  it('records a refund the provider refuses as failed, flagged for staff', async () => {
    settle.mockResolvedValue('failed');

    const summary = await service.sweep();

    expect(summary.items[0]?.outcome).toBe('failed');
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('Staff attention needed'));
  });

  it('leaves a refund pending when the provider is still silent, until the attempts run out', async () => {
    settle.mockResolvedValue('pending');
    claimStuck.mockResolvedValue({ keyGeneration: 1, attempts: 4 });

    expect((await service.sweep()).items[0]?.outcome).toBe('still_pending');
    expect(completeRefund).not.toHaveBeenCalled();
  });

  it('marks it failed for staff, without raising the key generation, after the last attempt, with a clear reason', async () => {
    settle.mockResolvedValue('pending');
    claimStuck.mockResolvedValue({ keyGeneration: 1, attempts: 5 });

    expect((await service.sweep()).items[0]?.outcome).toBe('gave_up');

    expect(completeRefund).toHaveBeenCalledWith('r1', 'failed', '', expect.stringContaining('no clear answer after 5 tries'));
    expect(completeRefund.mock.calls[0]).toHaveLength(4);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ outcome: 'gave_up' }) }));
  });

  it('fails a refund the online payments can no longer cover, without calling the provider', async () => {
    refundablePayments.mockResolvedValue([{ id: 'p1', provider: 'mock', providerRef: 'x', refundableCents: 100 }]);

    expect((await service.sweep()).items[0]?.outcome).toBe('failed');

    expect(settle).not.toHaveBeenCalled();
    expect(completeRefund).toHaveBeenCalledWith('r1', 'failed', '', expect.stringContaining('can no longer cover'));
  });

  it('skips a refund somebody else took first (lease lost): the provider is not called', async () => {
    claimStuck.mockResolvedValue(null);

    expect((await service.sweep()).items).toEqual([{ refundId: 'r1', outcome: 'skipped' }]);

    expect(settle).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('survives one broken refund and still reconciles the next', async () => {
    findStuck.mockResolvedValue([stuck('r1'), stuck('r2')]);
    claimStuck.mockRejectedValueOnce(new Error('db blip'));

    const summary = await service.sweep();

    expect(summary.items).toEqual([
      { refundId: 'r1', outcome: 'skipped' },
      { refundId: 'r2', outcome: 'succeeded' },
    ]);
  });

  it('does not reconcile when another instance holds the advisory lock, and two sweeps never overlap', async () => {
    let release: () => void = (): void => undefined;
    settle.mockImplementation(() => new Promise<RefundStatus>((resolve) => { release = (): void => resolve('succeeded'); }));

    const first = service.sweep();
    await new Promise((resolve) => setImmediate(resolve));
    const second = await service.sweep();
    release();
    const firstSummary = await first;

    expect(second).toEqual({ skipped: true, items: [] });
    expect(firstSummary.items).toEqual([{ refundId: 'r1', outcome: 'succeeded' }]);
    expect(findStuck).toHaveBeenCalledTimes(1);
  });

  it('uses one fixed advisory lock key and releases it afterwards, even when the batch throws', async () => {
    findStuck.mockRejectedValue(new Error('db down'));

    const summary = await service.sweep();

    expect(summary).toEqual({ skipped: true, items: [] });
    expect(clientQuery).toHaveBeenCalledWith('SELECT pg_try_advisory_lock($1) AS locked', [REFUND_RECONCILER_LOCK_KEY]);
    expect(clientQuery).toHaveBeenCalledWith('SELECT pg_advisory_unlock($1)', [REFUND_RECONCILER_LOCK_KEY]);
    expect(lockHeld.value).toBe(false);
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('reconciliation failed'), expect.anything());
  });

  it('never throws, even when it cannot reach the database at all', async () => {
    jest.restoreAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation((): void => undefined);
    const broken = await Test.createTestingModule({
      providers: [
        RefundReconcilerService,
        { provide: StaffRefundsRepository, useValue: {} },
        { provide: RefundIssuer, useValue: {} },
        { provide: BookingsRepository, useValue: {} },
        { provide: PaymentsService, useValue: {} },
        { provide: AuditService, useValue: {} },
        { provide: DatabaseService, useValue: { withClient: (): Promise<never> => Promise.reject(new Error('no connection')) } },
        { provide: RefundTimings, useValue: timings },
      ],
    }).compile();

    await expect(broken.get(RefundReconcilerService).sweep()).resolves.toEqual({ skipped: true, items: [] });
  });
});
