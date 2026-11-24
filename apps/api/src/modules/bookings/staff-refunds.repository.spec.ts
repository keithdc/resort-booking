/**
 * @file apps/api/src/modules/bookings/staff-refunds.repository.spec.ts
 * @feature bookings
 * @dependencies StaffRefundsRepository
 */

import { Test } from '@nestjs/testing';
import { DatabaseService } from '../../shared/database/database.service';
import { StaffRefundsRepository } from './staff-refunds.repository';

describe('StaffRefundsRepository', () => {
  const query = jest.fn();
  let repository: StaffRefundsRepository;

  beforeEach(async (): Promise<void> => {
    query.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
    const moduleRef = await Test.createTestingModule({
      providers: [StaffRefundsRepository, { provide: DatabaseService, useValue: { query } }],
    }).compile();
    repository = moduleRef.get(StaffRefundsRepository);
  });

  it('lists with ONE joined, organization-scoped query, newest first', async () => {
    await repository.list('org', ['pending', 'failed'], null);

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('r.organization_id = $1');
    expect(sql).toContain('ORDER BY r.created_at DESC');
    expect(params).toEqual(['org', ['pending', 'failed'], null]);
  });

  it('passes null for "all statuses" and the property filter through', async () => {
    await repository.list('org', null, 'prop');

    expect(query.mock.calls[0]?.[1]).toEqual(['org', null, 'prop']);
  });

  it('claims only a failed refund, or an online one stuck pending, and reports whether it won', async () => {
    query.mockResolvedValueOnce({ rows: [], rowCount: 1 }).mockResolvedValueOnce({ rows: [], rowCount: 0 });

    expect(await repository.claimForRetry('r1')).toBe(true);
    expect(await repository.claimForRetry('r1')).toBe(false);
    const sql = String((query.mock.calls[0] as [string])[0]);
    expect(sql).toContain("status = 'failed'");
    expect(sql).toContain("provider <> 'manual'");
  });

  it('leaves the refund being retried out of what the payments can still give back', async () => {
    await repository.refundablePayments('b1', 'r1');

    expect(String((query.mock.calls[0] as [string])[0])).toContain('r.id <> $2');
    expect(query.mock.calls[0]?.[1]).toEqual(['b1', 'r1']);
  });

  it('marks manual paid only while pending or failed, recording who and how', async () => {
    query.mockResolvedValueOnce({ rows: [], rowCount: 1 }).mockResolvedValueOnce({ rows: [], rowCount: 0 });

    expect(await repository.markManualPaid('r1', 'staff-1', 'Cash')).toBe(true);
    expect(await repository.markManualPaid('r1', 'staff-1', 'Cash')).toBe(false);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("status IN ('pending', 'failed')");
    expect(params).toEqual(['r1', 'staff-1', 'Cash']);
  });

  it('returns null for an unknown refund', async () => {
    expect(await repository.findForAction('x')).toBeNull();
    expect(await repository.getStaffRefund('x')).toBeNull();
  });
});
