/**
 * @file apps/api/src/modules/inventory/inventory.service.spec.ts
 * @feature inventory
 * @dependencies InventoryService, RatesService, @nestjs/testing
 */

import { Test } from '@nestjs/testing';
import type { Discount, HouseDetail, HouseSummary, RatePeriod } from '@resort-booking/shared-types';
import { Client, type PoolClient } from 'pg';
import { DatabaseService } from '../../shared/database/database.service';
import { RedisService } from '../../shared/redis/redis.service';
import { DiscountsRepository } from '../discounts/discounts.repository';
import { DiscountsService } from '../discounts/discounts.service';
import { PropertyRepository } from '../property/property.repository';
import { RatesRepository } from '../rates/rates.repository';
import { RatesService } from '../rates/rates.service';
import { ReservationsService } from '../reservations/reservations.service';
import type { PolicySnapshot } from '../reservations/reservations.rules';
import { InventoryRepository, type HoldRow, type StayRow } from './inventory.repository';
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
    mapLatitude: 45.9,
    mapLongitude: 6.1,
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
const POLICY: PolicySnapshot = {
  tiers: [
    { minDaysBeforeCheckIn: 7, refundPercent: 100 },
    { minDaysBeforeCheckIn: 0, refundPercent: 0 },
  ],
  rebookable: false,
  rebookFeeType: 'none',
  rebookFeeValue: 0,
};

function discountFor(overrides: Partial<Discount> = {}): Discount {
  return {
    id: 'long-stay',
    propertyId: PROPERTY,
    label: 'Long stay',
    effect: { kind: 'percent', percent: 10 },
    conditions: [{ kind: 'min_nights', nights: 2 }],
    alwaysOn: false,
    houseIds: null,
    combinable: false,
    priority: 100,
    active: true,
    maxRedemptions: null,
    promoted: false,
    redemptions: 0,
    ...overrides,
  };
}

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
  const insertHold = jest.fn<Promise<HoldRow>, [PoolClient, { totalCents: number; currencyCode: string; priceSnapshot: string; policySnapshot: string; termsAcceptedAt: Date }]>();
  const insertBlockRequests = jest.fn<Promise<void>, [PoolClient, string, string[]]>();
  const listForHouses = jest.fn<Promise<RatePeriod[]>, [readonly string[], string, string]>();
  const listDiscounts = jest.fn<Promise<Discount[]>, [readonly string[], boolean]>();
  const getHoldById = jest.fn<Promise<HoldRow | null>, [string]>();
  const getPolicySnapshot = jest.fn<Promise<PolicySnapshot>, [string]>();
  const confirmPaidHold = jest.fn<Promise<StayRow | null>, [PoolClient, string]>();
  const getConfirmedStay = jest.fn<Promise<StayRow | null>, [string]>();
  const releaseHold = jest.fn<Promise<void>, [string]>();
  const deleteHoldTtl = jest.fn<Promise<void>, [string]>();
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
    listDiscounts.mockResolvedValue([]);
    getPolicySnapshot.mockResolvedValue(POLICY);
    insertBlockRequests.mockResolvedValue(undefined);
    setHoldTtl.mockResolvedValue(undefined);
    releaseHold.mockResolvedValue(undefined);
    deleteHoldTtl.mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        InventoryService,
        RatesService,
        DiscountsService,
        { provide: ReservationsService, useValue: { getPolicySnapshot } },
        { provide: PropertyRepository, useValue: { getHouseById, listHousesByPropertySlug, listRequestOptions } },
        { provide: InventoryRepository, useValue: { expireOverdueHolds, hasOverlap, insertHold, insertBlockRequests, getHoldById, confirmPaidHold, getConfirmedStay, releaseHold } },
        { provide: DiscountsRepository, useValue: { listForProperties: listDiscounts } },
        { provide: RatesRepository, useValue: { listForHouses } },
        {
          provide: DatabaseService,
          // Stand-in transaction client; the repository calls it would carry are mocked above.
          useValue: { withClient: (work: (client: PoolClient) => Promise<unknown>) => work(fakeClient()) },
        },
        { provide: RedisService, useValue: { setHoldTtl, deleteHoldTtl } },
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

    it('judges a past check-in by the PROPERTY\'s timezone, not Paris', async () => {
      // 22:30 UTC on 1 May 2027 is already 2 May in Tokyo, so a 2 May check-in is the property's today.
      jest.setSystemTime(new Date('2027-05-01T22:30:00Z'));
      getHouseById.mockImplementation((id) => Promise.resolve({ ...detail(id, 4, 18000), propertyTimezone: 'Asia/Tokyo' }));

      await expect(service.getQuote({ ...query, checkIn: '2027-05-02', checkOut: '2027-05-04' }, true)).resolves.toMatchObject({ available: true });
      await expect(service.getQuote({ ...query, checkIn: '2027-05-01', checkOut: '2027-05-04' }, true)).rejects.toMatchObject({
        response: { code: 'PAST_CHECK_IN' },
      });
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

  describe('discounts', () => {
    const query = { houseId: HOUSE_A, checkIn: '2027-06-10', checkOut: '2027-06-13', guestCount: 2 };

    it('takes a matching discount off the stay and shows it as its own line', async () => {
      listDiscounts.mockResolvedValue([discountFor()]);

      const quote = await service.getQuote(query, true);

      expect(quote.subtotalCents).toBe(54000);
      expect(quote.discounts).toEqual([{ discountId: 'long-stay', label: 'Long stay', amountCents: 5400 }]);
      expect(quote.discountCents).toBe(5400);
      expect(quote.totalCents).toBe(48600);
      expect(quote.promoCode).toBeNull();
    });

    it('charges full price when no discount matches', async () => {
      listDiscounts.mockResolvedValue([discountFor({ conditions: [{ kind: 'min_nights', nights: 10 }] })]);

      const quote = await service.getQuote(query, true);

      expect(quote.discounts).toEqual([]);
      expect(quote.totalCents).toBe(quote.subtotalCents);
    });

    it('applies a typed promo code and reports it', async () => {
      listDiscounts.mockResolvedValue([
        discountFor({ id: 'welcome', label: 'Welcome', conditions: [{ kind: 'promo_code', code: 'WELCOME15' }], effect: { kind: 'percent', percent: 15 } }),
      ]);

      const quote = await service.getQuote({ ...query, promoCode: 'welcome15' }, true);

      expect(quote.discountCents).toBe(8100);
      expect(quote.promoCode).toEqual({ code: 'welcome15', applied: true, message: 'Code WELCOME15 applied' });
    });

    it('prices the stay normally and says why when the code is wrong', async () => {
      const quote = await service.getQuote({ ...query, promoCode: 'nope' }, true);

      expect(quote.totalCents).toBe(54000);
      expect(quote.promoCode).toEqual({ code: 'nope', applied: false, message: 'That code is not valid' });
    });

    it('discounts the seasonal subtotal, not the standard rate', async () => {
      listForHouses.mockResolvedValue([peak(HOUSE_A)]);
      listDiscounts.mockResolvedValue([discountFor({ conditions: [{ kind: 'min_nights', nights: 1 }] })]);

      const quote = await service.getQuote({ ...query, checkIn: '2027-07-10', checkOut: '2027-07-12' }, true);

      expect(quote.subtotalCents).toBe(60000);
      expect(quote.discountCents).toBe(6000);
    });

    it('loads discounts once for the whole search and keeps each property to its own', async () => {
      const other = { ...summary(HOUSE_B, 4, 24000), propertyId: 'other-property' };
      listHousesByPropertySlug.mockResolvedValue([summary(HOUSE_A, 4, 18000), other]);
      getHouseById.mockImplementation((id) =>
        Promise.resolve(id === HOUSE_B ? { ...detail(id, 4, 24000), propertyId: 'other-property' } : detail(id, 4, 18000)),
      );
      listDiscounts.mockResolvedValue([discountFor({ propertyId: PROPERTY })]);

      const results = await service.searchStays({ checkIn: '2027-06-10', checkOut: '2027-06-13', guestCount: 2 });

      expect(listDiscounts).toHaveBeenCalledTimes(1);
      expect(listDiscounts).toHaveBeenCalledWith([PROPERTY, 'other-property'], true);
      const byHouse = new Map(results.map((result) => [result.house.id, result.quote.discountCents]));
      expect(byHouse.get(HOUSE_A)).toBe(5400);
      expect(byHouse.get(HOUSE_B)).toBe(0);
    });
  });

  describe('getHold price', () => {
    function holdRow(snapshot: unknown): HoldRow {
      return {
        id: 'hold-1',
        organization_id: ORG,
        property_id: PROPERTY,
        house_id: HOUSE_A,
        status: 'active',
        check_in: '2027-06-10',
        check_out: '2027-06-13',
        guest_count: 2,
        payment_method: 'card',
        expires_at: new Date(Date.now() + 600_000),
        booker_name: 'Ada',
        booker_email: 'ada@example.com',
        booker_phone: '+33612345678',
        guest_note: '',
        price_snapshot: snapshot,
      };
    }

    const SNAPSHOT = {
      lines: [{ label: 'Standard rate', nights: 3, nightlyRateCents: 20000, subtotalCents: 60000 }],
      subtotalCents: 60000,
      discounts: [{ discountId: 'long-stay', label: 'Long stay', amountCents: 6000 }],
      discountCents: 6000,
      totalCents: 54000,
      currencyCode: 'EUR',
      promoCode: null,
    };

    it('shows the price the guest was quoted even after rates and discounts changed', async () => {
      getHoldById.mockResolvedValue(holdRow(SNAPSHOT));
      // Today the live price is lower (18000/night) and the discount is gone.

      const hold = await service.getHold('hold-1');

      expect(hold.quote.totalCents).toBe(54000);
      expect(hold.quote.discountCents).toBe(6000);
      expect(hold.quote.lines[0]?.nightlyRateCents).toBe(20000);
    });

    it('keeps availability live while the price comes from the snapshot', async () => {
      getHoldById.mockResolvedValue(holdRow(SNAPSHOT));
      hasOverlap.mockResolvedValue(true);

      const hold = await service.getHold('hold-1');

      expect(hold.quote.available).toBe(false);
      expect(hasOverlap).toHaveBeenCalledWith(HOUSE_A, '2027-06-10', '2027-06-13', 'hold-1');
    });

    it('falls back to a live quote for an older hold with no usable snapshot', async () => {
      getHoldById.mockResolvedValue(holdRow({ lines: [], totalCents: 1, currencyCode: 'EUR' }));

      const hold = await service.getHold('hold-1');

      expect(hold.quote.totalCents).toBe(54000);
    });

    it('returns not found for an unknown hold', async () => {
      getHoldById.mockResolvedValue(null);

      await expect(service.getHold('missing')).rejects.toMatchObject({ response: { code: 'HOLD_NOT_FOUND' } });
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
        price_snapshot: null,
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
          termsAccepted: true,
        },
        true,
      );

      const input = insertHold.mock.calls[0]?.[1];
      expect(input?.totalCents).toBe(60000);
      expect(input?.currencyCode).toBe('EUR');
      expect(JSON.parse(input?.priceSnapshot ?? '{}')).toEqual({
        lines: [{ label: 'Peak summer', nights: 2, nightlyRateCents: 30000, subtotalCents: 60000 }],
        subtotalCents: 60000,
        discounts: [],
        discountCents: 0,
        totalCents: 60000,
        currencyCode: 'EUR',
        promoCode: null,
      });
    });

    describe('cancellation policy saved with the hold', () => {
      const DTO = {
        houseId: HOUSE_A,
        checkIn: '2027-07-10',
        checkOut: '2027-07-12',
        guestCount: 2,
        paymentMethod: 'card' as const,
        bookerName: 'Ada',
        bookerEmail: 'ada@example.com',
        bookerPhone: '+330000',
        guestNote: '',
        requestOptionIds: [],
          termsAccepted: true,
      };

      function heldRow(): HoldRow {
        return {
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
          price_snapshot: null,
        };
      }

      it('stores the property\'s CURRENT policy with the hold, so the guest keeps the terms they booked under', async () => {
        insertHold.mockResolvedValue(heldRow());

        await service.createHold(DTO, true);

        expect(getPolicySnapshot).toHaveBeenCalledWith(PROPERTY);
        const saved = insertHold.mock.calls[0]?.[1];
        expect(JSON.parse(saved?.policySnapshot ?? 'null')).toEqual(POLICY);
      });

      it('reads the policy once per hold', async () => {
        insertHold.mockResolvedValue(heldRow());

        await service.createHold(DTO, true);

        expect(getPolicySnapshot).toHaveBeenCalledTimes(1);
      });

      it('does not read the policy, or write anything, for dates that are already taken', async () => {
        hasOverlap.mockResolvedValue(true);

        await expect(service.createHold(DTO, true)).rejects.toMatchObject({ response: { code: 'DATES_UNAVAILABLE' } });

        expect(getPolicySnapshot).not.toHaveBeenCalled();
        expect(insertHold).not.toHaveBeenCalled();
      });

      it('writes no hold when the policy cannot be read, rather than saving a hold with no terms', async () => {
        getPolicySnapshot.mockRejectedValue(new Error('policy unavailable'));

        await expect(service.createHold(DTO, true)).rejects.toThrow('policy unavailable');

        expect(insertHold).not.toHaveBeenCalled();
      });
    });

    describe('cancellation terms', () => {
      const base = {
        houseId: HOUSE_A,
        checkIn: '2027-07-10',
        checkOut: '2027-07-12',
        guestCount: 2,
        paymentMethod: 'card' as const,
        bookerName: 'Ada',
        bookerEmail: 'ada@example.com',
        bookerPhone: '+330000',
        guestNote: '',
        requestOptionIds: [],
      };

      it('refuses a hold when the terms were not accepted, before looking at the calendar or writing anything', async () => {
        await expect(service.createHold({ ...base, termsAccepted: false }, true)).rejects.toMatchObject({
          response: { code: 'TERMS_NOT_ACCEPTED' },
        });

        expect(hasOverlap).not.toHaveBeenCalled();
        expect(insertHold).not.toHaveBeenCalled();
      });

      it('records when the terms were accepted using the server clock', async () => {
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
          price_snapshot: null,
        });

        await service.createHold({ ...base, termsAccepted: true }, true);

        expect(insertHold.mock.calls[0]?.[1].termsAcceptedAt.toISOString()).toBe('2027-05-01T12:00:00.000Z');
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
          termsAccepted: true,
          },
          true,
        ),
      ).rejects.toMatchObject({ response: { code: 'DATES_UNAVAILABLE' } });
      expect(insertHold).not.toHaveBeenCalled();
    });
  });

  describe('paying a hold', () => {
    const SNAPSHOT = {
      lines: [{ label: 'Standard rate', nights: 3, nightlyRateCents: 20000, subtotalCents: 60000 }],
      subtotalCents: 60000,
      discounts: [{ discountId: 'long-stay', label: 'Long stay', amountCents: 6000 }],
      discountCents: 6000,
      totalCents: 54000,
      currencyCode: 'EUR',
      promoCode: null,
    };

    function row(overrides: Partial<HoldRow> = {}): HoldRow {
      return {
        id: 'hold-1',
        organization_id: ORG,
        property_id: PROPERTY,
        house_id: HOUSE_A,
        status: 'active',
        check_in: '2027-06-10',
        check_out: '2027-06-13',
        guest_count: 2,
        payment_method: 'card',
        expires_at: new Date(Date.now() + 600_000),
        booker_name: 'Ada',
        booker_email: 'ada@example.com',
        booker_phone: '+33612345678',
        guest_note: '',
        price_snapshot: SNAPSHOT,
        ...overrides,
      };
    }

    function stay(overrides: Partial<StayRow> = {}): StayRow {
      return {
        id: '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
        organization_id: ORG,
        property_id: PROPERTY,
        house_id: HOUSE_A,
        check_in: '2027-06-10',
        check_out: '2027-06-13',
        guest_count: 2,
        total_cents: 54000,
        currency_code: 'EUR',
        booker_name: 'Ada',
        booker_email: 'ada@example.com',
        ...overrides,
      };
    }

    describe('getPayableHold', () => {
      it('returns the quoted total and discounts, not today\'s price', async () => {
        getHoldById.mockResolvedValue(row());

        const payable = await service.getPayableHold('hold-1');

        expect(payable).toMatchObject({ id: 'hold-1', totalCents: 54000, currencyCode: 'EUR', paymentMethod: 'card' });
        expect(payable.discounts).toEqual(SNAPSHOT.discounts);
      });

      it('prices an older hold with no snapshot from a live quote', async () => {
        getHoldById.mockResolvedValue(row({ price_snapshot: null }));

        const payable = await service.getPayableHold('hold-1');

        expect(payable.totalCents).toBe(54000);
        expect(payable.discounts).toEqual([]);
      });

      it('refuses a hold that timed out, with a clear code', async () => {
        getHoldById.mockResolvedValue(row({ expires_at: new Date(Date.now() - 1000) }));

        await expect(service.getPayableHold('hold-1')).rejects.toMatchObject({ response: { code: 'HOLD_EXPIRED' } });
      });

      it('refuses a hold that already ended', async () => {
        for (const status of ['expired', 'released', 'confirmed'] as const) {
          getHoldById.mockResolvedValue(row({ status }));

          await expect(service.getPayableHold('hold-1')).rejects.toMatchObject({ response: { code: 'HOLD_NOT_ACTIVE' } });
        }
      });

      it('returns not found for an unknown hold', async () => {
        getHoldById.mockResolvedValue(null);

        await expect(service.getPayableHold('nope')).rejects.toMatchObject({ response: { code: 'HOLD_NOT_FOUND' } });
      });
    });

    describe('confirmPaidHold', () => {
      it('turns the hold into a confirmation with a short reference', async () => {
        confirmPaidHold.mockResolvedValue(stay());

        const confirmation = await service.confirmPaidHold(fakeClient(), 'hold-1');

        expect(confirmation).toEqual({
          reservationId: '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d',
          reference: 'BK-1A2B3C4D5E',
          houseId: HOUSE_A,
          propertyId: PROPERTY,
          checkIn: '2027-06-10',
          checkOut: '2027-06-13',
          guestCount: 2,
          totalCents: 54000,
          currencyCode: 'EUR',
          bookerName: 'Ada',
          bookerEmail: 'ada@example.com',
        });
      });

      it('throws HOLD_EXPIRED when the hold is gone so a late payment confirms nothing', async () => {
        confirmPaidHold.mockResolvedValue(null);

        await expect(service.confirmPaidHold(fakeClient(), 'hold-1')).rejects.toMatchObject({ response: { code: 'HOLD_EXPIRED' } });
      });

      it('fills safe defaults when optional stay fields are empty', async () => {
        confirmPaidHold.mockResolvedValue(stay({ total_cents: null, currency_code: null, booker_name: null, booker_email: null }));

        const confirmation = await service.confirmPaidHold(fakeClient(), 'hold-1');

        expect(confirmation).toMatchObject({ totalCents: 0, currencyCode: 'EUR', bookerName: '', bookerEmail: '' });
      });
    });

    describe('getConfirmation and releaseHold', () => {
      it('returns the confirmation of a confirmed stay, or null', async () => {
        getConfirmedStay.mockResolvedValueOnce(stay()).mockResolvedValueOnce(null);

        expect((await service.getConfirmation('x'))?.reference).toBe('BK-1A2B3C4D5E');
        expect(await service.getConfirmation('y')).toBeNull();
      });

      it('gives the dates back and clears the hold timer', async () => {
        await service.releaseHold('hold-1');

        expect(releaseHold).toHaveBeenCalledWith('hold-1');
        expect(deleteHoldTtl).toHaveBeenCalledWith('hold-1');
      });
    });
  });
});
