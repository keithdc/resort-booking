/**
 * @file apps/api/src/modules/inventory/staff-booking-creator.spec.ts
 * @feature inventory
 * @dependencies StaffBookingCreator
 */

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { ExtraService, Quote, StaffCreateBookingRequest, StaffReservation } from '@resort-booking/shared-types';
import { DatabaseService } from '../../shared/database/database.service';
import type { StaffAccount } from '../../shared/roles/staff-role';
import { DiscountsService } from '../discounts/discounts.service';
import { ExtrasRepository } from '../extras/extras.repository';
import { ReservationExtrasRepository } from '../extras/reservation-extras.repository';
import { PropertyRepository } from '../property/property.repository';
import { ReservationsService } from '../reservations/reservations.service';
import { InventoryRepository } from './inventory.repository';
import { InventoryService } from './inventory.service';
import { StaffBookingCreator } from './staff-booking-creator';

const STAFF: StaffAccount = { id: 'staff-1', organizationId: 'org', fullName: 'Sam', email: 's@example.com', role: 'employee', organizationName: 'Org', canManageRefunds: false };

/** A date `days` from today, as YYYY-MM-DD (kept well inside the property's time zone rollover). */
const inDays = (days: number): string => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

const REQUEST: StaffCreateBookingRequest = {
  houseId: 'house',
  checkIn: inDays(30),
  checkOut: inDays(33),
  guestCount: 2,
  paymentMethod: 'pay_at_hotel',
  bookerName: '  Ada Lovelace ',
  bookerEmail: ' ada@example.com ',
  bookerPhone: '',
  guestNote: ' late arrival ',
};

function quote(overrides: Partial<Quote> = {}): Quote {
  return {
    houseId: 'house', checkIn: REQUEST.checkIn, checkOut: REQUEST.checkOut, guestCount: 2, nights: 3, nightlyRateCents: 32000,
    lines: [], subtotalCents: 96000, discounts: [{ id: 'd1', label: '10% off', amountCents: 9600 } as never], discountCents: 9600,
    totalCents: 86400, currencyCode: 'EUR', available: true, promoCode: null, ...overrides,
  } as Quote;
}

function extra(overrides: Partial<ExtraService> = {}): ExtraService {
  return { id: 'ex-1', organizationId: 'org', propertyId: 'prop', name: 'Breakfast basket', description: '', kind: 'instant', priceCents: 1800, currencyCode: 'EUR', published: true, ...overrides };
}

describe('StaffBookingCreator', () => {
  const listPublishedForBooking = jest.fn();
  const insertAllExtras = jest.fn();
  const getHouseById = jest.fn();
  const getQuote = jest.fn();
  const insertStaffBooking = jest.fn();
  const recordRedemptions = jest.fn();
  const getPolicySnapshot = jest.fn();
  const getReservation = jest.fn();
  const clientQuery = jest.fn();
  let creator: StaffBookingCreator;

  beforeEach(async (): Promise<void> => {
    jest.resetAllMocks();
    getHouseById.mockResolvedValue({ id: 'house', propertyId: 'prop', organizationId: 'org', propertyTimezone: 'Europe/Paris' });
    listPublishedForBooking.mockResolvedValue([extra(), extra({ id: 'ex-2', name: 'Extra pillows', kind: 'on_request', priceCents: 0 })]);
    insertAllExtras.mockResolvedValue(undefined);
    getQuote.mockResolvedValue(quote());
    insertStaffBooking.mockResolvedValue('new-1');
    recordRedemptions.mockResolvedValue(undefined);
    getPolicySnapshot.mockResolvedValue({ tiers: [], rebookable: false, rebookFeeType: 'none', rebookFeeValue: 0 });
    getReservation.mockResolvedValue({ id: 'new-1', paymentStatus: 'pending' } as StaffReservation);
    clientQuery.mockResolvedValue({ rows: [] });
    const moduleRef = await Test.createTestingModule({
      providers: [
        StaffBookingCreator,
        { provide: PropertyRepository, useValue: { getHouseById } },
        { provide: InventoryService, useValue: { getQuote } },
        { provide: InventoryRepository, useValue: { insertStaffBooking } },
        { provide: DatabaseService, useValue: { withClient: (run: (client: unknown) => Promise<unknown>): Promise<unknown> => run({ query: clientQuery }) } },
        { provide: DiscountsService, useValue: { recordRedemptions } },
        { provide: ReservationsService, useValue: { getPolicySnapshot, getReservation } },
        { provide: ExtrasRepository, useValue: { listPublishedForBooking } },
        { provide: ReservationExtrasRepository, useValue: { insertAll: insertAllExtras } },
      ],
    }).compile();
    creator = moduleRef.get(StaffBookingCreator);
  });

  describe('quote', () => {
    it('prices the stay for staff without the public-only rules (works for an unpublished stay)', async () => {
      const result = await creator.quote(STAFF, REQUEST);

      expect(result.totalCents).toBe(86400);
      expect(getQuote).toHaveBeenCalledWith({ houseId: 'house', checkIn: REQUEST.checkIn, checkOut: REQUEST.checkOut, guestCount: 2 }, false);
    });

    it('answers 404 for a stay of another organization or an unknown one', async () => {
      getHouseById.mockResolvedValueOnce({ id: 'house', propertyId: 'p', organizationId: 'other', propertyTimezone: 'Europe/Paris' });
      await expect(creator.quote(STAFF, REQUEST)).rejects.toBeInstanceOf(NotFoundException);
      getHouseById.mockResolvedValueOnce(null);
      await expect(creator.quote(STAFF, REQUEST)).rejects.toBeInstanceOf(NotFoundException);
      expect(getQuote).not.toHaveBeenCalled();
    });

    it('refuses a check-in in the past (property time) and one too far ahead', async () => {
      await expect(creator.quote(STAFF, { ...REQUEST, checkIn: '2000-01-01', checkOut: '2000-01-03' })).rejects.toMatchObject({
        response: { code: 'PAST_CHECK_IN' },
      });
      await expect(creator.quote(STAFF, { ...REQUEST, checkIn: '9999-01-01', checkOut: '9999-01-03' })).rejects.toBeInstanceOf(BadRequestException);
      expect(getQuote).not.toHaveBeenCalled();
    });

    it('adds no extras line and does not look at the catalog when none are chosen', async () => {
      const result = await creator.quote(STAFF, REQUEST);

      expect(result.extras).toEqual([]);
      expect(result.extrasCents).toBe(0);
      expect(listPublishedForBooking).not.toHaveBeenCalled();
    });

    it('adds an instant extra (price x quantity) to the total and an on-request extra at nothing, keeping the stay figures', async () => {
      const result = await creator.quote(STAFF, { ...REQUEST, extras: [{ extraId: 'ex-1', quantity: 2 }, { extraId: 'ex-2', quantity: 3 }] });

      expect(listPublishedForBooking).toHaveBeenCalledWith('prop', 'org');
      expect(result.extrasCents).toBe(3600);
      expect(result.totalCents).toBe(86400 + 3600);
      expect(result.subtotalCents).toBe(96000);
      expect(result.discountCents).toBe(9600);
      expect(result.extras).toEqual([
        { extraId: 'ex-1', name: 'Breakfast basket', kind: 'instant', quantity: 2, unitPriceCents: 1800, lineCents: 3600, currencyCode: 'EUR' },
        { extraId: 'ex-2', name: 'Extra pillows', kind: 'on_request', quantity: 3, unitPriceCents: 0, lineCents: 0, currencyCode: 'EUR' },
      ]);
    });

    it('answers 404 for an extra the stay\'s property does not offer (another property, another organization, unpublished or unknown)', async () => {
      await expect(creator.quote(STAFF, { ...REQUEST, extras: [{ extraId: 'elsewhere', quantity: 1 }] })).rejects.toMatchObject({
        status: 404,
        response: { code: 'EXTRA_NOT_FOUND' },
      });
    });

    it('refuses the same extra twice and a priced extra in another currency than the stay', async () => {
      await expect(creator.quote(STAFF, { ...REQUEST, extras: [{ extraId: 'ex-1', quantity: 1 }, { extraId: 'ex-1', quantity: 2 }] })).rejects.toMatchObject({
        status: 400,
        response: { code: 'DUPLICATE_EXTRA' },
      });
      listPublishedForBooking.mockResolvedValue([extra({ currencyCode: 'USD' })]);
      await expect(creator.quote(STAFF, { ...REQUEST, extras: [{ extraId: 'ex-1', quantity: 1 }] })).rejects.toMatchObject({
        status: 400,
        response: { code: 'EXTRA_CURRENCY_MISMATCH' },
      });
    });

    it('accepts a check-in today in the property\'s own time zone', async () => {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
      const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date(Date.now() + 86_400_000));

      await expect(creator.quote(STAFF, { ...REQUEST, checkIn: today, checkOut: tomorrow })).resolves.toBeDefined();
    });
  });

  describe('create', () => {
    it('saves a pending pay-at-hotel booking with the quoted price, trimmed text and who made it', async () => {
      const booking = await creator.create(STAFF, REQUEST);

      expect(booking).toEqual({ id: 'new-1', paymentStatus: 'pending' });
      expect(insertStaffBooking).toHaveBeenCalledTimes(1);
      const input = insertStaffBooking.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(input).toMatchObject({
        organizationId: 'org', propertyId: 'prop', houseId: 'house', checkIn: REQUEST.checkIn, checkOut: REQUEST.checkOut, guestCount: 2,
        bookerName: 'Ada Lovelace', bookerEmail: 'ada@example.com', bookerPhone: '', guestNote: 'late arrival',
        totalCents: 86400, currencyCode: 'EUR', createdByStaffId: 'staff-1',
      });
      expect(JSON.parse(String(input.priceSnapshot))).toMatchObject({ totalCents: 86400, discountCents: 9600 });
      expect(JSON.parse(String(input.policySnapshot))).toMatchObject({ rebookable: false });
      expect(clientQuery.mock.calls.map((call) => String(call[0]))).toEqual(['BEGIN', 'COMMIT']);
    });

    it('saves the extras in the same transaction, with the whole total (stay plus instant extras) on the booking', async () => {
      await creator.create(STAFF, { ...REQUEST, extras: [{ extraId: 'ex-1', quantity: 2 }, { extraId: 'ex-2', quantity: 1 }] });

      const input = insertStaffBooking.mock.calls[0]?.[1] as Record<string, unknown>;
      expect(input.totalCents).toBe(86400 + 3600);
      // The saved price keeps the stay's own total and says what the extras add on top.
      expect(JSON.parse(String(input.priceSnapshot))).toMatchObject({ totalCents: 86400, extrasCents: 3600, discountCents: 9600 });
      expect(insertAllExtras).toHaveBeenCalledTimes(1);
      expect(insertAllExtras.mock.calls[0]?.[1]).toMatchObject({ organizationId: 'org', propertyId: 'prop', bookingId: 'new-1' });
      expect((insertAllExtras.mock.calls[0]?.[1] as { lines: unknown[] }).lines).toHaveLength(2);
      expect(clientQuery.mock.calls.map((call) => String(call[0]))).toEqual(['BEGIN', 'COMMIT']);
    });

    it('saves nothing when an extra is refused', async () => {
      await expect(creator.create(STAFF, { ...REQUEST, extras: [{ extraId: 'elsewhere', quantity: 1 }] })).rejects.toMatchObject({ status: 404 });
      expect(insertStaffBooking).not.toHaveBeenCalled();
      expect(insertAllExtras).not.toHaveBeenCalled();
    });

    it('rolls the booking back when its extras cannot be saved', async () => {
      insertAllExtras.mockRejectedValue(new Error('extras insert failed'));

      await expect(creator.create(STAFF, { ...REQUEST, extras: [{ extraId: 'ex-1', quantity: 1 }] })).rejects.toThrow('extras insert failed');
      expect(clientQuery.mock.calls.map((call) => String(call[0]))).toEqual(['BEGIN', 'ROLLBACK']);
    });

    it('counts the discounts it applied toward their use limits, in the same transaction', async () => {
      await creator.create(STAFF, REQUEST);

      expect(recordRedemptions).toHaveBeenCalledWith(expect.anything(), 'new-1', quote().discounts);
    });

    it('says 409 and writes nothing when the dates are not free', async () => {
      getQuote.mockResolvedValue(quote({ available: false }));

      await expect(creator.create(STAFF, REQUEST)).rejects.toMatchObject({ status: 409, response: { code: 'DATES_UNAVAILABLE' } });
      expect(insertStaffBooking).not.toHaveBeenCalled();
    });

    it('turns a clash found by the database (someone booked a moment ago) into the same 409, and rolls back', async () => {
      insertStaffBooking.mockRejectedValue(Object.assign(new Error('conflicting key value violates exclusion constraint'), { code: '23P01' }));

      await expect(creator.create(STAFF, REQUEST)).rejects.toBeInstanceOf(ConflictException);
      expect(clientQuery.mock.calls.map((call) => String(call[0]))).toEqual(['BEGIN', 'ROLLBACK']);
      expect(getReservation).not.toHaveBeenCalled();
    });

    it('rolls back and rethrows anything else', async () => {
      recordRedemptions.mockRejectedValue(new Error('connection lost'));

      await expect(creator.create(STAFF, REQUEST)).rejects.toThrow('connection lost');
      expect(clientQuery.mock.calls.map((call) => String(call[0]))).toEqual(['BEGIN', 'ROLLBACK']);
    });
  });
});
