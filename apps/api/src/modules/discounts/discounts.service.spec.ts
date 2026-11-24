/**
 * @file apps/api/src/modules/discounts/discounts.service.spec.ts
 * @feature discounts
 * @dependencies DiscountsService, @nestjs/testing
 */

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Discount, DiscountWrite, HouseSummary, PropertyDetail, QuoteDiscountLine } from '@resort-booking/shared-types';
import { Client, type PoolClient } from 'pg';
import { PropertyRepository } from '../property/property.repository';
import type { DiscountWriteDto } from './dto/discount-write.dto';
import { DiscountsRepository, type PropertyScope } from './discounts.repository';
import { DiscountsService } from './discounts.service';

const PROPERTY = 'property-1';
const OTHER_PROPERTY = 'property-2';
const ORG = 'org-1';
const HOUSE_A = 'house-a';
const HOUSE_B = 'house-b';

function discount(overrides: Partial<Discount> = {}): Discount {
  return {
    id: 'd1',
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
    redemptions: 0,
    ...overrides,
  };
}

function dto(overrides: Partial<DiscountWriteDto> = {}): DiscountWriteDto {
  return {
    label: 'Long stay',
    effect: { kind: 'percent', percent: 10 },
    conditions: [{ kind: 'min_nights', nights: 7 }],
    alwaysOn: false,
    houseIds: null,
    combinable: false,
    priority: 100,
    active: true,
    maxRedemptions: null,
    ...overrides,
  };
}

function propertyDetail(): PropertyDetail {
  return {
    id: PROPERTY,
    organizationId: ORG,
    slug: 'p',
    name: 'P',
    description: '',
    city: '',
    countryCode: 'FR',
    latitude: 0,
    longitude: 0,
    phone: '',
    email: '',
    published: true,
    timezone: 'Europe/Paris',
    coverPhotoUrl: null,
    customRequestsEnabled: false,
    addressLine: '',
    postalCode: '',
    photos: [],
  };
}

function houseSummary(id: string): HouseSummary {
  return {
    id,
    organizationId: ORG,
    propertyId: PROPERTY,
    propertySlug: 'p',
    propertyName: 'P',
    propertyCity: '',
    propertyCountryCode: 'FR',
    propertyTimezone: 'Europe/Paris',
    propertyAddressLine: '',
    propertyPostalCode: '',
    slug: id,
    name: id,
    description: '',
    capacity: 4,
    published: true,
    nightlyRateCents: 10000,
    currencyCode: 'EUR',
    coverPhotoUrl: null,
  };
}

function fakeClient(): PoolClient {
  return Object.assign(new Client(), { release: (): void => undefined });
}

describe('DiscountsService', () => {
  const listForProperties = jest.fn<Promise<Discount[]>, [readonly string[], boolean]>();
  const getById = jest.fn<Promise<Discount | null>, [string]>();
  const insert = jest.fn<Promise<Discount>, [PropertyScope, DiscountWrite]>();
  const update = jest.fn<Promise<Discount | null>, [string, DiscountWrite]>();
  const remove = jest.fn<Promise<boolean>, [string]>();
  const recordRedemptions = jest.fn<Promise<void>, [PoolClient, string, readonly QuoteDiscountLine[]]>();
  const getPropertyById = jest.fn<Promise<PropertyDetail | null>, [string]>();
  const listHousesByPropertyId = jest.fn<Promise<HouseSummary[]>, [string]>();
  let service: DiscountsService;

  beforeEach(async (): Promise<void> => {
    jest.resetAllMocks();
    getPropertyById.mockResolvedValue(propertyDetail());
    listHousesByPropertyId.mockResolvedValue([houseSummary(HOUSE_A), houseSummary(HOUSE_B)]);
    insert.mockImplementation((scope, write) => Promise.resolve({ ...discount(), ...write, propertyId: scope.propertyId }));
    listForProperties.mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        DiscountsService,
        {
          provide: DiscountsRepository,
          useValue: { listForProperties, getById, insert, update, delete: remove, recordRedemptions },
        },
        { provide: PropertyRepository, useValue: { getPropertyById, listHousesByPropertyId } },
      ],
    }).compile();
    service = moduleRef.get(DiscountsService);
  });

  describe('evaluate', () => {
    const house = { id: HOUSE_A, propertyId: PROPERTY, propertyTimezone: 'Europe/Paris' };
    const nights = ['2027-07-10', '2027-07-11', '2027-07-12'];

    it('applies a matching discount to the subtotal', () => {
      const outcome = service.evaluate({ house, nights, subtotalCents: 60000, promoCode: null, discounts: [discount()] });

      expect(outcome.discountCents).toBe(6000);
    });

    it('ignores discounts that belong to another property', () => {
      const outcome = service.evaluate({
        house,
        nights,
        subtotalCents: 60000,
        promoCode: null,
        discounts: [discount({ id: 'other', propertyId: OTHER_PROPERTY })],
      });

      expect(outcome.lines).toEqual([]);
    });

    it('uses the property timezone for "today" in booking windows', () => {
      const windowed = discount({ conditions: [{ kind: 'booking_window', startDate: '2027-05-02', endDate: '2027-05-02' }] });
      // 22:30 UTC on 1 May is already 2 May in Paris (summer time).
      const now = new Date('2027-05-01T22:30:00Z');

      const paris = service.evaluate({ house, nights, subtotalCents: 60000, promoCode: null, discounts: [windowed], now });
      const utcHouse = { ...house, propertyTimezone: 'UTC' };
      const utc = service.evaluate({ house: utcHouse, nights, subtotalCents: 60000, promoCode: null, discounts: [windowed], now });

      expect(paris.discountCents).toBe(6000);
      expect(utc.discountCents).toBe(0);
    });

    it('gives no discount for a stay with no nights', () => {
      expect(service.evaluate({ house, nights: [], subtotalCents: 60000, promoCode: null, discounts: [discount()] })).toEqual({
        lines: [],
        discountCents: 0,
        promoCode: null,
      });
    });
  });

  describe('loadActive and list', () => {
    it('loads only active discounts, for many properties in one query, for guests', async () => {
      await service.loadActive([PROPERTY, OTHER_PROPERTY]);

      expect(listForProperties).toHaveBeenCalledTimes(1);
      expect(listForProperties).toHaveBeenCalledWith([PROPERTY, OTHER_PROPERTY], true);
    });

    it('lists switched-off discounts too for staff', async () => {
      await service.list(PROPERTY);

      expect(listForProperties).toHaveBeenCalledWith([PROPERTY], false);
    });

    it('returns not found for an unknown property', async () => {
      getPropertyById.mockResolvedValue(null);

      await expect(service.list(PROPERTY)).rejects.toBeInstanceOf(NotFoundException);
      expect(listForProperties).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('saves a valid discount under the property and organization', async () => {
      await service.create(PROPERTY, dto());

      expect(insert).toHaveBeenCalledWith(
        { organizationId: ORG, propertyId: PROPERTY },
        expect.objectContaining({ label: 'Long stay', conditions: [{ kind: 'min_nights', nights: 7 }] }),
      );
    });

    it('drops unknown fields from the rules instead of storing them', async () => {
      await service.create(PROPERTY, dto({ effect: { kind: 'percent', percent: 10, evil: true } }));

      expect(insert.mock.calls[0]?.[1].effect).toEqual({ kind: 'percent', percent: 10 });
    });

    it.each([
      ['an unknown effect', { effect: { kind: 'free' } }],
      ['a malformed condition', { conditions: [{ kind: 'mystery' }] }],
      ['a percentage over 100', { effect: { kind: 'percent', percent: 150 } }],
      ['no conditions without always-on', { conditions: [] }],
      ['an empty house list', { houseIds: [] }],
      ['a blank name', { label: '  ' }],
    ])('rejects %s with INVALID_DISCOUNT', async (_name, patch) => {
      await expect(service.create(PROPERTY, dto(patch))).rejects.toMatchObject({ response: { code: 'INVALID_DISCOUNT' } });
      expect(insert).not.toHaveBeenCalled();
    });

    it('accepts an explicit always-on discount', async () => {
      await service.create(PROPERTY, dto({ conditions: [], alwaysOn: true }));

      expect(insert).toHaveBeenCalledTimes(1);
    });

    it('rejects a house that belongs to another property', async () => {
      await expect(service.create(PROPERTY, dto({ houseIds: [HOUSE_A, 'stranger'] }))).rejects.toMatchObject({
        response: { code: 'UNKNOWN_HOUSE' },
      });
      expect(insert).not.toHaveBeenCalled();
    });

    it('accepts a discount limited to some houses of the property', async () => {
      await service.create(PROPERTY, dto({ houseIds: [HOUSE_A] }));

      expect(insert.mock.calls[0]?.[1].houseIds).toEqual([HOUSE_A]);
    });

    it('returns not found for an unknown property', async () => {
      getPropertyById.mockResolvedValue(null);

      await expect(service.create(PROPERTY, dto())).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update and remove', () => {
    it('updates an existing discount', async () => {
      getById.mockResolvedValue(discount());
      update.mockResolvedValue(discount({ label: 'Renamed' }));

      const updated = await service.update('d1', dto({ label: 'Renamed' }));

      expect(updated.label).toBe('Renamed');
      expect(update).toHaveBeenCalledWith('d1', expect.objectContaining({ label: 'Renamed' }));
    });

    it('checks the houses against the discount\'s own property', async () => {
      getById.mockResolvedValue(discount({ propertyId: PROPERTY }));

      await service.update('d1', dto({ houseIds: [HOUSE_A] }));

      expect(listHousesByPropertyId).toHaveBeenCalledWith(PROPERTY);
    });

    it('returns not found when the discount is gone', async () => {
      getById.mockResolvedValue(null);

      await expect(service.update('d1', dto())).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects invalid rules on update', async () => {
      getById.mockResolvedValue(discount());

      await expect(service.update('d1', dto({ effect: { kind: 'percent', percent: 0 } }))).rejects.toBeInstanceOf(BadRequestException);
      expect(update).not.toHaveBeenCalled();
    });

    it('removes a discount, and reports one that was already deleted', async () => {
      remove.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

      await expect(service.remove('d1')).resolves.toBeUndefined();
      await expect(service.remove('d1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('recordRedemptions', () => {
    it('hands the applied discount lines to the repository in one call', async () => {
      const lines: QuoteDiscountLine[] = [{ discountId: 'd1', label: 'Long stay', amountCents: 6000 }];
      const client = fakeClient();

      await service.recordRedemptions(client, 'block-1', lines);

      expect(recordRedemptions).toHaveBeenCalledTimes(1);
      expect(recordRedemptions).toHaveBeenCalledWith(client, 'block-1', lines);
    });
  });
});
