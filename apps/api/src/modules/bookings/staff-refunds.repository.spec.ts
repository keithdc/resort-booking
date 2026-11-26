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

  it('claims only a failed refund, or an online one pending with a stale lease, and hands back the key generation', async () => {
    query.mockResolvedValueOnce({ rows: [{ key_generation: 2, attempts: 3 }], rowCount: 1 }).mockResolvedValueOnce({ rows: [], rowCount: 0 });

    expect(await repository.claimForRetry('r1', 150)).toEqual({ keyGeneration: 2, attempts: 3 });
    expect(await repository.claimForRetry('r1', 150)).toBeNull();
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("status = 'failed'");
    expect(sql).toContain("provider <> 'manual'");
    expect(sql).toContain('processing_started_at < now() - make_interval(secs => $2::int)');
    expect(sql).toContain('processing_started_at = now(), attempts = attempts + 1');
    expect(params).toEqual(['r1', 150]);
  });

  it('never claims a refund whose lease is still live (an active call blocks a retry)', async () => {
    await repository.claimForRetry('r1', 150);

    const sql = String((query.mock.calls[0] as [string])[0]);
    // The pending branch is only open for a NULL or expired lease; there is no other way in for a pending refund.
    expect(sql).toMatch(/status = 'pending' AND provider <> 'manual' AND \(processing_started_at IS NULL OR/);
  });

  it('lets the reconciler take only a PENDING online refund, never a failed one', async () => {
    query.mockResolvedValueOnce({ rows: [{ key_generation: 1, attempts: 2 }], rowCount: 1 });

    expect(await repository.claimStuck('r1', 150)).toEqual({ keyGeneration: 1, attempts: 2 });
    const sql = String((query.mock.calls[0] as [string])[0]);
    expect(sql).toContain("status = 'pending' AND provider <> 'manual'");
    expect(sql).not.toContain("'failed'");
  });

  it('finds stuck refunds: pending, online, old enough, stale lease, oldest first, limited', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'r1' }], rowCount: 1 });

    expect(await repository.findStuck(10, 150, 20)).toEqual([{ id: 'r1' }]);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("status = 'pending' AND provider <> 'manual'");
    expect(sql).toContain('updated_at < now() - make_interval(mins => $1::int)');
    expect(sql).toContain('ORDER BY updated_at ASC');
    expect(params).toEqual([10, 150, 20]);
  });

  it('leaves the refund being retried out of what the payments can still give back', async () => {
    await repository.refundablePayments('b1', 'r1');

    expect(String((query.mock.calls[0] as [string])[0])).toContain('r.id <> $2');
    expect(query.mock.calls[0]?.[1]).toEqual(['b1', 'r1']);
  });

  it('marks manual paid only while pending or failed and not leased, recording who and how', async () => {
    query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    expect(await repository.markManualPaid('r1', 'staff-1', 'Cash', 150)).toBe('paid');
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("status IN ('pending', 'failed')");
    expect(sql).toContain('processing_started_at IS NULL OR processing_started_at < now()');
    expect(params).toEqual(['r1', 150, 'Cash', 'staff-1']);
  });

  it('says busy when a provider call may still be in flight, and not_open when it is already paid', async () => {
    const row = { id: 'r1', status: 'pending' };
    query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [row], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ ...row, status: 'succeeded' }], rowCount: 1 });

    expect(await repository.markManualPaid('r1', 'staff-1', 'Cash', 150)).toBe('busy');
    expect(await repository.markManualPaid('r1', 'staff-1', 'Cash', 150)).toBe('not_open');
  });

  it('returns null for an unknown refund', async () => {
    expect(await repository.findForAction('x')).toBeNull();
    expect(await repository.getStaffRefund('x')).toBeNull();
  });

  describe('what the provider webhooks need', () => {
    const clientQuery = jest.fn();
    const client = { query: clientQuery } as never;

    beforeEach(() => {
      clientQuery.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
    });

    it('locks the refund by our id when the provider echoes it, else by the provider refund id in provider_ref', async () => {
      clientQuery.mockResolvedValueOnce({ rows: [{ id: 'r1', status: 'pending' }] });

      expect(await repository.lockByProviderRefund(client, 're_1', null)).toEqual({ id: 'r1', status: 'pending' });

      const [sql, params] = clientQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain("$1 = ANY(string_to_array(provider_ref, ','))");
      expect(sql).toContain('FOR UPDATE');
      expect(params).toEqual(['re_1', null]);
    });

    it('returns null when no refund matches', async () => {
      expect(await repository.lockByProviderRefund(client, 're_x', null)).toBeNull();
    });

    it('settles a pending or failed refund as succeeded, keeping a provider reference it already has', async () => {
      clientQuery.mockResolvedValueOnce({ rowCount: 1 });

      expect(await repository.settleFromProvider(client, 'r1', 'succeeded', 're_1', null)).toBe(true);

      const [sql] = clientQuery.mock.calls[0] as [string];
      expect(sql).toContain("status IN ('pending', 'failed')");
      expect(sql).toContain("CASE WHEN provider_ref = '' THEN $2 ELSE provider_ref END");
      expect(sql).toContain('processing_started_at = NULL');
    });

    it('fails only a PENDING refund, raises the key generation and never says more than a short code', async () => {
      clientQuery.mockResolvedValueOnce({ rowCount: 1 });

      expect(await repository.settleFromProvider(client, 'r1', 'failed', 're_1', 'lost_or_stolen_card')).toBe(true);

      const [sql, params] = clientQuery.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain("status = 'pending'");
      expect(sql).not.toContain("'succeeded'");
      expect(sql).toContain('key_generation = key_generation + 1');
      expect(params).toEqual(['r1', 'The provider reported the refund as failed (lost_or_stolen_card)']);
    });

    it('says false when nothing changed', async () => {
      expect(await repository.settleFromProvider(client, 'r1', 'failed', 're_1', null)).toBe(false);
    });
  });
});
