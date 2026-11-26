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

describe('InventoryRepository.insertStaffBooking', () => {
  const INPUT = {
    organizationId: 'org', propertyId: 'prop', houseId: 'house', checkIn: '2027-08-01', checkOut: '2027-08-04', guestCount: 2,
    bookerName: 'Ada', bookerEmail: 'ada@example.com', bookerPhone: '', guestNote: '', totalCents: 96000, currencyCode: 'EUR',
    priceSnapshot: '{}', policySnapshot: '{}', createdByStaffId: 'staff-1',
  };

  async function repositoryWith(clientQuery: jest.Mock): Promise<InventoryRepository> {
    const moduleRef = await Test.createTestingModule({
      providers: [InventoryRepository, { provide: DatabaseService, useValue: { query: jest.fn() } }],
    }).compile();
    void clientQuery;
    return moduleRef.get(InventoryRepository);
  }

  it('writes a confirmed reservation that is pending, unpaid, never expires and was made by that staff member', async () => {
    const clientQuery = jest.fn().mockResolvedValue({ rows: [{ id: 'new-1' }] });
    const repository = await repositoryWith(clientQuery);

    const id = await repository.insertStaffBooking({ query: clientQuery } as never, INPUT);

    expect(id).toBe('new-1');
    const [sql, params] = clientQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("'reservation', 'confirmed'");
    expect(sql).toContain("'pay_at_hotel', 'pending', NULL");
    expect(sql).toMatch(/total_cents, paid_cents/);
    expect(sql).toContain('$11, 0, $12');
    expect(sql).not.toContain('terms_accepted_at');
    expect(params).toHaveLength(15);
    expect(params[14]).toBe('staff-1');
    // The guest's text only ever travels as a parameter.
    expect(sql).not.toContain('ada@example.com');
  });

  it('fails loudly if nothing came back', async () => {
    const clientQuery = jest.fn().mockResolvedValue({ rows: [] });
    const repository = await repositoryWith(clientQuery);

    await expect(repository.insertStaffBooking({ query: clientQuery } as never, INPUT)).rejects.toThrow('no row');
  });
});
