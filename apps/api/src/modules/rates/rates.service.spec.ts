/**
 * @file apps/api/src/modules/rates/rates.service.spec.ts
 * @feature rates
 * @dependencies RatesService, @nestjs/testing
 */

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type {
  BulkRatePeriodRequest,
  HouseDetail,
  HouseSummary,
  PropertyDetail,
  RatePeriod,
  RatePeriodWrite,
  StaffProfile,
} from '@resort-booking/shared-types';
import { Client, type PoolClient } from 'pg';
import { PropertyRepository } from '../property/property.repository';
import { RatesRepository, type BulkAuditInput, type HouseConflictRow, type HouseScope } from './rates.repository';
import { RatesService } from './rates.service';

const HOUSE_A = '33333333-3333-3333-3333-333333333331';
const HOUSE_B = '33333333-3333-3333-3333-333333333332';
const PROPERTY = '22222222-2222-2222-2222-222222222221';
const ORG = '11111111-1111-1111-1111-111111111111';
const STAFF: StaffProfile = { id: 'staff-1', organizationId: ORG, fullName: 'Owner', email: 'owner@example.com' };

const WRITE: RatePeriodWrite = {
  label: 'Peak summer',
  startDate: '2027-07-01',
  endDate: '2027-08-31',
  nightlyRateCents: 26000,
};

function period(id: string, houseId: string, startDate: string, endDate: string): RatePeriod {
  return { id, houseId, propertyId: PROPERTY, label: `Existing ${id}`, startDate, endDate, nightlyRateCents: 20000 };
}

function summary(id: string, name: string): HouseSummary {
  return {
    id,
    organizationId: ORG,
    propertyId: PROPERTY,
    propertySlug: 'pine-coast',
    propertyName: 'Pine Coast',
    propertyCity: 'Biarritz',
    propertyCountryCode: 'FR',
    propertyTimezone: 'Europe/Paris',
    propertyAddressLine: '1 Rue',
    propertyPostalCode: '64200',
    slug: name.toLowerCase(),
    name,
    description: '',
    capacity: 4,
    published: true,
    nightlyRateCents: 18000,
    currencyCode: 'EUR',
    coverPhotoUrl: null,
    mapLatitude: 45.9,
    mapLongitude: 6.1,
  };
}

function detail(id: string, name: string): HouseDetail {
  return {
    ...summary(id, name),
    latitude: null,
    longitude: null,
    photos: [],
    amenities: [],
    propertyPhone: '',
    propertyEmail: '',
    propertyLatitude: 0,
    propertyLongitude: 0,
  };
}

/** An unconnected pg client; the repository calls it would carry are mocked. */
function fakeClient(): PoolClient {
  return Object.assign(new Client(), { release: (): void => undefined });
}

function property(): PropertyDetail {
  return {
    id: PROPERTY,
    organizationId: ORG,
    slug: 'pine-coast',
    name: 'Pine Coast',
    description: '',
    city: 'Biarritz',
    countryCode: 'FR',
    latitude: 43.4,
    longitude: -1.5,
    phone: '+33559123456',
    email: 'stay@example.com',
    published: true,
    timezone: 'Europe/Paris',
    coverPhotoUrl: null,
    customRequestsEnabled: false,
    addressLine: '1 Rue',
    postalCode: '64200',
    photos: [],
  };
}

function bulk(overrides: Partial<BulkRatePeriodRequest> = {}): BulkRatePeriodRequest {
  return { ...WRITE, houseIds: [HOUSE_A, HOUSE_B], confirmed: true, ...overrides };
}

describe('RatesService', () => {
  const listForHouse = jest.fn<Promise<RatePeriod[]>, [string]>();
  const listForHouses = jest.fn<Promise<RatePeriod[]>, [readonly string[], string, string]>();
  const getById = jest.fn<Promise<RatePeriod | null>, [string]>();
  const insert = jest.fn<Promise<RatePeriod>, [HouseScope, RatePeriodWrite]>();
  const update = jest.fn<Promise<RatePeriod | null>, [string, RatePeriodWrite]>();
  const remove = jest.fn<Promise<boolean>, [string]>();
  const listConflictsForHouses = jest.fn<Promise<HouseConflictRow[]>, [readonly string[], string, string]>();
  const insertForHouses = jest.fn<Promise<void>, [PoolClient, readonly HouseScope[], RatePeriodWrite]>();
  const insertBulkAudit = jest.fn<Promise<void>, [PoolClient, BulkAuditInput]>();
  const inTransaction = jest.fn<Promise<unknown>, [(client: PoolClient) => Promise<unknown>]>();
  const listForProperty = jest.fn<Promise<RatePeriod[]>, [string]>();
  const getPropertyById = jest.fn<Promise<PropertyDetail | null>, [string]>();
  const getHouseById = jest.fn<Promise<HouseDetail | null>, [string]>();
  const listHousesByPropertyId = jest.fn<Promise<HouseSummary[]>, [string]>();
  let service: RatesService;

  beforeEach(async (): Promise<void> => {
    jest.resetAllMocks();
    listForHouse.mockResolvedValue([]);
    listForHouses.mockResolvedValue([]);
    listConflictsForHouses.mockResolvedValue([]);
    insertForHouses.mockResolvedValue(undefined);
    insertBulkAudit.mockResolvedValue(undefined);
    getHouseById.mockResolvedValue(detail(HOUSE_A, 'Dune'));
    listHousesByPropertyId.mockResolvedValue([summary(HOUSE_A, 'Dune'), summary(HOUSE_B, 'Cedar')]);
    insert.mockImplementation((scope, write) =>
      Promise.resolve({ id: 'new', houseId: scope.houseId, propertyId: scope.propertyId, ...write }),
    );
    // Run the transaction body with a stand-in client; the repository calls are mocked.
    inTransaction.mockImplementation((work) => work(fakeClient()));

    const moduleRef = await Test.createTestingModule({
      providers: [
        RatesService,
        {
          provide: RatesRepository,
          useValue: {
            listForHouse,
            listForProperty,
            listForHouses,
            getById,
            insert,
            update,
            delete: remove,
            listConflictsForHouses,
            insertForHouses,
            insertBulkAudit,
            inTransaction,
          },
        },
        { provide: PropertyRepository, useValue: { getHouseById, getPropertyById, listHousesByPropertyId } },
      ],
    }).compile();
    service = moduleRef.get(RatesService);
  });

  describe('pricing', () => {
    it('loads the periods for every house in one query and groups them by house', async () => {
      listForHouses.mockResolvedValue([
        period('a', HOUSE_A, '2027-07-01', '2027-07-10'),
        period('b', HOUSE_B, '2027-07-01', '2027-07-10'),
        period('c', HOUSE_A, '2027-08-01', '2027-08-10'),
      ]);

      const grouped = await service.loadPeriods([HOUSE_A, HOUSE_B], '2027-07-05', '2027-08-05');

      expect(listForHouses).toHaveBeenCalledTimes(1);
      expect(listForHouses).toHaveBeenCalledWith([HOUSE_A, HOUSE_B], '2027-07-05', '2027-08-04');
      expect(grouped.get(HOUSE_A)).toHaveLength(2);
      expect(grouped.get(HOUSE_B)).toHaveLength(1);
    });

    it('does not query for an invalid stay', async () => {
      const grouped = await service.loadPeriods([HOUSE_A], '2027-07-05', '2027-07-05');

      expect(grouped.size).toBe(0);
      expect(listForHouses).not.toHaveBeenCalled();
    });

    it('prices a stay from loaded periods, falling back to the standard rate', () => {
      const grouped = new Map<string, RatePeriod[]>([[HOUSE_A, [period('a', HOUSE_A, '2027-07-01', '2027-07-31')]]]);

      const peak = service.priceHouseStay({ id: HOUSE_A, nightlyRateCents: 18000 }, '2027-07-10', '2027-07-12', grouped);
      const standard = service.priceHouseStay({ id: HOUSE_B, nightlyRateCents: 18000 }, '2027-07-10', '2027-07-12', grouped);

      expect(peak.totalCents).toBe(40000);
      expect(standard.totalCents).toBe(36000);
    });
  });

  describe('listForProperty', () => {
    it('returns every house\'s periods from one repository call', async () => {
      getPropertyById.mockResolvedValue(property());
      listForProperty.mockResolvedValue([period('a', HOUSE_A, '2027-07-01', '2027-07-31'), period('b', HOUSE_B, '2027-07-01', '2027-07-31')]);

      const periods = await service.listForProperty(PROPERTY);

      expect(periods.map((p) => p.houseId)).toEqual([HOUSE_A, HOUSE_B]);
      expect(listForProperty).toHaveBeenCalledTimes(1);
      expect(listForHouse).not.toHaveBeenCalled();
    });

    it('returns not found for an unknown property without querying periods', async () => {
      getPropertyById.mockResolvedValue(null);

      await expect(service.listForProperty(PROPERTY)).rejects.toBeInstanceOf(NotFoundException);
      expect(listForProperty).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('saves a valid period on the house', async () => {
      const created = await service.create(HOUSE_A, WRITE);

      expect(insert).toHaveBeenCalledWith({ organizationId: ORG, propertyId: PROPERTY, houseId: HOUSE_A }, WRITE);
      expect(created.label).toBe('Peak summer');
    });

    it('rejects an overlap and names the period it clashes with', async () => {
      listForHouse.mockResolvedValue([period('a', HOUSE_A, '2027-08-20', '2027-09-10')]);

      const attempt = service.create(HOUSE_A, WRITE);

      await expect(attempt).rejects.toBeInstanceOf(ConflictException);
      await expect(attempt).rejects.toMatchObject({
        response: { code: 'RATE_PERIOD_OVERLAP', message: expect.stringContaining('Existing a') as string },
      });
      expect(insert).not.toHaveBeenCalled();
    });

    it('accepts a period that starts the day after another ends', async () => {
      listForHouse.mockResolvedValue([period('a', HOUSE_A, '2027-06-01', '2027-06-30')]);

      await expect(service.create(HOUSE_A, WRITE)).resolves.toBeDefined();
    });

    it('rejects invalid input before touching the database', async () => {
      await expect(service.create(HOUSE_A, { ...WRITE, endDate: '2027-06-01' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(listForHouse).not.toHaveBeenCalled();
    });

    it('turns a database exclusion violation (a race) into the same overlap error', async () => {
      insert.mockRejectedValue(Object.assign(new Error('exclusion'), { code: '23P01' }));

      await expect(service.create(HOUSE_A, WRITE)).rejects.toMatchObject({
        response: { code: 'RATE_PERIOD_OVERLAP' },
      });
    });

    it('rethrows unexpected database errors untouched', async () => {
      const failure = new Error('connection lost');
      insert.mockRejectedValue(failure);

      await expect(service.create(HOUSE_A, WRITE)).rejects.toBe(failure);
    });

    it('returns not found for an unknown house', async () => {
      getHouseById.mockResolvedValue(null);

      await expect(service.create(HOUSE_A, WRITE)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    const current = period('a', HOUSE_A, '2027-07-01', '2027-07-31');

    it('lets a period keep or stretch its own dates', async () => {
      getById.mockResolvedValue(current);
      listForHouse.mockResolvedValue([current]);
      update.mockResolvedValue({ ...current, ...WRITE });

      await expect(service.update('a', WRITE)).resolves.toBeDefined();
      expect(update).toHaveBeenCalledWith('a', WRITE);
    });

    it('rejects moving onto a different period', async () => {
      getById.mockResolvedValue(current);
      listForHouse.mockResolvedValue([current, period('b', HOUSE_A, '2027-09-01', '2027-09-30')]);

      await expect(service.update('a', { ...WRITE, endDate: '2027-09-05' })).rejects.toMatchObject({
        response: { code: 'RATE_PERIOD_OVERLAP' },
      });
      expect(update).not.toHaveBeenCalled();
    });

    it('returns not found when the period is gone', async () => {
      getById.mockResolvedValue(null);

      await expect(service.update('a', WRITE)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes a period', async () => {
      remove.mockResolvedValue(true);

      await expect(service.remove('a')).resolves.toBeUndefined();
    });

    it('returns not found when it was already deleted', async () => {
      remove.mockResolvedValue(false);

      await expect(service.remove('a')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('previewBulk', () => {
    it('marks clean houses will_add and clashing houses conflict, with one conflict query', async () => {
      listConflictsForHouses.mockResolvedValue([
        { house_id: HOUSE_B, label: 'Existing peak', start_date: '2027-07-15', end_date: '2027-07-20' },
      ]);

      const preview = await service.previewBulk(PROPERTY, bulk());

      expect(listConflictsForHouses).toHaveBeenCalledTimes(1);
      expect(preview.addCount).toBe(1);
      expect(preview.conflictCount).toBe(1);
      expect(preview.results).toEqual([
        { houseId: HOUSE_A, houseName: 'Dune', status: 'will_add', conflict: null },
        {
          houseId: HOUSE_B,
          houseName: 'Cedar',
          status: 'conflict',
          conflict: { label: 'Existing peak', startDate: '2027-07-15', endDate: '2027-07-20' },
        },
      ]);
      expect(insertForHouses).not.toHaveBeenCalled();
    });

    it('rejects a house that does not belong to the property', async () => {
      await expect(
        service.previewBulk(PROPERTY, bulk({ houseIds: [HOUSE_A, '99999999-9999-9999-9999-999999999999'] })),
      ).rejects.toMatchObject({ response: { code: 'UNKNOWN_HOUSE' } });
    });

    it('returns not found for a property with no houses', async () => {
      listHousesByPropertyId.mockResolvedValue([]);

      await expect(service.previewBulk(PROPERTY, bulk())).rejects.toBeInstanceOf(NotFoundException);
    });

    it('validates the period like a single create', async () => {
      await expect(service.previewBulk(PROPERTY, bulk({ label: '' }))).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('applyBulk', () => {
    it('refuses to apply without confirmation and writes nothing', async () => {
      await expect(service.applyBulk(PROPERTY, bulk({ confirmed: false }), STAFF)).rejects.toMatchObject({
        response: { code: 'CONFIRMATION_REQUIRED' },
      });
      expect(inTransaction).not.toHaveBeenCalled();
    });

    it('adds the period to every clean house in one transaction and logs who did it', async () => {
      const result = await service.applyBulk(PROPERTY, bulk(), STAFF);

      expect(result).toEqual({ propertyId: PROPERTY, addedHouseIds: [HOUSE_A, HOUSE_B], skippedHouseIds: [] });
      expect(inTransaction).toHaveBeenCalledTimes(1);
      expect(insertForHouses).toHaveBeenCalledTimes(1);
      expect(insertBulkAudit).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ staffAccountId: 'staff-1', propertyId: PROPERTY, addedHouseIds: [HOUSE_A, HOUSE_B] }),
      );
    });

    it('skips clashing houses instead of overwriting them', async () => {
      listConflictsForHouses.mockResolvedValue([
        { house_id: HOUSE_B, label: 'Existing peak', start_date: '2027-07-15', end_date: '2027-07-20' },
      ]);

      const result = await service.applyBulk(PROPERTY, bulk(), STAFF);

      expect(result.addedHouseIds).toEqual([HOUSE_A]);
      expect(result.skippedHouseIds).toEqual([HOUSE_B]);
      expect(insertForHouses.mock.calls[0]?.[1].map((scope) => scope.houseId)).toEqual([HOUSE_A]);
    });

    it('records the action even with no signed-in profile attached', async () => {
      await service.applyBulk(PROPERTY, bulk(), undefined);

      expect(insertBulkAudit).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ staffAccountId: null }),
      );
    });

    it('reports a clash that appears mid-apply as an overlap error (all or nothing)', async () => {
      inTransaction.mockRejectedValue(Object.assign(new Error('exclusion'), { code: '23P01' }));

      await expect(service.applyBulk(PROPERTY, bulk(), STAFF)).rejects.toMatchObject({
        response: { code: 'RATE_PERIOD_OVERLAP' },
      });
    });
  });
});
