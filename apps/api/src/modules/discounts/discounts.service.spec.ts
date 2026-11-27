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
import { GuestEmailKeyService } from './guest-email-key';

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
    promoted: false,
    oncePerGuest: false,
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
    mapLatitude: 45.9,
    mapLongitude: 6.1,
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
  const replaceRedemptions = jest.fn<Promise<void>, [PoolClient, string, string, readonly QuoteDiscountLine[]]>();
  const getPropertyById = jest.fn<Promise<PropertyDetail | null>, [string]>();
  const listHousesByPropertyId = jest.fn<Promise<HouseSummary[]>, [string]>();
  const onceOnlyIds = jest.fn();
  const usedByKey = jest.fn();
  const bookerEmailOf = jest.fn();
  const keyFor = jest.fn<string, [string]>();
  let service: DiscountsService;

  beforeEach(async (): Promise<void> => {
    jest.resetAllMocks();
    keyFor.mockImplementation((email: string): string => `key:${email}`);
    getPropertyById.mockResolvedValue(propertyDetail());
    listHousesByPropertyId.mockResolvedValue([houseSummary(HOUSE_A), houseSummary(HOUSE_B)]);
    insert.mockImplementation((scope, write) => Promise.resolve({ ...discount(), ...write, propertyId: scope.propertyId }));
    listForProperties.mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        DiscountsService,
        {
          provide: DiscountsRepository,
          useValue: { listForProperties, getById, insert, update, delete: remove, recordRedemptions, replaceRedemptions, onceOnlyIds, usedByKey, bookerEmailOf },
        },
        {
          provide: GuestEmailKeyService,
          useValue: { keyFor },
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

    it('does not need a priority (the admin no longer sends one) and stores the default', async () => {
      const withoutPriority = dto();
      delete withoutPriority.priority;
      await service.create(PROPERTY, withoutPriority);

      expect(insert).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ priority: 100 }));
    });

    it('still accepts a priority from an older client', async () => {
      await service.create(PROPERTY, dto({ priority: 250 }));

      expect(insert).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ priority: 250 }));
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

    it('does not advertise a discount unless asked to', async () => {
      await service.create(PROPERTY, dto());
      expect(insert.mock.calls[0]?.[1].promoted).toBe(false);
    });

    it('saves the "show on the website" choice', async () => {
      await service.create(PROPERTY, dto({ promoted: true }));
      expect(insert.mock.calls[0]?.[1].promoted).toBe(true);
    });

    it('lets staff advertise a promo-code discount (the code becomes public by their choice)', async () => {
      await service.create(PROPERTY, dto({ promoted: true, conditions: [{ kind: 'promo_code', code: 'WELCOME15' }] }));
      expect(insert.mock.calls[0]?.[1]).toMatchObject({ promoted: true, conditions: [{ kind: 'promo_code', code: 'WELCOME15' }] });
    });

    it('keeps a promo-code discount private unless asked', async () => {
      await service.create(PROPERTY, dto({ conditions: [{ kind: 'promo_code', code: 'WELCOME15' }] }));
      expect(insert.mock.calls[0]?.[1].promoted).toBe(false);
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

    it('updates the "show on the website" choice', async () => {
      getById.mockResolvedValue(discount());
      update.mockResolvedValue(discount({ promoted: true }));
      await service.update('d1', dto({ promoted: true }));
      expect(update).toHaveBeenCalledWith('d1', expect.objectContaining({ promoted: true }));
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
    const lines: QuoteDiscountLine[] = [{ discountId: 'd1', label: 'Long stay', amountCents: 6000 }];

    it('hands the applied discounts to the repository in one call, with no email key when none is limited', async () => {
      onceOnlyIds.mockResolvedValue(new Set<string>());
      const client = fakeClient();

      await service.recordRedemptions(client, 'block-1', lines);

      expect(recordRedemptions).toHaveBeenCalledTimes(1);
      expect(recordRedemptions).toHaveBeenCalledWith(client, 'block-1', [{ discountId: 'd1', amountCents: 6000, emailKey: null }]);
      expect(bookerEmailOf).not.toHaveBeenCalled();
    });

    it('records nothing and asks nothing for a booking with no discounts', async () => {
      await service.recordRedemptions(fakeClient(), 'block-1', []);

      expect(onceOnlyIds).not.toHaveBeenCalled();
      expect(recordRedemptions).toHaveBeenCalledWith(expect.anything(), 'block-1', []);
    });

    it('adds the guest\'s email key only to a discount limited to once per guest', async () => {
      onceOnlyIds.mockResolvedValue(new Set(['d2']));
      bookerEmailOf.mockResolvedValue('ada@example.com');
      usedByKey.mockResolvedValue(new Set<string>());
      const client = fakeClient();

      await service.recordRedemptions(client, 'block-1', [
        { discountId: 'd1', label: 'Long stay', amountCents: 6000 },
        { discountId: 'd2', label: 'Welcome code', amountCents: 2000 },
      ]);

      expect(usedByKey).toHaveBeenCalledWith(client, ['d2'], 'key:ada@example.com', null);
      expect(recordRedemptions).toHaveBeenCalledWith(client, 'block-1', [
        { discountId: 'd1', amountCents: 6000, emailKey: null },
        { discountId: 'd2', amountCents: 2000, emailKey: 'key:ada@example.com' },
      ]);
    });

    it('refuses with PROMO_ALREADY_USED, and records nothing, when that email already used the code', async () => {
      onceOnlyIds.mockResolvedValue(new Set(['d1']));
      bookerEmailOf.mockResolvedValue('ada@example.com');
      usedByKey.mockResolvedValue(new Set(['d1']));

      await expect(service.recordRedemptions(fakeClient(), 'block-1', lines)).rejects.toMatchObject({
        status: 409,
        response: { code: 'PROMO_ALREADY_USED', message: 'This code has already been used with this email address' },
      });
      expect(recordRedemptions).not.toHaveBeenCalled();
    });

    it('turns the unique index refusing a racing second use into the same PROMO_ALREADY_USED, and leaves other errors alone', async () => {
      onceOnlyIds.mockResolvedValue(new Set(['d1']));
      bookerEmailOf.mockResolvedValue('ada@example.com');
      usedByKey.mockResolvedValue(new Set<string>());
      recordRedemptions.mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: '23505', constraint: 'discount_redemptions_one_use_per_email_key' }));
      await expect(service.recordRedemptions(fakeClient(), 'block-1', lines)).rejects.toMatchObject({ response: { code: 'PROMO_ALREADY_USED' } });

      recordRedemptions.mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: '23505', constraint: 'something_else' }));
      await expect(service.recordRedemptions(fakeClient(), 'block-1', lines)).rejects.toThrow('duplicate');
    });

    it('cannot limit a booking that has no email (anonymised): it records the use without a key', async () => {
      onceOnlyIds.mockResolvedValue(new Set(['d1']));
      bookerEmailOf.mockResolvedValue(null);

      await service.recordRedemptions(fakeClient(), 'block-1', lines);

      expect(usedByKey).not.toHaveBeenCalled();
      expect(recordRedemptions).toHaveBeenCalledWith(expect.anything(), 'block-1', [{ discountId: 'd1', amountCents: 6000, emailKey: null }]);
    });
  });

  describe('moveRedemptions', () => {
    const lines: QuoteDiscountLine[] = [{ discountId: 'd1', label: 'Long stay', amountCents: 6000 }];

    it('moves discount use from the old booking to the one that replaces it, with what the new one got', async () => {
      onceOnlyIds.mockResolvedValue(new Set<string>());
      const client = fakeClient();

      await service.moveRedemptions(client, 'old-booking', 'new-booking', lines);

      expect(replaceRedemptions).toHaveBeenCalledTimes(1);
      expect(replaceRedemptions).toHaveBeenCalledWith(client, 'old-booking', 'new-booking', [{ discountId: 'd1', amountCents: 6000, emailKey: null }]);
    });

    it('can move to a booking with no discounts at all (the old rows still go)', async () => {
      await service.moveRedemptions(fakeClient(), 'old-booking', 'new-booking', []);

      expect(replaceRedemptions).toHaveBeenCalledWith(expect.anything(), 'old-booking', 'new-booking', []);
    });

    it('does not count the guest\'s own use in the booking being replaced against the replacement, and carries the key over', async () => {
      onceOnlyIds.mockResolvedValue(new Set(['d1']));
      bookerEmailOf.mockResolvedValue('ada@example.com');
      usedByKey.mockResolvedValue(new Set<string>());
      const client = fakeClient();

      await service.moveRedemptions(client, 'old-booking', 'new-booking', lines);

      expect(bookerEmailOf).toHaveBeenCalledWith(client, 'new-booking');
      expect(usedByKey).toHaveBeenCalledWith(client, ['d1'], 'key:ada@example.com', 'old-booking');
      expect(replaceRedemptions).toHaveBeenCalledWith(client, 'old-booking', 'new-booking', [{ discountId: 'd1', amountCents: 6000, emailKey: 'key:ada@example.com' }]);
    });

    it('still refuses when ANOTHER booking of the same email used the code', async () => {
      onceOnlyIds.mockResolvedValue(new Set(['d1']));
      bookerEmailOf.mockResolvedValue('ada@example.com');
      usedByKey.mockResolvedValue(new Set(['d1']));

      await expect(service.moveRedemptions(fakeClient(), 'old-booking', 'new-booking', lines)).rejects.toMatchObject({ response: { code: 'PROMO_ALREADY_USED' } });
      expect(replaceRedemptions).not.toHaveBeenCalled();
    });
  });

  describe('assertGuestMayUse (before holding or making a booking)', () => {
    const lines: QuoteDiscountLine[] = [{ discountId: 'd1', label: 'Welcome code', amountCents: 2000 }];

    it('asks nothing for a booking without discounts or without an email', async () => {
      await service.assertGuestMayUse([], 'ada@example.com');
      await service.assertGuestMayUse(lines, '  ');
      await service.assertGuestMayUse(lines, null);
      expect(usedByKey).not.toHaveBeenCalled();
    });

    it('lets the booking through when the email has not used the code', async () => {
      usedByKey.mockResolvedValue(new Set<string>());
      await expect(service.assertGuestMayUse(lines, 'Ada@Example.com')).resolves.toBeUndefined();
      expect(usedByKey).toHaveBeenCalledWith(undefined, ['d1'], 'key:Ada@Example.com', null);
    });

    it('refuses with 409 PROMO_ALREADY_USED and a plain message when the email used it', async () => {
      usedByKey.mockResolvedValue(new Set(['d1']));
      await expect(service.assertGuestMayUse(lines, 'ada@example.com')).rejects.toMatchObject({
        status: 409,
        response: { code: 'PROMO_ALREADY_USED', message: 'This code has already been used with this email address' },
      });
    });
  });

  describe('once per guest on write', () => {
    it('saves the switch with a promo code and defaults it to off', async () => {
      await service.create(PROPERTY, dto({ conditions: [{ kind: 'promo_code', code: 'WELCOME15' }], oncePerGuest: true }));
      expect(insert.mock.calls[0]?.[1]).toMatchObject({ oncePerGuest: true });
      await service.create(PROPERTY, dto({ conditions: [{ kind: 'promo_code', code: 'WELCOME15' }] }));
      expect(insert.mock.calls[1]?.[1]).toMatchObject({ oncePerGuest: false });
    });

    it('refuses the switch without a promo code, and a coupon that also carries other rules', async () => {
      await expect(service.create(PROPERTY, dto({ oncePerGuest: true }))).rejects.toMatchObject({ response: { code: 'INVALID_DISCOUNT', message: 'Once per guest needs a promo code' } });
      await expect(
        service.create(PROPERTY, dto({ conditions: [{ kind: 'promo_code', code: 'WELCOME15' }, { kind: 'min_nights', nights: 3 }] })),
      ).rejects.toMatchObject({ response: { code: 'INVALID_DISCOUNT' } });
      expect(insert).not.toHaveBeenCalled();
    });
  });
});
