/**
 * @file apps/api/src/modules/property/property-defaults.spec.ts
 * @feature property
 * @dependencies PropertyRepository, PropertyService, a fake database that records every statement
 * What a NEW property starts with: one catch-all refund tier (0 days, 0%) and two guest extras, all created in the same
 * transaction as the property, in the same organization, and never on update.
 */

import { Test } from '@nestjs/testing';
import type { CreatePropertyRequest, UpdatePropertyRequest } from '@resort-booking/shared-types';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../shared/database/database.service';
import { DEFAULT_CANCELLATION_TIERS, validateCancellationTiers } from '../reservations/reservations.rules';
import { GeocodeService } from './geocode.service';
import { PropertyRepository } from './property.repository';
import { DEFAULT_PROPERTY_EXTRAS } from './property.rules';
import { PropertyService } from './property.service';

type Result = { rows: Record<string, unknown>[]; rowCount: number };
type Responder = (sql: string, params: unknown[]) => Result | Error | undefined;

const ORG = '11111111-1111-4111-8111-111111111111';
const PROPERTY_ID = '22222222-2222-4222-8222-222222222222';

const REQUEST: CreatePropertyRequest = {
  name: 'Lake House',
  slug: 'lake-house',
  description: '',
  addressLine: '1 Rue',
  postalCode: '74000',
  city: 'Annecy',
  countryCode: 'FR',
  timezone: 'Europe/Paris',
  latitude: 45.9,
  longitude: 6.1,
  phone: '+33100000000',
  email: 'a@example.com',
  published: false,
  customRequestsEnabled: false,
  photos: [],
};

function propertyRow(): Record<string, unknown> {
  return {
    id: PROPERTY_ID,
    organization_id: ORG,
    slug: 'lake-house',
    name: 'Lake House',
    description: '',
    address_line: '1 Rue',
    city: 'Annecy',
    country_code: 'FR',
    postal_code: '74000',
    latitude: '45.9',
    longitude: '6.1',
    phone: '+33100000000',
    email: 'a@example.com',
    published: false,
    timezone: 'Europe/Paris',
    custom_requests_enabled: false,
    cover_photo_url: null,
  };
}

describe('defaults for a new property', () => {
  it('the default refund ladder is exactly one catch-all row: 0 days before check-in, 0% refund', () => {
    expect(DEFAULT_CANCELLATION_TIERS).toEqual([{ minDaysBeforeCheckIn: 0, refundPercent: 0 }]);
    // It still passes the same validation the editor applies when someone saves the ladder.
    expect(validateCancellationTiers(DEFAULT_CANCELLATION_TIERS)).toBeNull();
  });

  it('the default extras are the two the owner asked for, active, on request, at price 0', () => {
    expect(DEFAULT_PROPERTY_EXTRAS.map((extra) => extra.name)).toEqual(['Baby mattress / travel cot', 'Extra pillows']);
    for (const extra of DEFAULT_PROPERTY_EXTRAS) {
      expect(extra).toMatchObject({ kind: 'on_request', priceCents: 0, currencyCode: 'EUR', published: true });
      expect(extra.description.length).toBeGreaterThan(0);
    }
  });
});

describe('PropertyRepository.createProperty defaults', () => {
  const statements: { sql: string; params: unknown[] }[] = [];
  let responder: Responder;
  let repository: PropertyRepository;

  const run = (sql: string, params: unknown[] = []): Promise<Result> => {
    statements.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
    const answer = responder(sql, params);
    if (answer instanceof Error) {
      return Promise.reject(answer);
    }
    return Promise.resolve(answer ?? { rows: [], rowCount: 0 });
  };
  const sqlOf = (): string[] => statements.map((statement) => statement.sql);
  const onlyInserting = (table: string): { sql: string; params: unknown[] }[] =>
    statements.filter((statement) => statement.sql.includes(`INSERT INTO ${table}`));

  beforeEach(async () => {
    statements.length = 0;
    responder = (sql): Result | undefined => (sql.includes('INSERT INTO properties') ? { rows: [propertyRow()], rowCount: 1 } : undefined);
    const client: PoolClient = Object.assign(Object.create(null), { query: run });
    const moduleRef = await Test.createTestingModule({
      providers: [
        PropertyRepository,
        { provide: DatabaseService, useValue: { query: run, withClient: <T>(fn: (c: PoolClient) => Promise<T>): Promise<T> => fn(client) } },
      ],
    }).compile();
    repository = moduleRef.get(PropertyRepository);
  });

  it('creates exactly one refund tier: 0 days, 0%, in the property\'s organization', async () => {
    await repository.createProperty(ORG, REQUEST);

    const tiers = onlyInserting('cancellation_tiers');
    expect(tiers).toHaveLength(1);
    expect(tiers[0]?.params).toEqual([ORG, PROPERTY_ID, 0, 0]);
  });

  it('creates the two default extras for the new property and organization, active, on request, price 0', async () => {
    await repository.createProperty(ORG, REQUEST);

    const extras = onlyInserting('extra_services');
    expect(extras).toHaveLength(2);
    expect(extras.map((statement) => statement.params[2])).toEqual(['Baby mattress / travel cot', 'Extra pillows']);
    for (const statement of extras) {
      expect(statement.params[0]).toBe(ORG);
      expect(statement.params[1]).toBe(PROPERTY_ID);
      expect(statement.params.slice(4)).toEqual(['on_request', 0, 'EUR', true]);
    }
  });

  it('is idempotent-safe: each extra is inserted only when the property has none with that name yet', async () => {
    await repository.createProperty(ORG, REQUEST);

    for (const statement of onlyInserting('extra_services')) {
      expect(statement.sql).toContain('WHERE NOT EXISTS ( SELECT 1 FROM extra_services WHERE property_id = $2::uuid AND lower(name) = lower($3::text) )');
    }
  });

  it('does all of it in the SAME transaction as the property, and commits once', async () => {
    await repository.createProperty(ORG, REQUEST);

    const order = sqlOf();
    expect(order[0]).toBe('BEGIN');
    const commit = order.indexOf('COMMIT');
    expect(commit).toBeGreaterThan(0);
    const index = (needle: string): number => order.findIndex((sql) => sql.includes(needle));
    expect(index('INSERT INTO properties')).toBeGreaterThan(0);
    expect(index('INSERT INTO cancellation_tiers')).toBeLessThan(commit);
    expect(index('INSERT INTO extra_services')).toBeLessThan(commit);
    expect(order.filter((sql) => sql === 'COMMIT')).toHaveLength(1);
  });

  it('rolls everything back, property included, when a default cannot be created', async () => {
    responder = (sql): Result | Error | undefined => {
      if (sql.includes('INSERT INTO properties')) {
        return { rows: [propertyRow()], rowCount: 1 };
      }
      return sql.includes('INSERT INTO extra_services') ? new Error('boom') : undefined;
    };

    await expect(repository.createProperty(ORG, REQUEST)).rejects.toThrow('boom');

    expect(sqlOf()).toContain('ROLLBACK');
    expect(sqlOf()).not.toContain('COMMIT');
  });

  it('never adds defaults when an existing property is updated', async () => {
    const update: UpdatePropertyRequest = { ...REQUEST };
    responder = (sql): Result | undefined => (sql.includes('UPDATE properties') ? { rows: [propertyRow()], rowCount: 1 } : undefined);

    await repository.updateProperty(PROPERTY_ID, update);

    expect(onlyInserting('extra_services')).toHaveLength(0);
    expect(onlyInserting('cancellation_tiers')).toHaveLength(0);
  });
});

describe('PropertyService.createStaffProperty', () => {
  it('creates through the repository once per call and does not seed anything itself (defaults live in the create transaction)', async () => {
    const createProperty = jest.fn().mockResolvedValue({ id: PROPERTY_ID });
    const moduleRef = await Test.createTestingModule({
      providers: [
        PropertyService,
        { provide: PropertyRepository, useValue: { createProperty, slugTaken: jest.fn().mockResolvedValue(false) } },
        { provide: GeocodeService, useValue: {} },
      ],
    }).compile();

    await moduleRef.get(PropertyService).createStaffProperty(ORG, REQUEST);

    expect(createProperty).toHaveBeenCalledTimes(1);
    expect(createProperty.mock.calls[0]?.[0]).toBe(ORG);
  });
});
