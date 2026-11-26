/**
 * @file apps/api/src/shared/validation/currency-code-dto.spec.ts
 * @shared R2-21: a house or an extra can only be saved with a three-capital-letter currency, so the database CHECK
 * (migration 035) never turns a save into a 500
 */

import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { UpsertExtraDto } from '../../modules/extras/dto/upsert-extra.dto';
import { UpsertHouseDto } from '../../modules/property/dto/upsert-house.dto';
import { apiValidationPipeOptions } from './validation-exception.factory';

const pipe = new ValidationPipe(apiValidationPipeOptions());

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
const EXTRA = { name: 'Breakfast', description: 'Bread', kind: 'instant', priceCents: 1200, currencyCode: 'EUR', published: true };

async function accepts(type: new () => object, payload: object): Promise<boolean> {
  try {
    await pipe.transform(payload, { type: 'body', metatype: type });
    return true;
  } catch {
    return false;
  }
}

describe.each([
  ['UpsertHouseDto', UpsertHouseDto, HOUSE],
  ['UpsertExtraDto', UpsertExtraDto, EXTRA],
])('%s currencyCode', (_name, type, payload) => {
  it.each(['EUR', 'USD', 'CHF'])('accepts %s', async (code) => {
    expect(await accepts(type, { ...payload, currencyCode: code })).toBe(true);
  });

  it.each(['eur', 'Eur', 'EU', 'EURO', 'E1R', ' EUR', 'EUR ', '€€€', ''])('refuses %j', async (code) => {
    expect(await accepts(type, { ...payload, currencyCode: code })).toBe(false);
  });

  it.each([123, null, ['EUR'], { code: 'EUR' }])('refuses a non-string (%j)', async (code) => {
    expect(await accepts(type, { ...payload, currencyCode: code })).toBe(false);
  });
});
