/**
 * @file apps/api/src/shared/validation/dto-bounds.spec.ts
 * @shared Every free-text, list and money field has an upper bound (S-18)
 */

import 'reflect-metadata';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';
import { DiscountWriteDto } from '../../modules/discounts/dto/discount-write.dto';
import { UpsertExtraDto } from '../../modules/extras/dto/upsert-extra.dto';
import { ChangeStaffPasswordDto } from '../../modules/identity/dto/change-staff-password.dto';
import { StaffLoginDto } from '../../modules/identity/dto/staff-login.dto';
import { UpdateOrganizationDto } from '../../modules/identity/dto/update-organization.dto';
import { UpdateStaffProfileDto } from '../../modules/identity/dto/update-staff-profile.dto';
import { CreateHoldDto } from '../../modules/inventory/dto/create-hold.dto';
import { SearchQueryDto } from '../../modules/inventory/dto/search-query.dto';
import { GeocodeQueryDto } from '../../modules/property/dto/geocode.query.dto';
import { UpsertHouseDto } from '../../modules/property/dto/upsert-house.dto';
import { UpsertPropertyDto } from '../../modules/property/dto/upsert-property.dto';
import { SaveBookingConfigDto } from '../../modules/reservations/dto/save-booking-config.dto';
import { StaffCancelDto } from '../../modules/bookings/dto/staff-actions.dto';
import { LIMITS } from './limits';

// The app's global ValidationPipe does not convert types (R2-16); plainToInstance without options mirrors it.
async function failing<T extends object>(type: ClassConstructor<T>, body: Record<string, unknown>): Promise<string[]> {
  const errors = await validate(plainToInstance(type, body), { whitelist: true, forbidNonWhitelisted: true });
  return errors.map((error) => error.property);
}

const long = (n: number): string => 'x'.repeat(n);

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
  published: true,
  customRequestsEnabled: false,
  photos: [],
};

const ORGANIZATION = {
  name: 'Humphreys',
  legalName: 'Humphreys SARL',
  legalAddress: '1 Rue du Lac, Annecy',
  vatNumber: 'FR123456789',
  iban: 'FR76 3000 6000 0112 3456 7890 189',
  bic: 'AGRIFRPP',
  bankAccountName: 'Humphreys SARL',
  contactEmail: 'hello@example.com',
  contactPhone: '+33612345678',
  ownerName: 'Owner',
  bookingEmail: 'booking@example.com',
  guestReplyEmail: 'reply@example.com',
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

describe('valid requests still pass', () => {
  it.each([
    ['house', UpsertHouseDto, HOUSE],
    ['property', UpsertPropertyDto, PROPERTY],
    ['organization', UpdateOrganizationDto, ORGANIZATION],
    ['hold', CreateHoldDto, HOLD],
  ] as const)('%s', async (_name, type, body) => {
    expect(await failing(type as ClassConstructor<object>, body)).toEqual([]);
  });
});

describe('house', () => {
  it('limits slug, description, capacity, money, currency and the lists', async () => {
    expect(await failing(UpsertHouseDto, { ...HOUSE, slug: long(LIMITS.slug + 1) })).toContain('slug');
    expect(await failing(UpsertHouseDto, { ...HOUSE, description: long(LIMITS.description + 1) })).toContain('description');
    expect(await failing(UpsertHouseDto, { ...HOUSE, capacity: LIMITS.capacity + 1 })).toContain('capacity');
    expect(await failing(UpsertHouseDto, { ...HOUSE, nightlyRateCents: LIMITS.maxCents + 1 })).toContain('nightlyRateCents');
    expect(await failing(UpsertHouseDto, { ...HOUSE, currencyCode: 'EURO' })).toContain('currencyCode');
    expect(await failing(UpsertHouseDto, { ...HOUSE, photos: Array.from({ length: LIMITS.photos + 1 }, () => HOUSE.photos[0]) })).toContain('photos');
    expect(await failing(UpsertHouseDto, { ...HOUSE, amenities: Array.from({ length: LIMITS.amenities + 1 }, () => HOUSE.amenities[0]) })).toContain('amenities');
  });

  it.each(['javascript:alert(1)', 'data:text/html;base64,PHNjcmlwdD4=', 'file:///etc/passwd', 'http://images.example.com/a.jpg', 'ftp://x.example.com/a.jpg', '//images.example.com/a.jpg'])(
    'refuses the photo address %s (https only)',
    async (url) => {
      expect(await failing(UpsertHouseDto, { ...HOUSE, photos: [{ url, altText: 'x' }] })).toContain('photos');
    },
  );
});

describe('property', () => {
  it('limits text, coordinates and photos', async () => {
    expect(await failing(UpsertPropertyDto, { ...PROPERTY, description: long(LIMITS.description + 1) })).toContain('description');
    expect(await failing(UpsertPropertyDto, { ...PROPERTY, addressLine: long(LIMITS.address + 1) })).toContain('addressLine');
    expect(await failing(UpsertPropertyDto, { ...PROPERTY, city: long(LIMITS.shortText + 1) })).toContain('city');
    expect(await failing(UpsertPropertyDto, { ...PROPERTY, postalCode: long(LIMITS.postalCode + 1) })).toContain('postalCode');
    expect(await failing(UpsertPropertyDto, { ...PROPERTY, latitude: 91 })).toContain('latitude');
    expect(await failing(UpsertPropertyDto, { ...PROPERTY, longitude: -181 })).toContain('longitude');
    expect(await failing(UpsertPropertyDto, { ...PROPERTY, photos: Array.from({ length: LIMITS.photos + 1 }, () => ({ url: 'https://a.example.com/x.jpg', altText: '' })) })).toContain('photos');
  });
});

describe('organization (bank and legal details)', () => {
  it('limits every text field', async () => {
    expect(await failing(UpdateOrganizationDto, { ...ORGANIZATION, legalName: long(LIMITS.shortText + 1) })).toContain('legalName');
    expect(await failing(UpdateOrganizationDto, { ...ORGANIZATION, legalAddress: long(LIMITS.address + 1) })).toContain('legalAddress');
    expect(await failing(UpdateOrganizationDto, { ...ORGANIZATION, vatNumber: long(LIMITS.vat + 1) })).toContain('vatNumber');
    expect(await failing(UpdateOrganizationDto, { ...ORGANIZATION, ownerName: long(LIMITS.name + 1) })).toContain('ownerName');
    expect(await failing(UpdateOrganizationDto, { ...ORGANIZATION, bankAccountName: long(LIMITS.name + 1) })).toContain('bankAccountName');
  });

  it('accepts an IBAN with spaces, an empty one while unfilled, and refuses junk', async () => {
    expect(await failing(UpdateOrganizationDto, { ...ORGANIZATION, iban: '' })).toEqual([]);
    expect(await failing(UpdateOrganizationDto, { ...ORGANIZATION, iban: 'FR76-3000<script>' })).toContain('iban');
    expect(await failing(UpdateOrganizationDto, { ...ORGANIZATION, iban: long(60) })).toContain('iban');
    expect(await failing(UpdateOrganizationDto, { ...ORGANIZATION, bic: 'AGRI FRPP' })).toContain('bic');
    expect(await failing(UpdateOrganizationDto, { ...ORGANIZATION, bic: long(12) })).toContain('bic');
  });
});

describe('hold (the public endpoint)', () => {
  it('limits name, email, note and the request option list', async () => {
    expect(await failing(CreateHoldDto, { ...HOLD, bookerName: long(LIMITS.name + 1) })).toContain('bookerName');
    expect(await failing(CreateHoldDto, { ...HOLD, bookerName: '' })).toContain('bookerName');
    expect(await failing(CreateHoldDto, { ...HOLD, bookerEmail: `${long(250)}@example.com` })).toContain('bookerEmail');
    expect(await failing(CreateHoldDto, { ...HOLD, guestNote: long(LIMITS.note + 1) })).toContain('guestNote');
    expect(
      await failing(CreateHoldDto, { ...HOLD, requestOptionIds: Array.from({ length: LIMITS.requestOptions + 1 }, () => '33333333-3333-3333-3333-333333333331') }),
    ).toContain('requestOptionIds');
  });

  it('still refuses "yes" as the terms acceptance (real boolean only)', async () => {
    expect(await failing(CreateHoldDto, { ...HOLD, termsAccepted: 'yes' })).toContain('termsAccepted');
  });
});

describe('staff sign-in and account', () => {
  it('caps the password so hashing stays cheap', async () => {
    expect(await failing(StaffLoginDto, { email: 'a@b.co', password: long(LIMITS.password + 1) })).toContain('password');
    expect(await failing(StaffLoginDto, { email: 'a@b.co', password: long(LIMITS.password) })).toEqual([]);
    expect(await failing(ChangeStaffPasswordDto, { currentPassword: 'x', newPassword: long(LIMITS.password + 1) + '1a' })).toContain('newPassword');
    expect(await failing(ChangeStaffPasswordDto, { currentPassword: long(LIMITS.password + 1), newPassword: 'Long-enough-1' })).toContain('currentPassword');
  });

  it('caps the email and the name', async () => {
    expect(await failing(StaffLoginDto, { email: `${long(250)}@example.com`, password: 'x' })).toContain('email');
    expect(await failing(UpdateStaffProfileDto, { fullName: long(LIMITS.name + 1), email: 'a@b.co' })).toContain('fullName');
  });
});

describe('other writes and queries', () => {
  it('caps extras, discounts, cancellation tiers, refunds and search text', async () => {
    const extra = { name: 'Breakfast', description: 'x', kind: 'instant', priceCents: 1500, currencyCode: 'EUR', published: true };
    expect(await failing(UpsertExtraDto, { ...extra, priceCents: LIMITS.maxCents + 1 })).toContain('priceCents');
    expect(await failing(UpsertExtraDto, { ...extra, description: long(LIMITS.note + 1) })).toContain('description');

    const discount = { label: 'Long stay', effect: { kind: 'percent', percent: 10 }, conditions: [], alwaysOn: true, houseIds: null, combinable: false, active: true, maxRedemptions: null };
    expect(await failing(DiscountWriteDto, discount)).toEqual([]);
    expect(await failing(DiscountWriteDto, { ...discount, conditions: Array.from({ length: LIMITS.conditions + 1 }, () => ({})) })).toContain('conditions');
    expect(await failing(DiscountWriteDto, { ...discount, houseIds: Array.from({ length: LIMITS.houseIds + 1 }, () => '33333333-3333-3333-3333-333333333331') })).toContain('houseIds');
    expect(await failing(DiscountWriteDto, { ...discount, maxRedemptions: LIMITS.maxRedemptions + 1 })).toContain('maxRedemptions');

    const tier = { minDaysBeforeCheckIn: 7, refundPercent: 100 };
    const config = { rebookable: false, rebookFeeType: 'none', rebookFeeValue: 0, tiers: [tier] };
    expect(await failing(SaveBookingConfigDto, config)).toEqual([]);
    expect(await failing(SaveBookingConfigDto, { ...config, tiers: Array.from({ length: LIMITS.tiers + 1 }, () => tier) })).toContain('tiers');
    expect(await failing(SaveBookingConfigDto, { ...config, rebookFeeValue: LIMITS.maxCents + 1 })).toContain('rebookFeeValue');

    expect(await failing(StaffCancelDto, { reason: 'goodwill', note: 'Goodwill refund', refundCents: LIMITS.maxCents + 1 })).toContain('refundCents');
    expect(await failing(GeocodeQueryDto, { q: long(LIMITS.searchText + 1) })).toContain('q');
    expect(await failing(SearchQueryDto, { checkIn: '2027-07-10', checkOut: '2027-07-12', guestCount: 2, propertySlug: long(LIMITS.slug + 1) })).toContain('propertySlug');
  });
});
