/**
 * @file apps/api/src/modules/extras/extras.repository.spec.ts
 * @feature extras
 */

import { Test } from '@nestjs/testing';
import { DatabaseService } from '../../shared/database/database.service';
import { ExtrasRepository } from './extras.repository';

describe('ExtrasRepository.listPublishedForBooking', () => {
  const query = jest.fn();
  let repository: ExtrasRepository;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [ExtrasRepository, { provide: DatabaseService, useValue: { query } }],
    }).compile();
    repository = moduleRef.get(ExtrasRepository);
  });

  it('reads only published extras of ONE property of ONE organization, with parameters', async () => {
    query.mockResolvedValue({
      rows: [{ id: 'x1', organization_id: 'org', property_id: 'prop', name: 'Cot', description: '', kind: 'on_request', price_cents: 0, currency_code: 'EUR', published: true }],
    });

    const extras = await repository.listPublishedForBooking('prop', 'org');

    expect(extras).toEqual([{ id: 'x1', organizationId: 'org', propertyId: 'prop', name: 'Cot', description: '', kind: 'on_request', priceCents: 0, currencyCode: 'EUR', published: true }]);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('property_id = $1');
    expect(sql).toContain('organization_id = $2');
    expect(sql).toContain('published = true');
    expect(params).toEqual(['prop', 'org']);
  });
});
