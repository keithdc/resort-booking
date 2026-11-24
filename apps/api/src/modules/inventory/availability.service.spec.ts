/**
 * @file apps/api/src/modules/inventory/availability.service.spec.ts
 * @feature inventory
 * @dependencies AvailabilityService, @nestjs/testing
 */

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { HouseDetail, HouseSummary, PropertyDetail } from '@resort-booking/shared-types';
import { PropertyRepository } from '../property/property.repository';
import { AvailabilityService } from './availability.service';
import { InventoryRepository, type OccupiedRangeRow } from './inventory.repository';

const TODAY = '2027-06-10';
const HOUSE_A = '33333333-3333-3333-3333-333333333333';
const HOUSE_B = '44444444-4444-4444-4444-444444444444';

function houseSummary(id: string, slug: string): HouseSummary {
  return {
    id,
    organizationId: 'org',
    propertyId: 'prop',
    propertySlug: 'alpine-lake',
    propertyName: 'Alpine Lake',
    propertyCity: 'Annecy',
    propertyCountryCode: 'FR',
    propertyTimezone: 'Europe/Paris',
    propertyAddressLine: '8 Route du Lac',
    propertyPostalCode: '74000',
    slug,
    name: slug,
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

function houseDetail(id: string, slug: string): HouseDetail {
  return {
    ...houseSummary(id, slug),
    latitude: null,
    longitude: null,
    photos: [],
    amenities: [],
    propertyPhone: '+33000000',
    propertyEmail: 'stay@example.com',
    propertyLatitude: 45.9,
    propertyLongitude: 6.1,
  };
}

function propertyDetail(): PropertyDetail {
  return {
    id: 'prop',
    organizationId: 'org',
    slug: 'alpine-lake',
    name: 'Alpine Lake',
    description: '',
    city: 'Annecy',
    countryCode: 'FR',
    latitude: 45.9,
    longitude: 6.1,
    phone: '+33000000',
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

function row(houseId: string, checkIn: string, checkOut: string): OccupiedRangeRow {
  return { house_id: houseId, check_in: checkIn, check_out: checkOut };
}

describe('AvailabilityService', () => {
  const getHouseBySlugs = jest.fn<Promise<HouseDetail | null>, [string, string, boolean]>();
  const getPropertyBySlug = jest.fn<Promise<PropertyDetail | null>, [string, boolean]>();
  const listHousesByPropertySlug = jest.fn<Promise<HouseSummary[]>, [string | null, boolean]>();
  const listOccupiedRanges = jest.fn<Promise<OccupiedRangeRow[]>, [readonly string[], string, string, (string | null)?]>();
  let service: AvailabilityService;

  beforeEach(async (): Promise<void> => {
    // Fake only the clock so "today" is deterministic; leave timers/microtasks real.
    jest.useFakeTimers({
      now: new Date(`${TODAY}T12:00:00Z`),
      doNotFake: [
        'nextTick',
        'setImmediate',
        'clearImmediate',
        'setTimeout',
        'clearTimeout',
        'setInterval',
        'clearInterval',
        'queueMicrotask',
        'performance',
        'hrtime',
      ],
    });
    jest.resetAllMocks();
    getHouseBySlugs.mockResolvedValue(houseDetail(HOUSE_A, 'lake-chalet'));
    getPropertyBySlug.mockResolvedValue(propertyDetail());
    listHousesByPropertySlug.mockResolvedValue([
      houseSummary(HOUSE_A, 'lake-chalet'),
      houseSummary(HOUSE_B, 'spruce-studio'),
    ]);
    listOccupiedRanges.mockResolvedValue([]);

    const moduleRef = await Test.createTestingModule({
      providers: [
        AvailabilityService,
        {
          provide: PropertyRepository,
          useValue: { getHouseBySlugs, getPropertyBySlug, listHousesByPropertySlug },
        },
        { provide: InventoryRepository, useValue: { listOccupiedRanges } },
      ],
    }).compile();
    service = moduleRef.get(AvailabilityService);
  });

  afterEach((): void => {
    jest.useRealTimers();
  });

  describe('getHouseAvailability', (): void => {
    it('returns merged unavailable ranges and no checkout limit without a check-in', async (): Promise<void> => {
      listOccupiedRanges.mockResolvedValue([
        row(HOUSE_A, '2027-06-20', '2027-06-24'),
        row(HOUSE_A, '2027-06-24', '2027-06-27'),
        row(HOUSE_A, '2027-07-05', '2027-07-08'),
      ]);

      const result = await service.getHouseAvailability('alpine-lake', 'lake-chalet', {
        to: '2027-08-01',
      });

      expect(result.unavailable).toEqual([
        { startDate: '2027-06-20', endDate: '2027-06-27' },
        { startDate: '2027-07-05', endDate: '2027-07-08' },
      ]);
      expect(result.maxCheckOutDate).toBeNull();
      expect(result.from).toBe(TODAY);
    });

    it('queries the repository once, for the published house only', async (): Promise<void> => {
      await service.getHouseAvailability('alpine-lake', 'lake-chalet', {});

      expect(getHouseBySlugs).toHaveBeenCalledWith('alpine-lake', 'lake-chalet', true);
      expect(listOccupiedRanges).toHaveBeenCalledTimes(1);
      expect(listOccupiedRanges).toHaveBeenCalledWith([HOUSE_A], TODAY, '2028-06-10');
    });

    it('limits check-out to the day the next stay starts', async (): Promise<void> => {
      listOccupiedRanges.mockResolvedValue([row(HOUSE_A, '2027-06-20', '2027-06-24')]);

      const result = await service.getHouseAvailability('alpine-lake', 'lake-chalet', {
        to: '2027-08-01',
        checkIn: '2027-06-15',
      });

      expect(result.maxCheckOutDate).toBe('2027-06-20');
    });

    it('allows the previous guest check-out day as a new check-in', async (): Promise<void> => {
      listOccupiedRanges.mockResolvedValue([row(HOUSE_A, '2027-06-20', '2027-06-24')]);

      const result = await service.getHouseAvailability('alpine-lake', 'lake-chalet', {
        to: '2027-08-01',
        checkIn: '2027-06-24',
      });

      expect(result.maxCheckOutDate).toBe('2027-08-01');
    });

    it('rejects a check-in on an occupied night', async (): Promise<void> => {
      listOccupiedRanges.mockResolvedValue([row(HOUSE_A, '2027-06-20', '2027-06-24')]);

      await expect(
        service.getHouseAvailability('alpine-lake', 'lake-chalet', {
          to: '2027-08-01',
          checkIn: '2027-06-22',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects a past check-in and one outside the window', async (): Promise<void> => {
      await expect(
        service.getHouseAvailability('alpine-lake', 'lake-chalet', { checkIn: '2027-06-01' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.getHouseAvailability('alpine-lake', 'lake-chalet', {
          to: '2027-07-01',
          checkIn: '2027-07-01',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects inverted and oversized windows', async (): Promise<void> => {
      await expect(
        service.getHouseAvailability('alpine-lake', 'lake-chalet', {
          from: '2027-07-01',
          to: '2027-06-20',
        }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.getHouseAvailability('alpine-lake', 'lake-chalet', { to: '2030-01-01' }),
      ).rejects.toThrow(BadRequestException);
      expect(listOccupiedRanges).not.toHaveBeenCalled();
    });

    it('returns not found for an unknown or unpublished house', async (): Promise<void> => {
      getHouseBySlugs.mockResolvedValue(null);

      await expect(
        service.getHouseAvailability('alpine-lake', 'nope', {}),
      ).rejects.toThrow(NotFoundException);
      expect(listOccupiedRanges).not.toHaveBeenCalled();
    });

    it('never exposes guest data in the response', async (): Promise<void> => {
      listOccupiedRanges.mockResolvedValue([row(HOUSE_A, '2027-06-20', '2027-06-24')]);

      const result = await service.getHouseAvailability('alpine-lake', 'lake-chalet', {});

      expect(Object.keys(result).sort()).toEqual(['from', 'houseId', 'maxCheckOutDate', 'to', 'unavailable']);
      expect(Object.keys(result.unavailable[0] ?? {}).sort()).toEqual(['endDate', 'startDate']);
    });
  });

  describe('getPropertyAvailability', (): void => {
    it('reports only nights when every house is taken, using one occupancy query', async (): Promise<void> => {
      listOccupiedRanges.mockResolvedValue([
        row(HOUSE_A, '2027-06-20', '2027-06-30'),
        row(HOUSE_B, '2027-06-25', '2027-07-05'),
      ]);

      const result = await service.getPropertyAvailability('alpine-lake', { to: '2027-08-01' });

      expect(result.fullyBookedNights).toEqual([{ startDate: '2027-06-25', endDate: '2027-06-30' }]);
      expect(listOccupiedRanges).toHaveBeenCalledTimes(1);
      expect(listOccupiedRanges).toHaveBeenCalledWith([HOUSE_A, HOUSE_B], TODAY, '2027-08-01');
    });

    it('reports nothing when one house is free for the whole window', async (): Promise<void> => {
      listOccupiedRanges.mockResolvedValue([row(HOUSE_A, '2027-06-20', '2027-06-30')]);

      const result = await service.getPropertyAvailability('alpine-lake', { to: '2027-08-01' });

      expect(result.fullyBookedNights).toEqual([]);
    });

    it('reports nothing when the property has no published houses', async (): Promise<void> => {
      listHousesByPropertySlug.mockResolvedValue([]);

      const result = await service.getPropertyAvailability('alpine-lake', {});

      expect(result.fullyBookedNights).toEqual([]);
      expect(result.propertyId).toBe('prop');
    });

    it('returns not found for an unknown or unpublished property', async (): Promise<void> => {
      getPropertyBySlug.mockResolvedValue(null);

      await expect(service.getPropertyAvailability('nope', {})).rejects.toThrow(NotFoundException);
      expect(listOccupiedRanges).not.toHaveBeenCalled();
    });
  });

  describe('getStayAvailabilityExcluding (a guest changing the dates of their booking)', () => {
    it('leaves the booking\'s own row out of the taken nights, so its own dates count as free', async () => {
      await service.getStayAvailabilityExcluding(HOUSE_A, 'Europe/Paris', 'booking-1');

      expect(listOccupiedRanges).toHaveBeenCalledTimes(1);
      expect(listOccupiedRanges).toHaveBeenCalledWith([HOUSE_A], TODAY, '2028-06-10', 'booking-1');
    });

    it('returns the other bookings merged, for this one stay only, with no check-out limit', async () => {
      listOccupiedRanges.mockResolvedValue([
        { house_id: HOUSE_A, check_in: '2027-06-20', check_out: '2027-06-24' },
        { house_id: HOUSE_A, check_in: '2027-06-24', check_out: '2027-06-27' },
      ]);

      const result = await service.getStayAvailabilityExcluding(HOUSE_A, 'Europe/Paris', 'booking-1', { to: '2027-08-01' });

      expect(result).toEqual({
        houseId: HOUSE_A,
        from: TODAY,
        to: '2027-08-01',
        unavailable: [{ startDate: '2027-06-20', endDate: '2027-06-27' }],
        maxCheckOutDate: null,
      });
    });

    it('uses the property timezone for "today"', async () => {
      jest.setSystemTime(new Date('2027-06-10T23:30:00Z'));

      const result = await service.getStayAvailabilityExcluding(HOUSE_A, 'Europe/Paris', 'booking-1');

      expect(result.from).toBe('2027-06-11');
    });

    it('rejects an oversized window like the public endpoint', async () => {
      await expect(service.getStayAvailabilityExcluding(HOUSE_A, 'Europe/Paris', 'booking-1', { to: '2030-01-01' })).rejects.toBeInstanceOf(BadRequestException);
      expect(listOccupiedRanges).not.toHaveBeenCalled();
    });

    it('never exposes who holds the other nights: dates only', async () => {
      listOccupiedRanges.mockResolvedValue([{ house_id: HOUSE_A, check_in: '2027-06-20', check_out: '2027-06-24' }]);

      const result = await service.getStayAvailabilityExcluding(HOUSE_A, 'Europe/Paris', 'booking-1');

      expect(Object.keys(result).sort()).toEqual(['from', 'houseId', 'maxCheckOutDate', 'to', 'unavailable']);
      expect(Object.keys(result.unavailable[0] ?? {}).sort()).toEqual(['endDate', 'startDate']);
    });
  });
});
