/**
 * @file apps/api/src/shared/tenancy/tenancy.repository.spec.ts
 * @shared One fixed, parameterized statement per resource
 */

import { Test } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import { TenancyRepository } from './tenancy.repository';
import type { TenantResource } from './tenant-scope.decorator';

const RESOURCES: TenantResource[] = ['property', 'house', 'ratePeriod', 'discount', 'extra', 'requestOption', 'booking', 'refund', 'staffUser', 'staffInvite'];

describe('TenancyRepository', () => {
  const query = jest.fn<Promise<{ rows: { n: number }[]; rowCount: number | null }>, [string, unknown[]]>();
  let repository: TenancyRepository;

  beforeEach(async () => {
    jest.resetAllMocks();
    query.mockResolvedValue({ rows: [{ n: 2 }], rowCount: 1 });
    const moduleRef = await Test.createTestingModule({
      providers: [TenancyRepository, { provide: DatabaseService, useValue: { query } }],
    }).compile();
    repository = moduleRef.get(TenancyRepository);
  });

  it.each(RESOURCES)('%s: the ownership check filters by organization_id, with the id and organization as parameters', async (resource) => {
    await repository.owns(resource, 'org-A', 'id-1');

    const sql = query.mock.calls[0]?.[0] ?? '';
    expect(sql).toContain('organization_id = $2::uuid');
    expect(sql).toContain('id = $1::uuid');
    expect(sql).not.toContain('id-1');
    expect(sql).not.toContain('org-A');
    expect(query.mock.calls[0]?.[1]).toEqual(['id-1', 'org-A']);
  });

  it.each(RESOURCES)('%s: the set check counts owned rows in one statement', async (resource) => {
    await expect(repository.countOwned(resource, 'org-A', ['a', 'b'])).resolves.toBe(2);

    const sql = query.mock.calls[0]?.[0] ?? '';
    expect(sql).toContain('= ANY($1::uuid[])');
    expect(sql).toContain('organization_id = $2::uuid');
    expect(query.mock.calls[0]?.[1]).toEqual([['a', 'b'], 'org-A']);
  });

  it('says false when no row matched, true when one did', async () => {
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
    await expect(repository.owns('house', 'org-A', 'x')).resolves.toBe(false);
    query.mockResolvedValueOnce({ rows: [{ n: 1 }], rowCount: 1 });
    await expect(repository.owns('house', 'org-A', 'x')).resolves.toBe(true);
  });

  it('a booking means a reservation, not a hold', async () => {
    await repository.owns('booking', 'org-A', 'id-1');
    await repository.countOwned('booking', 'org-A', ['id-1']);

    expect(query.mock.calls[0]?.[0]).toContain("kind = 'reservation'");
    expect(query.mock.calls[1]?.[0]).toContain("kind = 'reservation'");
  });
});
