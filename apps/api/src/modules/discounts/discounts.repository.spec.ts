/**
 * @file apps/api/src/modules/discounts/discounts.repository.spec.ts
 * @feature discounts
 */

import { Test } from '@nestjs/testing';
import { Client, type PoolClient } from 'pg';
import { DatabaseService } from '../../shared/database/database.service';
import { DiscountsRepository } from './discounts.repository';

describe('DiscountsRepository', () => {
  const clientQuery = jest.fn<Promise<{ rows: unknown[] }>, [string, ...unknown[]]>();
  let repository: DiscountsRepository;
  let client: PoolClient;

  beforeEach(async () => {
    jest.resetAllMocks();
    clientQuery.mockResolvedValue({ rows: [] });
    const moduleRef = await Test.createTestingModule({
      providers: [DiscountsRepository, { provide: DatabaseService, useValue: { query: jest.fn() } }],
    }).compile();
    repository = moduleRef.get(DiscountsRepository);
    client = Object.assign(new Client(), { release: (): void => undefined, query: clientQuery });
  });

  describe('replaceRedemptions (a booking\'s dates changed)', () => {
    it('removes the old booking\'s discount use, then records the new booking\'s, in the caller\'s transaction', async () => {
      await repository.replaceRedemptions(client, 'old', 'new', [{ discountId: 'd1', label: 'Long stay', amountCents: 6000 }]);

      expect(clientQuery.mock.calls.map((call) => call[0].includes('DELETE FROM discount_redemptions'))).toEqual([true, false]);
      expect(clientQuery.mock.calls[0]?.[1]).toEqual(['old']);
      expect(clientQuery.mock.calls[1]?.[1]).toEqual(['new', ['d1'], [6000]]);
    });

    it('still clears the old rows when the new booking got no discount', async () => {
      await repository.replaceRedemptions(client, 'old', 'new', []);

      expect(clientQuery).toHaveBeenCalledTimes(1);
      expect(clientQuery.mock.calls[0]?.[0]).toContain('DELETE FROM discount_redemptions');
    });

    it('records several discounts in one statement, not one per discount', async () => {
      await repository.replaceRedemptions(client, 'old', 'new', [
        { discountId: 'd1', label: 'A', amountCents: 100 },
        { discountId: 'd2', label: 'B', amountCents: 200 },
      ]);

      expect(clientQuery).toHaveBeenCalledTimes(2);
      expect(clientQuery.mock.calls[1]?.[1]).toEqual(['new', ['d1', 'd2'], [100, 200]]);
    });
  });
});
