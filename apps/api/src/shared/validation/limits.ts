/**
 * @file apps/api/src/shared/validation/limits.ts
 * @shared Size limits shared by every request DTO, so no free-text or list field is unbounded
 * @dependencies none
 */

export const LIMITS = {
  /** A person's or a thing's name. */
  name: 120,
  /** A label, city, short line. */
  shortText: 200,
  address: 300,
  postalCode: 20,
  slug: 80,
  timezone: 64,
  phone: 40,
  email: 254,
  /** Password input: long enough for any passphrase, short enough that hashing it stays cheap. */
  password: 200,
  description: 4000,
  note: 2000,
  url: 2000,
  vat: 40,
  iban: 34,
  bic: 11,
  currencyCode: 3,
  searchText: 200,
  photos: 40,
  amenities: 60,
  tiers: 20,
  conditions: 10,
  houseIds: 200,
  requestOptions: 20,
  /** 1,000,000.00 in the smallest unit: more than any nightly rate, extra or fee here. */
  maxCents: 100_000_000,
  capacity: 50,
  maxRedemptions: 1_000_000,
  maxDaysBefore: 3650,
} as const;
