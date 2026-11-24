/**
 * @file apps/api/src/modules/discounts/offers.service.spec.ts
 * @feature discounts
 */

import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Discount, HouseSummary, PropertyDetail } from '@resort-booking/shared-types';
import { PropertyService } from '../property/property.service';
import { DiscountsRepository } from './discounts.repository';
import { OffersService } from './offers.service';

function property(timezone: string): PropertyDetail {
  return {
    id: 'p1',
    organizationId: 'o1',
    slug: 'alpine-lake',
    name: 'Alpine Lake',
    description: '',
    city: 'Annecy',
    countryCode: 'FR',
    latitude: 0,
    longitude: 0,
    phone: '',
    email: '',
    published: true,
    timezone,
    coverPhotoUrl: null,
    customRequestsEnabled: false,
    addressLine: '',
    postalCode: '',
    photos: [],
  };
}

function stay(): HouseSummary {
  return {
    id: 'h1',
    organizationId: 'o1',
    propertyId: 'p1',
    propertySlug: 'alpine-lake',
    propertyName: 'Alpine Lake',
    propertyCity: 'Annecy',
    propertyCountryCode: 'FR',
    propertyTimezone: 'Europe/Paris',
    propertyAddressLine: '',
    propertyPostalCode: '',
    slug: 'lake-chalet',
    name: 'Lake Chalet',
    description: '',
    capacity: 4,
    published: true,
    nightlyRateCents: 10000,
    currencyCode: 'EUR',
    coverPhotoUrl: null,
    mapLatitude: 0,
    mapLongitude: 0,
  };
}

function windowOffer(): Discount {
  return {
    id: 'd1',
    propertyId: 'p1',
    label: 'Spring sale',
    effect: { kind: 'percent', percent: 10 },
    conditions: [{ kind: 'booking_window', startDate: '2027-05-01', endDate: '2027-05-31' }],
    alwaysOn: false,
    houseIds: null,
    combinable: false,
    priority: 100,
    active: true,
    maxRedemptions: null,
    promoted: true,
    redemptions: 0,
  };
}

describe('OffersService', () => {
  const getPublishedProperty = jest.fn<Promise<PropertyDetail>, [string]>();
  const listPublishedHouses = jest.fn<Promise<HouseSummary[]>, [string]>();
  const listPromotedForProperty = jest.fn<Promise<Discount[]>, [string]>();
  let service: OffersService;

  beforeEach(async (): Promise<void> => {
    jest.resetAllMocks();
    getPublishedProperty.mockResolvedValue(property('Europe/Paris'));
    listPublishedHouses.mockResolvedValue([stay()]);
    listPromotedForProperty.mockResolvedValue([windowOffer()]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        OffersService,
        { provide: DiscountsRepository, useValue: { listPromotedForProperty } },
        { provide: PropertyService, useValue: { getPublishedProperty, listPublishedHouses } },
      ],
    }).compile();
    service = moduleRef.get(OffersService);
  });

  it('returns the property\'s advertised offers, asking each source once', async () => {
    const offers = await service.listForProperty('alpine-lake', new Date('2027-05-10T12:00:00Z'));

    expect(offers.map((offer) => offer.headline)).toEqual(['Save 10% when you book by 31 May 2027']);
    expect(getPublishedProperty).toHaveBeenCalledTimes(1);
    expect(listPublishedHouses).toHaveBeenCalledTimes(1);
    expect(listPromotedForProperty).toHaveBeenCalledWith('p1');
    expect(listPromotedForProperty).toHaveBeenCalledTimes(1);
  });

  it('uses the property\'s own date: a window that opens at local midnight is not open yet', async () => {
    // 2027-04-30 23:30 UTC is already 2027-05-01 01:30 in Paris (summer time).
    const open = await service.listForProperty('alpine-lake', new Date('2027-04-30T23:30:00Z'));
    expect(open).toHaveLength(1);

    getPublishedProperty.mockResolvedValue(property('America/Los_Angeles'));
    const notYet = await service.listForProperty('alpine-lake', new Date('2027-04-30T23:30:00Z'));
    expect(notYet).toEqual([]);
  });

  it('returns an empty list when nothing is advertised', async () => {
    listPromotedForProperty.mockResolvedValue([]);
    await expect(service.listForProperty('alpine-lake')).resolves.toEqual([]);
  });

  it('is not found for an unknown or unpublished property', async () => {
    getPublishedProperty.mockRejectedValue(new NotFoundException({ message: 'Property not found', code: 'PROPERTY_NOT_FOUND' }));
    await expect(service.listForProperty('nope')).rejects.toBeInstanceOf(NotFoundException);
    expect(listPromotedForProperty).not.toHaveBeenCalled();
  });
});
