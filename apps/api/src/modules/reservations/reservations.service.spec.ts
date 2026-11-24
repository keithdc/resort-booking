/**
 * @file apps/api/src/modules/reservations/reservations.service.spec.ts
 * @feature reservations
 * @dependencies ReservationsService, @nestjs/testing
 */

import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PropertyBookingConfig, PropertyDetail, StaffReservation } from '@resort-booking/shared-types';
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

describe('ReservationsService.getReport after a guest changed the dates of a booking', () => {
  const listConfirmedOverlapping = jest.fn<Promise<StaffReservation[]>, [string, string, string | null]>();
  const listPipelineOverlapping = jest.fn<Promise<StaffReservation[]>, [string, string, string | null]>();
  const countHouses = jest.fn<Promise<number>, [string | null]>();
  let service: ReservationsService;

  function stay(overrides: Partial<StaffReservation>): StaffReservation {
    return {
      id: 'x',
      organizationId: 'org',
      propertyId: PROPERTY,
      propertyName: 'Alpine Lake',
      houseId: 'house',
      houseName: 'Lake Chalet',
      checkIn: '2027-07-10',
      checkOut: '2027-07-13',
      guestCount: 2,
      bookerName: 'Ada',
      bookerEmail: 'ada@example.com',
      bookerPhone: '+33612345678',
      guestNote: '',
      paymentMethod: 'card',
      status: 'confirmed',
      kind: 'reservation',
      arrivalStatus: 'expected',
      rebookOfId: null,
      totalCents: 96000,
      currencyCode: 'EUR',
      requestNames: [],
      reference: 'BK-0000000000',
      paidCents: 0,
      termsAcceptedAt: null,
      cancellation: null,
      replacedByReference: null,
      rebookOfReference: null,
      refunds: [],
      changes: [],
      ...overrides,
    };
  }

  // The old booking is cancelled (replaced), the new one is confirmed and points back at it.
  const OLD = stay({ id: 'old', status: 'cancelled', totalCents: 96000 });
  const NEW = stay({ id: 'new', checkIn: '2027-07-20', checkOut: '2027-07-22', totalCents: 60000, rebookOfId: 'old' });

  beforeEach(async () => {
    jest.resetAllMocks();
    listConfirmedOverlapping.mockResolvedValue([NEW]);
    listPipelineOverlapping.mockResolvedValue([OLD, NEW]);
    countHouses.mockResolvedValue(1);
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReservationsService,
        { provide: ReservationsRepository, useValue: { listConfirmedOverlapping, listPipelineOverlapping, countHouses } },
        { provide: PropertyService, useValue: { getPublishedProperty: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(ReservationsService);
  });

  it('counts revenue from the confirmed NEW booking, never from the cancelled old one', async () => {
    const report = await service.getReport({ from: '2027-07-01', to: '2027-08-01', propertyId: PROPERTY });

    expect(report.revenueCents).toBe(60000);
    expect(report.reservationCount).toBe(1);
    expect(report.occupiedNights).toBe(2);
  });

  it('shows the replaced booking as cancelled and the new one as a rebook', async () => {
    const report = await service.getReport({ from: '2027-07-01', to: '2027-08-01', propertyId: PROPERTY });

    expect(report.cancelledCount).toBe(1);
    expect(report.rebookCount).toBe(1);
  });

  it('keeps the old booking out of occupied nights, so a changed booking is not counted twice', async () => {
    const report = await service.getReport({ from: '2027-07-01', to: '2027-08-01', propertyId: PROPERTY });

    const oldNight = report.daily.find((day) => day.date === '2027-07-11');
    const newNight = report.daily.find((day) => day.date === '2027-07-20');
    expect(oldNight?.occupiedNights).toBe(0);
    expect(oldNight?.cancelledCount).toBe(1);
    expect(newNight?.occupiedNights).toBe(1);
  });

  it('shows the calendar lanes: the new booking as a rebook, the old one as cancelled', async () => {
    listPipelineOverlapping.mockResolvedValue([OLD, NEW]);

    const calendar = await service.getCalendar({ from: '2027-07-10', to: '2027-07-22', propertyId: PROPERTY });

    const oldDay = calendar.days.find((day) => day.date === '2027-07-11');
    const newDay = calendar.days.find((day) => day.date === '2027-07-20');
    expect(oldDay).toMatchObject({ cancelledCount: 1, rebookCount: 0, bookingCount: 0 });
    expect(newDay).toMatchObject({ rebookCount: 1, cancelledCount: 0 });
  });
});
