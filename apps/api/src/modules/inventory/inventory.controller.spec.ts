/**
 * @file apps/api/src/modules/inventory/inventory.controller.spec.ts
 * @feature inventory
 */

import { HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Hold, HouseAvailability, HouseSearchResult, PropertyAvailability, Quote } from '@resort-booking/shared-types';
import type { Request } from 'express';
import { AvailabilityService } from './availability.service';
import type { CreateHoldDto } from './dto/create-hold.dto';
import { QuoteQueryDto } from './dto/quote-query.dto';
import { HoldRateLimiter } from './hold-rate-limiter';
import { InventoryController } from './inventory.controller';
import { InventoryService, type HoldCaller, type HoldCaps } from './inventory.service';
import { PromoRateLimiter } from './promo-rate-limiter';

const REQUEST: Request = Object.assign(Object.create(null) as Request, { ip: '203.0.113.7' });
const BODY: CreateHoldDto = Object.assign(new (class Dto {})() as CreateHoldDto, {
  houseId: '33333333-3333-3333-3333-333333333331',
  checkIn: '2027-07-10',
  checkOut: '2027-07-12',
  guestCount: 2,
  paymentMethod: 'card' as const,
  bookerName: 'Ada',
  bookerEmail: 'ada@example.com',
  bookerPhone: '+33612345678',
  termsAccepted: true,
  promoCode: 'WELCOME15',
  guestNote: '',
  requestOptionIds: [],
});
const HOLD = { id: 'hold-1' } as Hold;
const QUOTE_QUERY: QuoteQueryDto = Object.assign(new QuoteQueryDto(), {
  houseId: BODY.houseId,
  checkIn: BODY.checkIn,
  checkOut: BODY.checkOut,
  guestCount: BODY.guestCount,
});

describe('InventoryController guardrails', () => {
  const calls: string[] = [];
  const createHold = jest.fn<Promise<Hold>, [CreateHoldDto, boolean, HoldCaller]>();
  const assertHoldCapacity = jest.fn<Promise<void>, [string, string | null, HoldCaps]>();
  const getQuote = jest.fn<Promise<Quote>, [unknown, boolean]>();
  const searchStays = jest.fn<Promise<HouseSearchResult[]>, [unknown]>();
  const getHouseAvailability = jest.fn<Promise<HouseAvailability>, [string, string, unknown]>();
  const getPropertyAvailability = jest.fn<Promise<PropertyAvailability>, [string, unknown]>();
  const checkHold = jest.fn<Promise<void>, [string | undefined, string]>();
  const checkBrowse = jest.fn<Promise<void>, [string | undefined]>();
  const promoCheck = jest.fn<Promise<void>, [string | undefined, string | undefined]>();
  let controller: InventoryController;

  beforeEach(async () => {
    jest.resetAllMocks();
    calls.length = 0;
    checkHold.mockImplementation(async () => { calls.push('holdLimit'); });
    checkBrowse.mockImplementation(async () => { calls.push('browseLimit'); });
    promoCheck.mockImplementation(async () => { calls.push('promoLimit'); });
    assertHoldCapacity.mockImplementation(async () => { calls.push('capacity'); });
    createHold.mockImplementation(async () => { calls.push('createHold'); return HOLD; });
    getQuote.mockResolvedValue({} as Quote);
    searchStays.mockResolvedValue([]);
    getHouseAvailability.mockResolvedValue({} as HouseAvailability);
    getPropertyAvailability.mockResolvedValue({} as PropertyAvailability);
    const moduleRef = await Test.createTestingModule({
      controllers: [InventoryController],
      providers: [
        { provide: InventoryService, useValue: { createHold, assertHoldCapacity, getQuote, searchStays, getHold: jest.fn() } },
        { provide: AvailabilityService, useValue: { getHouseAvailability, getPropertyAvailability } },
        { provide: PromoRateLimiter, useValue: { check: promoCheck } },
        {
          provide: HoldRateLimiter,
          useValue: {
            checkHold,
            checkBrowse,
            holdCaps: (): HoldCaps => ({ perEmail: 3, perIp: 5 }),
            hashIp: (ip: string | undefined): string | null => (ip === undefined ? null : `hash:${ip}`),
          },
        },
      ],
    }).compile();
    controller = moduleRef.get(InventoryController);
  });

  describe('creating a hold', () => {
    it('checks the speed limit, the promo limit and the open-hold cap BEFORE creating anything, in that order', async () => {
      await expect(controller.createHold(BODY, REQUEST)).resolves.toEqual({ status: 'ok', data: HOLD });

      expect(calls).toEqual(['holdLimit', 'promoLimit', 'capacity', 'createHold']);
      expect(checkHold).toHaveBeenCalledWith('203.0.113.7', 'ada@example.com');
      expect(assertHoldCapacity).toHaveBeenCalledWith('ada@example.com', 'hash:203.0.113.7', { perEmail: 3, perIp: 5 });
    });

    it('stores only a hash of the caller on the hold', async () => {
      await controller.createHold(BODY, REQUEST);

      expect(createHold).toHaveBeenCalledWith(BODY, true, { ipHash: 'hash:203.0.113.7' });
    });

    it('creates nothing when the speed limit says 429', async () => {
      checkHold.mockRejectedValue(new HttpException({ code: 'HOLD_RATE_LIMITED' }, 429));

      await expect(controller.createHold(BODY, REQUEST)).rejects.toMatchObject({ status: 429 });

      expect(createHold).not.toHaveBeenCalled();
      expect(assertHoldCapacity).not.toHaveBeenCalled();
    });

    it('creates nothing when the caller already keeps too many unpaid holds', async () => {
      assertHoldCapacity.mockRejectedValue(new HttpException({ code: 'TOO_MANY_HOLDS' }, 429));

      await expect(controller.createHold(BODY, REQUEST)).rejects.toMatchObject({ status: 429 });

      expect(createHold).not.toHaveBeenCalled();
    });
  });

  describe('browsing', () => {
    it('limits quotes, search and both availability reads per caller, before doing any work', async () => {
      await controller.getQuote(QUOTE_QUERY, REQUEST);
      await controller.searchStays({ checkIn: '2027-07-10', checkOut: '2027-07-12', guestCount: 2 }, REQUEST);
      await controller.getHouseAvailability('alpine-lake', 'lake-chalet', {}, REQUEST);
      await controller.getPropertyAvailability('alpine-lake', {}, REQUEST);

      expect(checkBrowse).toHaveBeenCalledTimes(4);
      expect(checkBrowse).toHaveBeenCalledWith('203.0.113.7');
    });

    it('does no work for a caller that is scraping', async () => {
      checkBrowse.mockRejectedValue(new HttpException({ code: 'BROWSE_RATE_LIMITED' }, 429));

      await expect(controller.searchStays({ checkIn: '2027-07-10', checkOut: '2027-07-12', guestCount: 2 }, REQUEST)).rejects.toMatchObject({ status: 429 });
      await expect(controller.getHouseAvailability('a', 'b', {}, REQUEST)).rejects.toMatchObject({ status: 429 });

      expect(searchStays).not.toHaveBeenCalled();
      expect(getHouseAvailability).not.toHaveBeenCalled();
    });
  });
});
