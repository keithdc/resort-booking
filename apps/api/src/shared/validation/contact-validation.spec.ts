/**
 * @file apps/api/src/shared/validation/contact-validation.spec.ts
 * @shared Phone and email rules on the DTOs that take guest and staff contact details
 * @dependencies class-validator, class-transformer
 */

import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateHoldDto } from '../../modules/inventory/dto/create-hold.dto';
import { UpdateOrganizationDto } from '../../modules/identity/dto/update-organization.dto';
import { UpsertPropertyDto } from '../../modules/property/dto/upsert-property.dto';
import { BulkRatePeriodDto } from '../../modules/rates/dto/rate-period-write.dto';

async function failedFields(cls: new () => object, payload: object): Promise<string[]> {
  // Same conversion setting as the app's global ValidationPipe (main.ts), so these tests see what production sees.
  const errors = await validate(plainToInstance(cls, payload));
  return errors.map((error): string => error.property);
}

const HOLD = {
  houseId: '33333333-3333-3333-3333-333333333331',
  checkIn: '2027-07-10',
  checkOut: '2027-07-12',
  guestCount: 2,
  paymentMethod: 'card',
  bookerName: 'Ada Lovelace',
  bookerEmail: 'ada@example.com',
  bookerPhone: '+33612345678',
  guestNote: '',
  requestOptionIds: [],
  termsAccepted: true,
};

describe('guest checkout contact details (CreateHoldDto)', () => {
  it('accepts a valid email and international phone', async () => {
    expect(await failedFields(CreateHoldDto, HOLD)).toEqual([]);
  });

  it.each(['0612345678', '+33', '+33400000002', 'call me', '', '+3361234567890123456789012345678901234567890'])(
    'rejects the phone %j',
    async (bookerPhone) => {
      expect(await failedFields(CreateHoldDto, { ...HOLD, bookerPhone })).toContain('bookerPhone');
    },
  );

  it.each(['plain', 'a@b', 'a@@example.com', '', ' '])('rejects the email %j', async (bookerEmail) => {
    expect(await failedFields(CreateHoldDto, { ...HOLD, bookerEmail })).toContain('bookerEmail');
  });

  it('tells the guest what format to use', async () => {
    const errors = await validate(plainToInstance(CreateHoldDto, { ...HOLD, bookerPhone: '0612345678' }));
    const messages = errors.flatMap((error): string[] => Object.values(error.constraints ?? {}));
    expect(messages.join(' ')).toContain('+33612345678');
  });
});

describe('cancellation terms at checkout (CreateHoldDto)', () => {
  it('accepts a hold when the guest ticked the terms', async () => {
    expect(await failedFields(CreateHoldDto, { ...HOLD, termsAccepted: true })).toEqual([]);
  });

  it.each([false, undefined, null, 'true', 'false', 'yes', '', 1, 0, [], {}])('refuses a hold when termsAccepted is %j', async (termsAccepted) => {
    expect(await failedFields(CreateHoldDto, { ...HOLD, termsAccepted })).toContain('termsAccepted');
  });

  it('refuses a hold with the field missing altogether', async () => {
    const withoutTerms: Record<string, unknown> = { ...HOLD };
    delete withoutTerms.termsAccepted;

    expect(await failedFields(CreateHoldDto, withoutTerms)).toContain('termsAccepted');
  });

  it('tells the guest what to do', async () => {
    const errors = await validate(plainToInstance(CreateHoldDto, { ...HOLD, termsAccepted: false }));
    const messages = errors.flatMap((error): string[] => Object.values(error.constraints ?? {}));

    expect(messages.join(' ')).toContain('read the cancellation terms');
  });
});

describe('organization contact details (UpdateOrganizationDto)', () => {
  const ORG = {
    name: 'Humphreys Hospitality',
    legalName: 'Humphreys SAS',
    legalAddress: '1 Rue',
    vatNumber: '',
    iban: '',
    bic: '',
    bankAccountName: '',
    contactEmail: 'ops@example.com',
    contactPhone: '+33142685300',
    ownerName: 'Owner',
    bookingEmail: 'booking@example.com',
    guestReplyEmail: 'hello@example.com',
  };

  it('allows an empty optional ops phone', async () => {
    expect(await failedFields(UpdateOrganizationDto, { ...ORG, contactPhone: '' })).not.toContain('contactPhone');
  });

  it('accepts a real international ops phone', async () => {
    expect(await failedFields(UpdateOrganizationDto, ORG)).not.toContain('contactPhone');
  });

  it('rejects a made-up ops phone', async () => {
    expect(await failedFields(UpdateOrganizationDto, { ...ORG, contactPhone: '+33400000002' })).toContain('contactPhone');
  });

  it('rejects a malformed inbox', async () => {
    expect(await failedFields(UpdateOrganizationDto, { ...ORG, bookingEmail: 'nope' })).toContain('bookingEmail');
  });
});

describe('property contact details (UpsertPropertyDto)', () => {
  const PROPERTY = {
    name: 'Pine Coast',
    slug: 'pine-coast',
    description: 'A coastal property with several houses.',
    addressLine: '1 Rue',
    city: 'Biarritz',
    countryCode: 'FR',
    postalCode: '64200',
    latitude: 43.4,
    longitude: -1.5,
    phone: '+33559123456',
    email: 'stay@example.com',
    timezone: 'Europe/Paris',
    published: true,
    customRequestsEnabled: false,
    photos: [],
  };

  it('accepts a valid phone and email', async () => {
    const failed = await failedFields(UpsertPropertyDto, PROPERTY);
    expect(failed).not.toContain('phone');
    expect(failed).not.toContain('email');
  });

  it('rejects a national-format or invalid phone', async () => {
    expect(await failedFields(UpsertPropertyDto, { ...PROPERTY, phone: '05 59 12 34 56' })).toContain('phone');
    expect(await failedFields(UpsertPropertyDto, { ...PROPERTY, phone: '+33400000002' })).toContain('phone');
  });

  it('rejects a malformed email', async () => {
    expect(await failedFields(UpsertPropertyDto, { ...PROPERTY, email: 'stay@' })).toContain('email');
  });
});

describe('bulk rate confirmation (BulkRatePeriodDto)', () => {
  const BULK = {
    label: 'Peak',
    startDate: '2027-07-01',
    endDate: '2027-08-31',
    nightlyRateCents: 26000,
    houseIds: ['33333333-3333-3333-3333-333333333331'],
    confirmed: true,
  };

  it('accepts a real confirmation', async () => {
    expect(await failedFields(BulkRatePeriodDto, BULK)).toEqual([]);
  });

  it.each(['yes', 'true', 'false', 1, ''])('does not treat %j as a confirmation', async (confirmed) => {
    expect(await failedFields(BulkRatePeriodDto, { ...BULK, confirmed })).toContain('confirmed');
  });
});
