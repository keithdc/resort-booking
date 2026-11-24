/**
 * @file apps/api/src/modules/inventory/inventory.service.spec.ts
 * @feature inventory
 * @dependencies InventoryService, RatesService, @nestjs/testing
 */

import { Test } from '@nestjs/testing';
import type { HouseDetail, HouseSummary, RatePeriod } from '@resort-booking/shared-types';
import { Client, type PoolClient } from 'pg';
import { DatabaseService } from '../../shared/database/database.service';
import { RedisService } from '../../shared/redis/redis.service';
import { PropertyRepository } from '../property/property.repository';
import { RatesRepository } from '../rates/rates.repository';
import { RatesService } from '../rates/rates.service';
import { InventoryRepository, type HoldRow } from './inventory.repository';
import { InventoryService } from './inventory.service';

const HOUSE_A = '33333333-3333-3333-3333-333333333331';
const HOUSE_B = '33333333-3333-3333-3333-333333333332';
const PROPERTY = '22222222-2222-2222-2222-222222222221';
const ORG = '11111111-1111-1111-1111-111111111111';

function summary(id: string, capacity: number, rate: number): HouseSummary {
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
    slug: id,
    name: id,
    description: '',
    capacity,
    published: true,
    nightlyRateCents: rate,
    currencyCode: 'EUR',
    coverPhotoUrl: null,
  };
}

function detail(id: string, capacity: number, rate: number): HouseDetail {
  return {
    ...summary(id, capacity, rate),
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

/** An unconnected pg client with a stubbed query, so no cast is needed. */
function fakeClient(): PoolClient {
  return Object.assign(new Client(), {
    release: (): void => undefined,
    query: jest.fn().mockResolvedValue({ rows: [] }),
  });
}

function peak(houseId: string): RatePeriod {
  return {
    id: `peak-${houseId}`,
    houseId,
    propertyId: PROPERTY,
    label: 'Peak summer',
    startDate: '2027-07-01',
    endDate: '2027-08-31',
    nightlyRateCents: 30000,
  };
}

describe('InventoryService pricing', () => {
  const getHouseById = jest.fn<Promise<HouseDetail | null>, [string]>();
  const listHousesByPropertySlug = jest.fn<Promise<HouseSummary[]>, [string | null, boolean]>();
  const listRequestOptions = jest.fn<Promise<never[]>, [string, boolean]>();
  const expireOverdueHolds = jest.fn<Promise<void>, [string]>();
  const hasOverlap = jest.fn<Promise<boolean>, [string, string, string, string | null]>();
  const insertHold = jest.fn<Promise<HoldRow>, [PoolClient, { totalCents: number; currencyCode: string; priceSnapshot: string }]>();
  const insertBlockRequests = jest.fn<Promise<void>, [PoolClient, string, string[]]>();
  const listForHouses = jest.fn<Promise<RatePeriod[]>, [readonly string[], string, string]>();
  const setHoldTtl = jest.fn<Promise<void>, [string, number]>();
  let service: InventoryService;

  beforeEach(async (): Promise<void> => {
    jest.resetAllMocks();
    jest.useFakeTimers({
      now: new Date('2027-05-01T12:00:00Z'),
      doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'performance', 'hrtime'],
    });
    // House B is pricier than the others, so per-house rates are visible in results.
    getHouseById.mockImplementation((id) => Promise.resolve(detail(id, 4, id === HOUSE_B ? 24000 : 18000)));
    listRequestOptions.mockResolvedValue([]);
    expireOverdueHolds.mockResolvedValue(undefined);
    hasOverlap.mockResolvedValue(false);
    listForHouses.mockResolvedValue([]);
    insertBlockRequests.mockResolvedValue(undefined);
    setHoldTtl.mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        InventoryService,
        RatesService,
        { provide: PropertyRepository, useValue: { getHouseById, listHousesByPropertySlug, listRequestOptions } },
        { provide: InventoryRepository, useValue: { expireOverdueHolds, hasOverlap, insertHold, insertBlockRequests } },
        { provide: RatesRepository, useValue: { listForHouses } },
        {
          provide: DatabaseService,
          // Stand-in transaction client; the repository calls it would carry are mocked above.
          useValue: { withClient: (work: (client: PoolClient) => Promise<unknown>) => work(fakeClient()) },
        },
        { provide: RedisService, useValue: { setHoldTtl } },
      ],
    }).compile();
    service = moduleRef.get(InventoryService);
  });

  afterEach((): void => {
    jest.useRealTimers();
  });

  describe('getQuote', () => {
    const query = { houseId: HOUSE_A, checkIn: '2027-06-29', checkOut: '2027-07-03', guestCount: 2 };

    it('prices a stay that crosses into peak season night by night', async () => {
      listForHouses.mockResolvedValue([peak(HOUSE_A)]);

      const quote = await service.getQuote(query, true);

      expect(quote.lines).toEqual([
        { label: 'Standard rate', nights: 2, nightlyRateCents: 18000, subtotalCents: 36000 },
        { label: 'Peak summer', nights: 2, nightlyRateCents: 30000, subtotalCents: 60000 },
      ]);
      expect(quote.totalCents).toBe(96000);
      expect(quote.nights).toBe(4);
      expect(quote.nightlyRateCents).toBe(18000);
    });

    it('uses the standard rate when the house has no periods', async () => {
      const quote = await service.getQuote({ ...query, checkIn: '2027-06-10', checkOut: '2027-06-12' }, true);

      expect(quote.totalCents).toBe(36000);
      expect(quote.lines).toHaveLength(1);
    });

    it('loads periods once for the stay', async () => {
      await service.getQuote(query, true);

      expect(listForHouses).toHaveBeenCalledTimes(1);
      expect(listForHouses).toHaveBeenCalledWith([HOUSE_A], '2027-06-29', '2027-07-02');
    });

    it('still reports a taken house as unavailable, with its price', async () => {
      hasOverlap.mockResolvedValue(true);

      const quote = await service.getQuote(query, true);

      expect(quote.available).toBe(false);
      expect(quote.totalCents).toBeGreaterThan(0);
    });
  });

  describe('searchStays', () => {
    const search = { checkIn: '2027-07-10', checkOut: '2027-07-12', guestCount: 2, propertySlug: 'pine-coast' };

    it('loads seasonal periods for all houses in one query and prices each house with its own', async () => {
      listHousesByPropertySlug.mockResolvedValue([summary(HOUSE_A, 4, 18000), summary(HOUSE_B, 4, 24000)]);
      listForHouses.mockResolvedValue([peak(HOUSE_A)]);

      const results = await service.searchStays(search);

      expect(listForHouses).toHaveBeenCalledTimes(1);
      expect(listForHouses).toHaveBeenCalledWith([HOUSE_A, HOUSE_B], '2027-07-10', '2027-07-11');
      expect(results.map((result) => result.quote.totalCents)).toEqual([60000, 48000]);
    });

    it('leaves out houses that are taken for the dates', async () => {
      listHousesByPropertySlug.mockResolvedValue([summary(HOUSE_A, 4, 18000), summary(HOUSE_B, 4, 24000)]);
      hasOverlap.mockImplementation((houseId) => Promise.resolve(houseId === HOUSE_A));

      const results = await service.searchStays(search);

      expect(results.map((result) => result.house.id)).toEqual([HOUSE_B]);
    });

    it('does not price houses that cannot sleep the party', async () => {
      listHousesByPropertySlug.mockResolvedValue([summary(HOUSE_A, 1, 18000), summary(HOUSE_B, 4, 24000)]);

      await service.searchStays(search);

      expect(listForHouses).toHaveBeenCalledWith([HOUSE_B], '2027-07-10', '2027-07-11');
    });
  });

  describe('createHold', () => {
    it('stores the quoted price lines with the hold so later rate edits never change it', async () => {
      listForHouses.mockResolvedValue([peak(HOUSE_A)]);
      insertHold.mockResolvedValue({
        id: 'hold-1',
        organization_id: ORG,
        property_id: PROPERTY,
        house_id: HOUSE_A,
        status: 'active',
        check_in: '2027-07-10',
        check_out: '2027-07-12',
        guest_count: 2,
        payment_method: 'card',
        expires_at: new Date('2027-05-01T12:15:00Z'),
        booker_name: 'Ada',
        booker_email: 'ada@example.com',
        booker_phone: '+330000',
        guest_note: '',
      });

      await service.createHold(
        {
          houseId: HOUSE_A,
          checkIn: '2027-07-10',
          checkOut: '2027-07-12',
          guestCount: 2,
          paymentMethod: 'card',
          bookerName: 'Ada',
          bookerEmail: 'ada@example.com',
          bookerPhone: '+330000',
          guestNote: '',
          requestOptionIds: [],
        },
        true,
      );

      const input = insertHold.mock.calls[0]?.[1];
      expect(input?.totalCents).toBe(60000);
      expect(input?.currencyCode).toBe('EUR');
      expect(JSON.parse(input?.priceSnapshot ?? '{}')).toEqual({
        lines: [{ label: 'Peak summer', nights: 2, nightlyRateCents: 30000, subtotalCents: 60000 }],
        totalCents: 60000,
        currencyCode: 'EUR',
      });
    });

    it('refuses a taken house without writing a hold', async () => {
      hasOverlap.mockResolvedValue(true);

      await expect(
        service.createHold(
          {
            houseId: HOUSE_A,
            checkIn: '2027-07-10',
            checkOut: '2027-07-12',
            guestCount: 2,
            paymentMethod: 'card',
            bookerName: 'Ada',
            bookerEmail: 'ada@example.com',
            bookerPhone: '+330000',
            guestNote: '',
            requestOptionIds: [],
          },
          true,
        ),
      ).rejects.toMatchObject({ response: { code: 'DATES_UNAVAILABLE' } });
      expect(insertHold).not.toHaveBeenCalled();
    });
  });
});
