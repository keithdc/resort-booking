/**
 * @file apps/api/src/modules/reservations/reservations.service.spec.ts
 * @feature reservations
 * @dependencies ReservationsService, @nestjs/testing
 */

import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PropertyBookingConfig, PropertyDetail } from '@resort-booking/shared-types';
import type { PolicySnapshot } from './reservations.rules';
import { PropertyService } from '../property/property.service';
import { ReservationsRepository } from './reservations.repository';
import { ReservationsService } from './reservations.service';

const PROPERTY = 'property-1';

function property(): PropertyDetail {
  return {
    id: PROPERTY,
    organizationId: 'org',
    slug: 'alpine-lake',
    name: 'Alpine Lake',
    description: '',
    city: 'Annecy',
    countryCode: 'FR',
    latitude: 45.9,
    longitude: 6.1,
    phone: '+33450123456',
    email: 'stay@example.com',
    published: true,
    timezone: 'Europe/Paris',
    coverPhotoUrl: null,
    customRequestsEnabled: false,
    addressLine: '8 Route du Lac',
    postalCode: '74000',
    photos: [],
  };
}

function config(overrides: Partial<PropertyBookingConfig> = {}): PropertyBookingConfig {
  return {
    propertyId: PROPERTY,
    propertyName: 'Alpine Lake',
    rebookable: true,
    rebookFeeType: 'fixed',
    rebookFeeValue: 25,
    tiers: [
      { id: 't0', propertyId: PROPERTY, minDaysBeforeCheckIn: 0, refundPercent: 0 },
      { id: 't7', propertyId: PROPERTY, minDaysBeforeCheckIn: 7, refundPercent: 100 },
      { id: 't3', propertyId: PROPERTY, minDaysBeforeCheckIn: 3, refundPercent: 75 },
    ],
    ...overrides,
  };
}

describe('ReservationsService.getPublicPolicy', () => {
  const getPublishedProperty = jest.fn<Promise<PropertyDetail>, [string]>();
  const getBookingConfig = jest.fn<Promise<PropertyBookingConfig | null>, [string]>();
  const getPolicySnapshot = jest.fn<Promise<PolicySnapshot | null>, [string]>();
  let service: ReservationsService;

  beforeEach(async (): Promise<void> => {
    jest.resetAllMocks();
    getPublishedProperty.mockResolvedValue(property());
    getBookingConfig.mockResolvedValue(config());
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReservationsService,
        { provide: ReservationsRepository, useValue: { getBookingConfig, getPolicySnapshot } },
        { provide: PropertyService, useValue: { getPublishedProperty } },
      ],
    }).compile();
    service = moduleRef.get(ReservationsService);
  });

  it('returns the refund ladder highest days first, whatever order it was stored in', async () => {
    const policy = await service.getPublicPolicy('alpine-lake');

    expect(policy.tiers).toEqual([
      { minDaysBeforeCheckIn: 7, refundPercent: 100 },
      { minDaysBeforeCheckIn: 3, refundPercent: 75 },
      { minDaysBeforeCheckIn: 0, refundPercent: 0 },
    ]);
  });

  it('returns the date-change rule and fee', async () => {
    const policy = await service.getPublicPolicy('alpine-lake');

    expect(policy).toMatchObject({ propertyId: PROPERTY, rebookable: true, rebookFeeType: 'fixed', rebookFeeValue: 25 });
  });

  it('exposes nothing internal: no tier ids, no names, only what a guest needs', async () => {
    const policy = await service.getPublicPolicy('alpine-lake');

    expect(Object.keys(policy).sort()).toEqual(['propertyId', 'rebookFeeType', 'rebookFeeValue', 'rebookable', 'tiers']);
    expect(Object.keys(policy.tiers[0] ?? {}).sort()).toEqual(['minDaysBeforeCheckIn', 'refundPercent']);
  });

  it('reads the policy of the published property the slug names', async () => {
    await service.getPublicPolicy('alpine-lake');

    expect(getPublishedProperty).toHaveBeenCalledWith('alpine-lake');
    expect(getBookingConfig).toHaveBeenCalledWith(PROPERTY);
  });

  it('says so when a property has no ladder yet, instead of inventing one', async () => {
    getBookingConfig.mockResolvedValue(config({ tiers: [], rebookable: false, rebookFeeType: 'none', rebookFeeValue: 0 }));

    const policy = await service.getPublicPolicy('alpine-lake');

    expect(policy.tiers).toEqual([]);
    expect(policy.rebookable).toBe(false);
  });

  it('is a 404 for an unpublished or unknown property, without reading its policy', async () => {
    getPublishedProperty.mockRejectedValue(new NotFoundException({ message: 'Property not found', code: 'PROPERTY_NOT_FOUND' }));

    await expect(service.getPublicPolicy('hidden')).rejects.toBeInstanceOf(NotFoundException);
    expect(getBookingConfig).not.toHaveBeenCalled();
  });

  it('is a 404 when the settings row is missing', async () => {
    getBookingConfig.mockResolvedValue(null);

    await expect(service.getPublicPolicy('alpine-lake')).rejects.toMatchObject({ response: { code: 'PROPERTY_NOT_FOUND' } });
  });
});

describe('ReservationsService.getPolicySnapshot', () => {
  const getBookingConfig = jest.fn<Promise<PropertyBookingConfig | null>, [string]>();
  const getPolicySnapshot = jest.fn<Promise<PolicySnapshot | null>, [string]>();
  let service: ReservationsService;

  beforeEach(async (): Promise<void> => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReservationsService,
        { provide: ReservationsRepository, useValue: { getBookingConfig, getPolicySnapshot } },
        { provide: PropertyService, useValue: { getPublishedProperty: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(ReservationsService);
  });

  it('returns the property\'s current policy from one targeted lookup, not the all-properties read', async () => {
    const snapshot: PolicySnapshot = { tiers: [{ minDaysBeforeCheckIn: 7, refundPercent: 100 }], rebookable: false, rebookFeeType: 'none', rebookFeeValue: 0 };
    getPolicySnapshot.mockResolvedValue(snapshot);

    await expect(service.getPolicySnapshot('prop')).resolves.toEqual(snapshot);

    expect(getPolicySnapshot).toHaveBeenCalledTimes(1);
    expect(getPolicySnapshot).toHaveBeenCalledWith('prop');
    expect(getBookingConfig).not.toHaveBeenCalled();
  });

  it('is a 404 for a property that does not exist', async () => {
    getPolicySnapshot.mockResolvedValue(null);

    await expect(service.getPolicySnapshot('missing')).rejects.toMatchObject({ response: { code: 'PROPERTY_NOT_FOUND' } });
  });
});
