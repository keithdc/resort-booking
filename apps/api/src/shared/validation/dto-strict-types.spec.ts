/**
 * @file apps/api/src/shared/validation/dto-strict-types.spec.ts
 * @shared R2-16: through the app's REAL ValidationPipe, a wrong type is refused, never turned into a valid value
 */

import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ArrayMinSize, IsArray, IsInt, IsOptional } from 'class-validator';
import { DiscountWriteDto } from '../../modules/discounts/dto/discount-write.dto';
import { UpsertExtraDto } from '../../modules/extras/dto/upsert-extra.dto';
import { StaffLoginDto } from '../../modules/identity/dto/staff-login.dto';
import { CreateHoldDto } from '../../modules/inventory/dto/create-hold.dto';
import { QuoteQueryDto } from '../../modules/inventory/dto/quote-query.dto';
import { SearchQueryDto } from '../../modules/inventory/dto/search-query.dto';
import { GeocodeReverseQueryDto } from '../../modules/property/dto/geocode-reverse.query.dto';
import { UpsertHouseDto } from '../../modules/property/dto/upsert-house.dto';
import { UpsertPropertyDto } from '../../modules/property/dto/upsert-property.dto';
import { UpsertRequestOptionDto } from '../../modules/property/dto/upsert-request-option.dto';
import { SaveBookingConfigDto } from '../../modules/reservations/dto/save-booking-config.dto';
import { AuditQueryDto } from '../../modules/team/dto/audit-query.dto';
import { RatePeriodWriteDto, BulkRatePeriodDto } from '../../modules/rates/dto/rate-period-write.dto';
import { StaffChangeDatesDto } from '../../modules/bookings/dto/staff-actions.dto';
import { QueryNumber } from './query-number';
import { apiValidationPipeOptions } from './validation-exception.factory';

const pipe = new ValidationPipe(apiValidationPipeOptions());

type Source = 'body' | 'query';

async function run<T extends object>(type: new () => T, payload: object, source: Source = 'body'): Promise<T | Error> {
  try {
    return (await pipe.transform(payload, { type: source, metatype: type })) as T;
  } catch (error: unknown) {
    return error as Error;
  }
}

const accepted = (result: unknown): boolean => !(result instanceof Error);

const HOUSE = {
  name: 'Lake Chalet',
  slug: 'lake-chalet',
  description: 'Four-bedroom chalet facing the water.',
  capacity: 8,
  nightlyRateCents: 32000,
  currencyCode: 'EUR',
  published: true,
  amenities: [{ name: 'Sauna', details: 'Wood fired' }],
  photos: [{ url: 'https://images.example.com/a.jpg', altText: 'Lake' }],
};
const PROPERTY = {
  name: 'Alpine Lake',
  slug: 'alpine-lake',
  description: 'Lakeside chalets in the mountains.',
  addressLine: '1 Rue du Lac',
  city: 'Annecy',
  countryCode: 'FR',
  postalCode: '74000',
  latitude: 45.9,
  longitude: 6.1,
  phone: '+33612345678',
  email: 'hello@example.com',
  timezone: 'Europe/Paris',
  published: false,
  customRequestsEnabled: false,
  photos: [],
};
const EXTRA = { name: 'Breakfast', description: 'Bread', kind: 'instant', priceCents: 1200, currencyCode: 'EUR', published: true };
const OPTION = { name: 'Late check-in', description: 'After 10pm', published: true };
const CONFIG = { rebookable: true, rebookFeeType: 'fixed', rebookFeeValue: 500, tiers: [{ minDaysBeforeCheckIn: 7, refundPercent: 100 }] };
const DISCOUNT = {
  label: 'Long stay',
  effect: { kind: 'percent', percent: 10 },
  conditions: [{ kind: 'min_nights', nights: 7 }],
  alwaysOn: false,
  houseIds: null,
  combinable: false,
  priority: 100,
  active: true,
  maxRedemptions: null,
};
const HOLD = {
  houseId: '33333333-3333-3333-3333-333333333331',
  checkIn: '2027-07-10',
  checkOut: '2027-07-12',
  guestCount: 2,
  paymentMethod: 'card',
  bookerName: 'Ada Lovelace',
  bookerEmail: 'ada@example.com',
  bookerPhone: '+33612345678',
  termsAccepted: true,
};
const WRONG_BOOLEANS = ['false', 'true', 'yes', 'on', '', 0, 1, [], {}, null];

describe('valid bodies still pass through the real pipe', () => {
  it.each([
    ['property', UpsertPropertyDto, PROPERTY],
    ['house', UpsertHouseDto, HOUSE],
    ['extra', UpsertExtraDto, EXTRA],
    ['request option', UpsertRequestOptionDto, OPTION],
    ['booking config', SaveBookingConfigDto, CONFIG],
    ['discount', DiscountWriteDto, DISCOUNT],
    ['hold', CreateHoldDto, HOLD],
  ] as const)('%s', async (_name, type, body) => {
    expect(accepted(await run(type as new () => object, body))).toBe(true);
  });

  it('keeps nested lists as typed instances (nested validation still runs)', async () => {
    const bad = { ...CONFIG, tiers: [{ minDaysBeforeCheckIn: 7, refundPercent: 150 }] };
    expect(accepted(await run(SaveBookingConfigDto, bad))).toBe(false);
    const badPhoto = { ...HOUSE, photos: [{ url: 'http://insecure.example.com/a.jpg', altText: 'x' }] };
    expect(accepted(await run(UpsertHouseDto, badPhoto))).toBe(false);
  });
});

describe('booleans are real booleans, never converted ("false" must not publish a draft)', () => {
  const CASES: Array<[string, new () => object, object, string]> = [
    ['UpsertPropertyDto.published', UpsertPropertyDto, PROPERTY, 'published'],
    ['UpsertPropertyDto.customRequestsEnabled', UpsertPropertyDto, PROPERTY, 'customRequestsEnabled'],
    ['UpsertHouseDto.published', UpsertHouseDto, HOUSE, 'published'],
    ['UpsertExtraDto.published', UpsertExtraDto, EXTRA, 'published'],
    ['UpsertRequestOptionDto.published', UpsertRequestOptionDto, OPTION, 'published'],
    ['SaveBookingConfigDto.rebookable', SaveBookingConfigDto, CONFIG, 'rebookable'],
    ['DiscountWriteDto.alwaysOn', DiscountWriteDto, DISCOUNT, 'alwaysOn'],
    ['DiscountWriteDto.combinable', DiscountWriteDto, DISCOUNT, 'combinable'],
    ['DiscountWriteDto.active', DiscountWriteDto, DISCOUNT, 'active'],
    ['StaffChangeDatesDto.waiveFee', StaffChangeDatesDto, { newCheckIn: '2027-08-01', newCheckOut: '2027-08-04', waiveFee: false, note: 'abc', balanceSettledOutside: false }, 'waiveFee'],
    ['BulkRatePeriodDto.confirmed', BulkRatePeriodDto, { label: 'x', startDate: '2027-01-01', endDate: '2027-02-01', nightlyRateCents: 100, houseIds: ['33333333-3333-3333-3333-333333333331'], confirmed: true }, 'confirmed'],
  ];

  it.each(CASES)('%s accepts true and false', async (_name, type, body, field) => {
    expect(accepted(await run(type, { ...body, [field]: true }))).toBe(true);
    expect(accepted(await run(type, { ...body, [field]: false }))).toBe(true);
  });

  it.each(CASES)('%s refuses every non-boolean value', async (_name, type, body, field) => {
    for (const value of WRONG_BOOLEANS) {
      expect(accepted(await run(type, { ...body, [field]: value }))).toBe(false);
    }
  });

  it('published "false" does not become true (the original bug)', async () => {
    expect(accepted(await run(UpsertPropertyDto, { ...PROPERTY, published: 'false' }))).toBe(false);
  });
});

describe('numbers in a JSON body must be numbers', () => {
  it.each([
    ['UpsertHouseDto.capacity', UpsertHouseDto, HOUSE, 'capacity'],
    ['UpsertHouseDto.nightlyRateCents', UpsertHouseDto, HOUSE, 'nightlyRateCents'],
    ['UpsertPropertyDto.latitude', UpsertPropertyDto, PROPERTY, 'latitude'],
    ['UpsertPropertyDto.longitude', UpsertPropertyDto, PROPERTY, 'longitude'],
    ['UpsertExtraDto.priceCents', UpsertExtraDto, EXTRA, 'priceCents'],
    ['SaveBookingConfigDto.rebookFeeValue', SaveBookingConfigDto, CONFIG, 'rebookFeeValue'],
    ['CreateHoldDto.guestCount', CreateHoldDto, HOLD, 'guestCount'],
  ] as const)('%s refuses text, null, arrays and objects that would have been converted', async (_name, type, body, field) => {
    for (const value of ['5', '', ' ', '1e1', [], [5], {}, null, true]) {
      expect(accepted(await run(type as new () => object, { ...body, [field]: value }))).toBe(false);
    }
  });

  it('the optional discount priority refuses text and objects (null and absent mean "use the default")', async () => {
    for (const value of ['5', '', [], [5], {}, true]) {
      expect(accepted(await run(DiscountWriteDto, { ...DISCOUNT, priority: value }))).toBe(false);
    }
    expect(accepted(await run(DiscountWriteDto, { ...DISCOUNT, priority: undefined }))).toBe(true);
  });

  it('rate periods keep refusing text for the price', async () => {
    const period = { label: 'x', startDate: '2027-01-01', endDate: '2027-02-01', nightlyRateCents: 100 };
    expect(accepted(await run(RatePeriodWriteDto, period))).toBe(true);
    expect(accepted(await run(RatePeriodWriteDto, { ...period, nightlyRateCents: '100' }))).toBe(false);
  });
});

describe('text fields refuse objects and arrays instead of "[object Object]" (the {} password)', () => {
  it('a login password or email of the wrong type is refused', async () => {
    expect(accepted(await run(StaffLoginDto, { email: 'a@example.com', password: 'Correct-Horse-9' }))).toBe(true);
    for (const value of [{}, [], ['a', 'b'], 5, true, null]) {
      expect(accepted(await run(StaffLoginDto, { email: 'a@example.com', password: value }))).toBe(false);
      expect(accepted(await run(StaffLoginDto, { email: value, password: 'Correct-Horse-9' }))).toBe(false);
    }
  });

  it.each([
    ['UpsertPropertyDto.name', UpsertPropertyDto, PROPERTY, 'name'],
    ['UpsertPropertyDto.slug', UpsertPropertyDto, PROPERTY, 'slug'],
    ['UpsertHouseDto.name', UpsertHouseDto, HOUSE, 'name'],
    ['UpsertExtraDto.description', UpsertExtraDto, EXTRA, 'description'],
    ['CreateHoldDto.bookerName', CreateHoldDto, HOLD, 'bookerName'],
    ['CreateHoldDto.checkIn', CreateHoldDto, HOLD, 'checkIn'],
    ['DiscountWriteDto.label', DiscountWriteDto, DISCOUNT, 'label'],
  ] as const)('%s', async (_name, type, body, field) => {
    for (const value of [{}, [], ['a', 'b'], ['2027-07-10'], 5, true]) {
      expect(accepted(await run(type as new () => object, { ...body, [field]: value }))).toBe(false);
    }
  });
});

describe('query strings: numbers are converted explicitly, and only when they are plain numbers', () => {
  const quote = { houseId: '33333333-3333-3333-3333-333333333331', checkIn: '2027-07-10', checkOut: '2027-07-12' };

  it('accepts "2" for guestCount and hands the service a real number', async () => {
    const result = await run(QuoteQueryDto, { ...quote, guestCount: '2' }, 'query');
    expect(result).toMatchObject({ guestCount: 2 });
    expect(await run(SearchQueryDto, { checkIn: '2027-07-10', checkOut: '2027-07-12', guestCount: '3' }, 'query')).toMatchObject({ guestCount: 3 });
  });

  it.each(['', ' ', 'abc', '1e1', '0x10', '2 ', '1.5', '-1', '0', '51', ['2', '3'], [], {}])(
    'refuses guestCount %j',
    async (guestCount) => {
      expect(accepted(await run(QuoteQueryDto, { ...quote, guestCount }, 'query'))).toBe(false);
      expect(accepted(await run(SearchQueryDto, { checkIn: '2027-07-10', checkOut: '2027-07-12', guestCount }, 'query'))).toBe(false);
    },
  );

  it('reverse geocoding takes decimal coordinates and refuses empty or non-numeric ones (an empty lat is not 0)', async () => {
    expect(await run(GeocodeReverseQueryDto, { lat: '45.9', lon: '-6.1' }, 'query')).toMatchObject({ lat: 45.9, lon: -6.1 });
    for (const value of ['', ' ', 'abc', '1e1', ['1', '2'], '91']) {
      expect(accepted(await run(GeocodeReverseQueryDto, { lat: value, lon: '6' }, 'query'))).toBe(false);
    }
    expect(accepted(await run(GeocodeReverseQueryDto, { lon: '6' }, 'query'))).toBe(false);
  });

  it('the audit page size is converted explicitly now that nothing converts implicitly', async () => {
    expect(await run(AuditQueryDto, { limit: '20' }, 'query')).toMatchObject({ limit: 20 });
    expect(accepted(await run(AuditQueryDto, {}, 'query'))).toBe(true);
    for (const limit of ['0', '101', 'abc', '', '1.5', ['1']]) {
      expect(accepted(await run(AuditQueryDto, { limit }, 'query'))).toBe(false);
    }
  });
});

describe('the pipe itself', () => {
  it('has implicit conversion switched off and still builds class instances', () => {
    const options = apiValidationPipeOptions();
    expect(options.transformOptions?.enableImplicitConversion).toBe(false);
    expect(options.transform).toBe(true);
    expect(options.whitelist).toBe(true);
    expect(options.forbidNonWhitelisted).toBe(true);
  });

  it('transforms a body into an instance of its class and keeps defaults', async () => {
    const result = await run(UpsertHouseDto, HOUSE);
    expect(result).toBeInstanceOf(UpsertHouseDto);
  });

  it('refuses unknown fields (mass assignment) as before', async () => {
    expect(accepted(await run(UpsertExtraDto, { ...EXTRA, organizationId: 'x' }))).toBe(false);
  });
});

describe('QueryNumber', () => {
  class Sample {
    @IsOptional()
    @QueryNumber()
    @IsInt()
    public n?: number;

    @IsArray()
    @ArrayMinSize(1)
    public list: string[] = ['x'];
  }

  it('converts only plain decimals', async () => {
    expect(await run(Sample, { n: '12' }, 'query')).toMatchObject({ n: 12 });
    expect(accepted(await run(Sample, { n: '12px' }, 'query'))).toBe(false);
    expect(accepted(await run(Sample, { n: '' }, 'query'))).toBe(false);
  });
});
