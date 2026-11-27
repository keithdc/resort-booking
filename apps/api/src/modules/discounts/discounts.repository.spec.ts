/**
 * @file apps/api/src/modules/discounts/discounts.repository.spec.ts
 * @feature discounts
 */

import { Test } from '@nestjs/testing';
import { Client, type PoolClient } from 'pg';
import { DatabaseService } from '../../shared/database/database.service';
import { DiscountsRepository } from './discounts.repository';

function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'd1',
    property_id: 'p1',
    label: 'Long stay',
    effect_kind: 'percent',
    effect_value: 10,
    conditions: [{ kind: 'min_nights', nights: 7 }],
    always_on: false,
    house_ids: null,
    combinable: false,
    priority: 100,
    active: true,
    max_redemptions: null,
    promoted: true,
    once_per_guest: false,
    redemptions: 0,
    ...overrides,
  };
}

describe('DiscountsRepository', () => {
  const clientQuery = jest.fn<Promise<{ rows: unknown[] }>, [string, ...unknown[]]>();
  const dbQuery = jest.fn<Promise<{ rows: unknown[]; rowCount?: number }>, [string, unknown[]?]>();
  let repository: DiscountsRepository;
  let client: PoolClient;

  beforeEach(async () => {
    jest.resetAllMocks();
    clientQuery.mockResolvedValue({ rows: [] });
    dbQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    const moduleRef = await Test.createTestingModule({
      providers: [DiscountsRepository, { provide: DatabaseService, useValue: { query: dbQuery } }],
    }).compile();
    repository = moduleRef.get(DiscountsRepository);
    client = Object.assign(new Client(), { release: (): void => undefined, query: clientQuery });
  });

  describe('replaceRedemptions (a booking\'s dates changed)', () => {
    it('removes the old booking\'s discount use, then records the new booking\'s, in the caller\'s transaction', async () => {
      await repository.replaceRedemptions(client, 'old', 'new', [{ discountId: 'd1', amountCents: 6000, emailKey: null }]);

      expect(clientQuery.mock.calls.map((call) => call[0].includes('DELETE FROM discount_redemptions'))).toEqual([true, false]);
      expect(clientQuery.mock.calls[0]?.[1]).toEqual(['old']);
      expect(clientQuery.mock.calls[1]?.[1]).toEqual(['new', ['d1'], [6000], [null]]);
    });

    it('still clears the old rows when the new booking got no discount', async () => {
      await repository.replaceRedemptions(client, 'old', 'new', []);

      expect(clientQuery).toHaveBeenCalledTimes(1);
      expect(clientQuery.mock.calls[0]?.[0]).toContain('DELETE FROM discount_redemptions');
    });

    it('records several discounts in one statement, not one per discount', async () => {
      await repository.replaceRedemptions(client, 'old', 'new', [
        { discountId: 'd1', amountCents: 100, emailKey: null },
        { discountId: 'd2', amountCents: 200, emailKey: null },
      ]);

      expect(clientQuery).toHaveBeenCalledTimes(2);
      expect(clientQuery.mock.calls[1]?.[1]).toEqual(['new', ['d1', 'd2'], [100, 200], [null, null]]);
    });
  });

  describe('once per guest', () => {
    it('reads the switch with each discount', async () => {
      dbQuery.mockResolvedValueOnce({ rows: [row({ once_per_guest: true })] });
      const found = await repository.getById('d1');
      expect(found?.oncePerGuest).toBe(true);
      expect(dbQuery.mock.calls[0]?.[0]).toContain('d.once_per_guest');
    });

    it('saves the switch on insert and on update', async () => {
      const write = {
        label: 'Welcome',
        effect: { kind: 'percent' as const, percent: 15 },
        conditions: [{ kind: 'promo_code' as const, code: 'WELCOME15' }],
        alwaysOn: false,
        houseIds: null,
        combinable: true,
        priority: 100,
        active: true,
        maxRedemptions: null,
        promoted: false,
        oncePerGuest: true,
      };
      dbQuery.mockResolvedValueOnce({ rows: [{ id: 'd1' }] }).mockResolvedValueOnce({ rows: [row()] });
      await repository.insert({ organizationId: 'o1', propertyId: 'p1' }, write);
      expect(dbQuery.mock.calls[0]?.[0]).toContain('once_per_guest');
      expect(dbQuery.mock.calls[0]?.[1]?.at(-1)).toBe(true);

      dbQuery.mockReset();
      dbQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }).mockResolvedValueOnce({ rows: [row()] });
      await repository.update('d1', { ...write, oncePerGuest: false });
      expect(dbQuery.mock.calls[0]?.[0]).toContain('once_per_guest = $13');
      expect(dbQuery.mock.calls[0]?.[1]?.at(-1)).toBe(false);
    });

    it('records the email key next to the discount, in one statement', async () => {
      const key = 'a'.repeat(64);
      await repository.recordRedemptions(client, 'b1', [
        { discountId: 'd1', amountCents: 100, emailKey: key },
        { discountId: 'd2', amountCents: 200, emailKey: null },
      ]);
      expect(clientQuery).toHaveBeenCalledTimes(1);
      expect(clientQuery.mock.calls[0]?.[0]).toContain('email_key');
      expect(clientQuery.mock.calls[0]?.[1]).toEqual(['b1', ['d1', 'd2'], [100, 200], [key, null]]);
    });

    it('asks which discounts are limited, and which a key has used outside the booking being replaced', async () => {
      clientQuery.mockResolvedValueOnce({ rows: [{ id: 'd1' }] });
      expect([...(await repository.onceOnlyIds(client, ['d1', 'd2']))]).toEqual(['d1']);
      expect(await repository.onceOnlyIds(client, [])).toEqual(new Set());

      clientQuery.mockResolvedValueOnce({ rows: [{ discount_id: 'd1' }] });
      expect([...(await repository.usedByKey(client, ['d1'], 'key', 'old'))]).toEqual(['d1']);
      expect(clientQuery.mock.calls[1]?.[0]).toContain('r.inventory_block_id <> $3::uuid');
      expect(clientQuery.mock.calls[1]?.[1]).toEqual([['d1'], 'key', 'old']);
      expect(await repository.usedByKey(client, [], 'key', null)).toEqual(new Set());
    });

    it('uses the pool, not a transaction client, for the check made before a booking is held', async () => {
      dbQuery.mockResolvedValueOnce({ rows: [] });
      await repository.usedByKey(undefined, ['d1'], 'key', null);
      expect(dbQuery).toHaveBeenCalledTimes(1);
      expect(clientQuery).not.toHaveBeenCalled();
    });

    it('reads a booking\'s email, null when it has none or was anonymised', async () => {
      clientQuery.mockResolvedValueOnce({ rows: [{ booker_email: 'ada@example.com' }] });
      expect(await repository.bookerEmailOf(client, 'b1')).toBe('ada@example.com');
      clientQuery.mockResolvedValueOnce({ rows: [{ booker_email: null }] });
      expect(await repository.bookerEmailOf(client, 'b1')).toBeNull();
      clientQuery.mockResolvedValueOnce({ rows: [{ booker_email: '  ' }] });
      expect(await repository.bookerEmailOf(client, 'b1')).toBeNull();
      clientQuery.mockResolvedValueOnce({ rows: [] });
      expect(await repository.bookerEmailOf(client, 'missing')).toBeNull();
    });
  });

  describe('promoted (show on the website)', () => {
    it('reads the choice with each discount', async () => {
      dbQuery.mockResolvedValue({ rows: [row({ promoted: true }), row({ id: 'd2', promoted: false })] });

      const found = await repository.listForProperties(['p1'], false);

      expect(found.map((discount) => discount.promoted)).toEqual([true, false]);
      expect(dbQuery.mock.calls[0]?.[0]).toContain('d.promoted');
    });

    it('lists the advertised, active discounts of one property in ONE query', async () => {
      dbQuery.mockResolvedValue({ rows: [row()] });

      const found = await repository.listPromotedForProperty('p1');

      expect(found).toHaveLength(1);
      expect(dbQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = dbQuery.mock.calls[0] ?? ['', []];
      expect(sql).toContain('d.promoted');
      expect(sql).toContain('d.active');
      expect(params).toEqual(['p1']);
    });

    it('saves the choice on insert and on update', async () => {
      dbQuery.mockResolvedValueOnce({ rows: [{ id: 'd1' }] }).mockResolvedValueOnce({ rows: [row()] });
      const write = {
        label: 'Long stay',
        effect: { kind: 'percent' as const, percent: 10 },
        conditions: [{ kind: 'min_nights' as const, nights: 7 }],
        alwaysOn: false,
        houseIds: null,
        combinable: false,
        priority: 100,
        active: true,
        maxRedemptions: null,
        promoted: true,
        oncePerGuest: false,
      };

      await repository.insert({ organizationId: 'o1', propertyId: 'p1' }, write);
      const insertParams = dbQuery.mock.calls[0]?.[1] ?? [];
      expect(dbQuery.mock.calls[0]?.[0]).toContain('promoted');
      expect(insertParams[insertParams.length - 2]).toBe(true);
      expect(insertParams[insertParams.length - 1]).toBe(false);

      dbQuery.mockReset();
      dbQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 }).mockResolvedValueOnce({ rows: [row({ promoted: false })] });
      await repository.update('d1', { ...write, promoted: false });
      const updateParams = dbQuery.mock.calls[0]?.[1] ?? [];
      expect(dbQuery.mock.calls[0]?.[0]).toContain('promoted = $12');
      expect(updateParams[updateParams.length - 2]).toBe(false);
    });
  });
});
