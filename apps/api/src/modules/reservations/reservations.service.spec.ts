/**
 * @file apps/api/src/modules/reservations/reservations.service.spec.ts
 * @feature reservations
 * @dependencies ReservationsService, @nestjs/testing
 */

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type {
  CancellationReasonRow,
  DiscountUsageRow,
  PropertyBookingConfig,
  PropertyDetail,
  ReportAttention,
  StaffRefund,
  StaffReservation,
} from '@resort-booking/shared-types';
import type { HouseCatalogRow } from './report-summary.repository';
import type { PolicySnapshot } from './reservations.rules';
import { PropertyService } from '../property/property.service';
import { ReportSummaryRepository } from './report-summary.repository';
import { ReservationsRepository } from './reservations.repository';
import { ReservationsService } from './reservations.service';

const PROPERTY = 'property-1';
const CATALOG_LAKE: HouseCatalogRow = { houseId: 'house', houseName: 'Lake Chalet', propertyId: PROPERTY, propertyName: 'Alpine Lake', currencyCode: 'EUR' };
const CATALOG_BARN: HouseCatalogRow = { houseId: 'barn', houseName: 'Old Barn', propertyId: PROPERTY, propertyName: 'Alpine Lake', currencyCode: 'EUR' };
const NO_ATTENTION: ReportAttention = { unpaidHoldCount: 0, refundsToPayCount: 0, refundsToPayCents: 0, arrivalsTodayCount: 0, arrivalsNext7DaysCount: 0, unpaidAtHotelCount: 0, unpaidAtHotelCents: 0, unpaidAtHotelArrivalsNext7DaysCount: 0, unpaidAtHotelPastCount: 0 };

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
        { provide: ReportSummaryRepository, useValue: {} },
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
        { provide: ReportSummaryRepository, useValue: {} },
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
  const listConfirmedOverlapping = jest.fn<Promise<StaffReservation[]>, [string, string, string | null, string]>();
  const listPipelineOverlapping = jest.fn<Promise<StaffReservation[]>, [string, string, string | null, string]>();
  const houseCatalog = jest.fn<Promise<HouseCatalogRow[]>, [string | null, string]>();
  const cancellationsByReason = jest.fn<Promise<CancellationReasonRow[]>, [string, string, string | null, string]>();
  const cancellationRefunds = jest.fn<Promise<StaffRefund[]>, [string, string, string | null, string]>();
  const discountUsage = jest.fn<Promise<DiscountUsageRow[]>, [string, string, string | null, string]>();
  const attention = jest.fn<Promise<ReportAttention>, [string, string | null, string]>();
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
      paymentStatus: 'paid',
      paidAt: null,
      createdByName: null,
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
      extras: [],
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
    houseCatalog.mockResolvedValue([CATALOG_LAKE]);
    cancellationsByReason.mockResolvedValue([]);
    cancellationRefunds.mockResolvedValue([]);
    discountUsage.mockResolvedValue([]);
    attention.mockResolvedValue(NO_ATTENTION);
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReservationsService,
        { provide: ReservationsRepository, useValue: { listConfirmedOverlapping, listPipelineOverlapping } },
        {
          provide: ReportSummaryRepository,
          useValue: { houseCatalog, cancellationsByReason, cancellationRefunds, discountUsage, attention },
        },
        { provide: PropertyService, useValue: { getPublishedProperty: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(ReservationsService);
  });

  it('counts revenue from the confirmed NEW booking, never from the cancelled old one', async () => {
    const report = await service.getReport({ from: '2027-07-01', to: '2027-08-01', propertyId: PROPERTY }, 'org-1');

    expect(report.revenueCents).toBe(60000);
    expect(report.reservationCount).toBe(1);
    expect(report.occupiedNights).toBe(2);
  });

  it('shows the replaced booking as cancelled and the new one as a rebook', async () => {
    const report = await service.getReport({ from: '2027-07-01', to: '2027-08-01', propertyId: PROPERTY }, 'org-1');

    expect(report.cancelledCount).toBe(1);
    expect(report.rebookCount).toBe(1);
  });

  it('keeps the old booking out of occupied nights, so a changed booking is not counted twice', async () => {
    const report = await service.getReport({ from: '2027-07-01', to: '2027-08-01', propertyId: PROPERTY }, 'org-1');

    const oldNight = report.daily.find((day) => day.date === '2027-07-11');
    const newNight = report.daily.find((day) => day.date === '2027-07-20');
    expect(oldNight?.occupiedNights).toBe(0);
    expect(oldNight?.cancelledCount).toBe(1);
    expect(newNight?.occupiedNights).toBe(1);
  });

  it('shows the calendar lanes: the new booking as a rebook, the old one as cancelled', async () => {
    listPipelineOverlapping.mockResolvedValue([OLD, NEW]);

    const calendar = await service.getCalendar({ from: '2027-07-10', to: '2027-07-22', propertyId: PROPERTY }, 'org-1');

    const oldDay = calendar.days.find((day) => day.date === '2027-07-11');
    const newDay = calendar.days.find((day) => day.date === '2027-07-20');
    expect(oldDay).toMatchObject({ cancelledCount: 1, rebookCount: 0, bookingCount: 0 });
    expect(newDay).toMatchObject({ rebookCount: 1, cancelledCount: 0 });
  });
});

describe('ReservationsService.getReport owner numbers', () => {
  const listConfirmedOverlapping = jest.fn<Promise<StaffReservation[]>, [string, string, string | null, string]>();
  const listPipelineOverlapping = jest.fn<Promise<StaffReservation[]>, [string, string, string | null, string]>();
  const houseCatalog = jest.fn<Promise<HouseCatalogRow[]>, [string | null, string]>();
  const cancellationsByReason = jest.fn<Promise<CancellationReasonRow[]>, [string, string, string | null, string]>();
  const cancellationRefunds = jest.fn<Promise<StaffRefund[]>, [string, string, string | null, string]>();
  const discountUsage = jest.fn<Promise<DiscountUsageRow[]>, [string, string, string | null, string]>();
  const attention = jest.fn<Promise<ReportAttention>, [string, string | null, string]>();
  let service: ReservationsService;

  function booking(overrides: Partial<StaffReservation>): StaffReservation {
    return {
      id: 'b', organizationId: 'org', propertyId: PROPERTY, propertyName: 'Alpine Lake', houseId: 'house',
      houseName: 'Lake Chalet', checkIn: '2027-07-10', checkOut: '2027-07-12', guestCount: 2, bookerName: 'Ada',
      bookerEmail: 'ada@example.com', bookerPhone: '+33612345678', guestNote: '', paymentMethod: 'card', paymentStatus: 'paid', paidAt: null, createdByName: null,
      status: 'confirmed', kind: 'reservation', arrivalStatus: 'expected', rebookOfId: null, totalCents: 20000,
      currencyCode: 'EUR', requestNames: [], reference: 'BK-0000000000', paidCents: 20000, termsAcceptedAt: null,
      cancellation: null, replacedByReference: null, rebookOfReference: null, refunds: [], changes: [], extras: [],
      ...overrides,
    };
  }

  beforeEach(async () => {
    jest.resetAllMocks();
    listConfirmedOverlapping.mockResolvedValue([]);
    listPipelineOverlapping.mockResolvedValue([]);
    houseCatalog.mockResolvedValue([CATALOG_BARN, CATALOG_LAKE]);
    cancellationsByReason.mockResolvedValue([]);
    cancellationRefunds.mockResolvedValue([]);
    discountUsage.mockResolvedValue([]);
    attention.mockResolvedValue(NO_ATTENTION);
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReservationsService,
        { provide: ReservationsRepository, useValue: { listConfirmedOverlapping, listPipelineOverlapping } },
        { provide: ReportSummaryRepository, useValue: { houseCatalog, cancellationsByReason, cancellationRefunds, discountUsage, attention } },
        { provide: PropertyService, useValue: { getPublishedProperty: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(ReservationsService);
  });

  const RANGE = { from: '2027-07-01', to: '2027-07-11', propertyId: PROPERTY };

  it('asks for the equal-length period before and reports its headline numbers', async () => {
    listConfirmedOverlapping.mockImplementation(async (from: string): Promise<StaffReservation[]> =>
      from === '2027-07-01' ? [booking({ totalCents: 40000, checkIn: '2027-07-02', checkOut: '2027-07-04' })] : [booking({ id: 'old', totalCents: 10000, checkIn: '2027-06-21', checkOut: '2027-06-23' })],
    );

    const report = await service.getReport(RANGE, 'org-1');

    expect(listConfirmedOverlapping).toHaveBeenCalledWith('2027-06-21', '2027-07-01', PROPERTY, 'org-1');
    expect(report.previous).toMatchObject({ from: '2027-06-21', to: '2027-07-01', reservationCount: 1, grossRevenueCents: 10000, netRevenueCents: 10000 });
    expect(report.revenueCents).toBe(40000);
    expect(report.netRevenueCents).toBe(40000);
  });

  it('adds money kept from cancellations to gross and takes refunds off for net', async () => {
    listConfirmedOverlapping.mockImplementation(async (from: string): Promise<StaffReservation[]> =>
      from === '2027-07-01' ? [booking({ totalCents: 40000, checkIn: '2027-07-02', checkOut: '2027-07-04' })] : [],
    );
    cancellationsByReason.mockImplementation(async (from: string): Promise<CancellationReasonRow[]> =>
      from === '2027-07-01'
        ? [
            { reason: 'guest_request', cancelledCount: 1, paidCents: 32000, refundedCents: 8000 },
            { reason: 'property_cancelled', cancelledCount: 1, paidCents: 10000, refundedCents: 10000 },
          ]
        : [],
    );

    const report = await service.getReport(RANGE, 'org-1');

    expect(report.grossRevenueCents).toBe(40000 + 42000);
    expect(report.refundedCents).toBe(18000);
    expect(report.netRevenueCents).toBe(64000);
    expect(report.cancellationReasons).toHaveLength(2);
    expect(report.cancellationRatePercent).toBe(66.7); // 2 cancelled of 1 confirmed + 2
  });

  it('lists every stay of the property, booked or not, with the stay count per property', async () => {
    listConfirmedOverlapping.mockImplementation(async (from: string): Promise<StaffReservation[]> =>
      from === '2027-07-01' ? [booking({})] : [],
    );

    const report = await service.getReport(RANGE, 'org-1');

    expect(report.houseCount).toBe(2);
    expect(report.availableNights).toBe(20);
    expect(report.properties).toHaveLength(1);
    expect(report.properties[0]?.houseCount).toBe(2);
    expect(report.properties[0]?.houses.map((house) => [house.houseName, house.reservationCount])).toEqual([
      ['Old Barn', 0],
      ['Lake Chalet', 1],
    ]);
  });

  it('passes discount usage, refunds and attention through, as of the report date', async () => {
    discountUsage.mockResolvedValue([{ discountId: 'd', label: 'Long stay', redemptionCount: 2, discountCents: 5000 }]);
    attention.mockResolvedValue({ ...NO_ATTENTION, refundsToPayCount: 2, refundsToPayCents: 9000 });

    const report = await service.getReport(RANGE, 'org-1');

    expect(report.discountUsage).toEqual([{ discountId: 'd', label: 'Long stay', redemptionCount: 2, discountCents: 5000 }]);
    expect(report.attention.refundsToPayCount).toBe(2);
    expect(attention).toHaveBeenCalledWith(report.asOfDate, PROPERTY, 'org-1');
  });

  it('is all zero for a period without anything', async () => {
    const report = await service.getReport(RANGE, 'org-1');

    expect(report).toMatchObject({ reservationCount: 0, netRevenueCents: 0, cancellationRatePercent: 0, occupancyPercent: 0 });
    expect(report.previous.netRevenueCents).toBe(0);
  });

  it('rejects a range that ends before it starts', async () => {
    await expect(service.getReport({ from: '2027-07-11', to: '2027-07-01' }, 'org-1')).rejects.toMatchObject({ response: { code: 'INVALID_DATES' } });
  });
});

describe('ReservationsService passes the caller organization to every staff read', () => {
  const listPipelineOverlapping = jest.fn<Promise<StaffReservation[]>, [string, string, string | null, string]>();
  const listPipelineOnDate = jest.fn<Promise<StaffReservation[]>, [string, string | null, string]>();
  const listConfirmedOverlapping = jest.fn<Promise<StaffReservation[]>, [string, string, string | null, string]>();
  const listBookingConfig = jest.fn<Promise<PropertyBookingConfig[]>, [string]>();
  const houseCatalog = jest.fn<Promise<HouseCatalogRow[]>, [string | null, string]>();
  const cancellationsByReason = jest.fn<Promise<CancellationReasonRow[]>, [string, string, string | null, string]>();
  const cancellationRefunds = jest.fn<Promise<StaffRefund[]>, [string, string, string | null, string]>();
  const discountUsage = jest.fn<Promise<DiscountUsageRow[]>, [string, string, string | null, string]>();
  const attention = jest.fn<Promise<ReportAttention>, [string, string | null, string]>();
  let service: ReservationsService;

  beforeEach(async () => {
    jest.resetAllMocks();
    listPipelineOverlapping.mockResolvedValue([]);
    listPipelineOnDate.mockResolvedValue([]);
    listConfirmedOverlapping.mockResolvedValue([]);
    listBookingConfig.mockResolvedValue([]);
    houseCatalog.mockResolvedValue([]);
    cancellationsByReason.mockResolvedValue([]);
    cancellationRefunds.mockResolvedValue([]);
    discountUsage.mockResolvedValue([]);
    attention.mockResolvedValue({ unpaidHoldCount: 0, refundsToPayCount: 0, refundsToPayCents: 0, arrivalsTodayCount: 0, arrivalsNext7DaysCount: 0, unpaidAtHotelCount: 0, unpaidAtHotelCents: 0, unpaidAtHotelArrivalsNext7DaysCount: 0, unpaidAtHotelPastCount: 0 });
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReservationsService,
        {
          provide: ReservationsRepository,
          useValue: { listPipelineOverlapping, listPipelineOnDate, listConfirmedOverlapping, listBookingConfig },
        },
        { provide: ReportSummaryRepository, useValue: { houseCatalog, cancellationsByReason, cancellationRefunds, discountUsage, attention } },
        { provide: PropertyService, useValue: { getPublishedProperty: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(ReservationsService);
  });

  it('calendar, day list and configuration list use the caller organization', async () => {
    await service.getCalendar({ from: '2027-07-10', to: '2027-07-12' }, 'org-B');
    await service.listOnDate({ onDate: '2027-07-10' }, 'org-B');
    await service.listConfig('org-B');

    expect(listPipelineOverlapping).toHaveBeenCalledWith('2027-07-10', '2027-07-12', null, 'org-B');
    expect(listPipelineOnDate).toHaveBeenCalledWith('2027-07-10', null, 'org-B');
    expect(listBookingConfig).toHaveBeenCalledWith('org-B');
  });

  it('every statement of the report (both periods) uses the caller organization', async () => {
    await service.getReport({ from: '2027-07-01', to: '2027-08-01' }, 'org-B');

    for (const call of [
      ...listConfirmedOverlapping.mock.calls,
      ...listPipelineOverlapping.mock.calls,
      ...cancellationsByReason.mock.calls,
      ...cancellationRefunds.mock.calls,
      ...discountUsage.mock.calls,
    ]) {
      expect(call[3]).toBe('org-B');
    }
    expect(houseCatalog.mock.calls[0]?.[1]).toBe('org-B');
    expect(attention.mock.calls[0]?.[2]).toBe('org-B');
    expect(listConfirmedOverlapping).toHaveBeenCalledTimes(2);
    expect(cancellationsByReason).toHaveBeenCalledTimes(2);
  });

  describe('range cap (R2-03: no request may build millions of days)', () => {
    const BAD: Array<[string, string, string]> = [
      ['0001-01-01', '9999-12-31', 'INVALID_DATES'],
      ['0100-01-01', '9999-12-31', 'INVALID_DATES'],
      ['2000-01-01', '2100-12-31', 'RANGE_TOO_LONG'],
      ['2027-01-01', '2028-02-06', 'RANGE_TOO_LONG'],
      ['2027-07-10', '2027-07-10', 'INVALID_DATES'],
      ['2027-07-11', '2027-07-10', 'INVALID_DATES'],
      ['2027-02-30', '2027-03-05', 'INVALID_DATES'],
      ['2027-07-10', '2101-01-01', 'INVALID_DATES'],
    ];

    it.each(BAD)('calendar and report refuse %s to %s with %s before any query', async (from, to, code) => {
      await expect(service.getCalendar({ from, to }, 'org-1')).rejects.toMatchObject({ response: { code } });
      await expect(service.getReport({ from, to }, 'org-1')).rejects.toMatchObject({ response: { code } });
      expect(listPipelineOverlapping).not.toHaveBeenCalled();
      expect(listConfirmedOverlapping).not.toHaveBeenCalled();
    });

    it('RANGE_TOO_LONG and INVALID_DATES are 400s', async () => {
      await expect(service.getCalendar({ from: '2000-01-01', to: '2100-12-31' }, 'org-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts exactly 400 nights (a whole leap year and more) for both', async () => {
      await expect(service.getCalendar({ from: '2027-01-01', to: '2028-02-05' }, 'org-1')).resolves.toMatchObject({ days: expect.any(Array) });
      await expect(service.getReport({ from: '2027-01-01', to: '2028-02-05' }, 'org-1')).resolves.toBeDefined();
    });

    it('accepts the presets the admin app sends: last year and this year', async () => {
      await expect(service.getReport({ from: '2025-01-01', to: '2026-01-01' }, 'org-1')).resolves.toBeDefined();
      await expect(service.getReport({ from: '2028-01-01', to: '2029-01-01' }, 'org-1')).resolves.toBeDefined();
    });
  });
});
