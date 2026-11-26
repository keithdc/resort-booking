/**
 * @file apps/api/src/modules/inventory/inventory.repository.spec.ts
 * @feature inventory
 */

import { Test } from '@nestjs/testing';
import { DatabaseService } from '../../shared/database/database.service';
import { InventoryRepository } from './inventory.repository';

describe('InventoryRepository.listOccupiedRanges', () => {
  const query = jest.fn<Promise<{ rows: unknown[] }>, [string, ...unknown[]]>();
  let repository: InventoryRepository;

  beforeEach(async () => {
    jest.resetAllMocks();
    query.mockResolvedValue({ rows: [] });
    const moduleRef = await Test.createTestingModule({
      providers: [InventoryRepository, { provide: DatabaseService, useValue: { query } }],
    }).compile();
    repository = moduleRef.get(InventoryRepository);
  });

  it('reads many houses in ONE statement', async () => {
    await repository.listOccupiedRanges(['h1', 'h2', 'h3'], '2027-06-01', '2028-06-01');

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain('house_id = ANY($1::uuid[])');
    expect(query.mock.calls[0]?.[1]).toEqual([['h1', 'h2', 'h3'], '2027-06-01', '2028-06-01', null]);
  });

  it('leaves one booking out when asked, so a guest changing dates sees their own nights as free', async () => {
    await repository.listOccupiedRanges(['h1'], '2027-06-01', '2028-06-01', 'booking-1');

    expect(query.mock.calls[0]?.[0]).toContain('($4::uuid IS NULL OR id <> $4)');
    expect(query.mock.calls[0]?.[1]).toEqual([['h1'], '2027-06-01', '2028-06-01', 'booking-1']);
  });

  it('ignores holds that already timed out, without writing anything', async () => {
    await repository.listOccupiedRanges(['h1'], '2027-06-01', '2028-06-01');

    expect(query.mock.calls[0]?.[0]).toContain("kind = 'hold' AND expires_at IS NOT NULL AND expires_at < now()");
  });

  it('does not query at all for no houses', async () => {
    await expect(repository.listOccupiedRanges([], '2027-06-01', '2028-06-01')).resolves.toEqual([]);

    expect(query).not.toHaveBeenCalled();
  });
});

describe('InventoryRepository.countActiveHolds', () => {
  const query = jest.fn<Promise<{ rows: unknown[] }>, [string, ...unknown[]]>();
  let repository: InventoryRepository;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [InventoryRepository, { provide: DatabaseService, useValue: { query } }],
    }).compile();
    repository = moduleRef.get(InventoryRepository);
  });

  it('counts both callers in ONE statement, case-insensitive on the email', async () => {
    query.mockResolvedValue({ rows: [{ by_email: 2, by_ip: 4 }] });

    await expect(repository.countActiveHolds('  Ada@Example.com ', 'iphash')).resolves.toEqual({ byEmail: 2, byIp: 4 });

    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain('lower(booker_email) = lower($1)');
    expect(query.mock.calls[0]?.[1]).toEqual(['Ada@Example.com', 'iphash']);
  });

  it('only counts live unpaid holds: not expired, not paid, not reservations', async () => {
    query.mockResolvedValue({ rows: [] });

    await repository.countActiveHolds('a@b.co', null);

    const sql = query.mock.calls[0]?.[0] ?? '';
    expect(sql).toContain("kind = 'hold'");
    expect(sql).toContain("status = 'active'");
    expect(sql).toContain('expires_at > now()');
  });

  it('treats an unknown IP as no IP count and no rows as zero', async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(repository.countActiveHolds('a@b.co', null)).resolves.toEqual({ byEmail: 0, byIp: 0 });
    expect(query.mock.calls[0]?.[1]).toEqual(['a@b.co', null]);
  });
});
