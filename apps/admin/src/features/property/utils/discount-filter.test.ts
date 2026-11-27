/**
 * @file apps/admin/src/features/property/utils/discount-filter.test.ts
 * @feature property
 */

import type { Discount } from '@resort-booking/shared-types';
import { describe, expect, it } from 'vitest';
import {
  couponCodeOf,
  filterDiscounts,
  guestLimitLabel,
  hasActiveFilters,
  NO_DISCOUNT_FILTERS,
  sortDiscounts,
} from './discount-filter';

const TODAY = '2026-11-25';

function discount(id: string, overrides: Partial<Discount> = {}): Discount {
  return {
    id,
    propertyId: 'p1',
    label: `Discount ${id}`,
    effect: { kind: 'percent', percent: 10 },
    conditions: [{ kind: 'min_nights', nights: 7 }],
    alwaysOn: false,
    houseIds: null,
    combinable: false,
    priority: 100,
    active: true,
    maxRedemptions: null,
    promoted: false,
    oncePerGuest: false,
    redemptions: 0,
    ...overrides,
  };
}

const coupon = (id: string, code: string, overrides: Partial<Discount> = {}): Discount =>
  discount(id, { conditions: [{ kind: 'promo_code', code }], ...overrides });

const LIVE_AUTO = discount('live-auto', { label: 'Long stay' });
const LIVE_CODE = coupon('live-code', 'WELCOME15', { label: 'Welcome code', oncePerGuest: true });
const LATER = discount('later', { label: 'Summer sale', conditions: [{ kind: 'booking_window', startDate: '2027-06-01', endDate: '2027-06-30' }] });
const USED_UP = coupon('used', 'GONE50', { label: 'Used coupon', maxRedemptions: 1, redemptions: 1 });
const ENDED = discount('ended', { label: 'Spring sale', conditions: [{ kind: 'booking_window', startDate: '2026-03-01', endDate: '2026-03-31' }] });
const OFF = coupon('off', 'PAUSED10', { label: 'Paused coupon', active: false });
const ALL = [OFF, ENDED, USED_UP, LATER, LIVE_AUTO, LIVE_CODE];

const ids = (list: readonly Discount[]): string[] => list.map((entry) => entry.id);

describe('sortDiscounts', () => {
  it('puts live first, then those that start later, then the rest, keeping the given order inside each group', () => {
    expect(ids(sortDiscounts(ALL, TODAY))).toEqual(['live-auto', 'live-code', 'later', 'off', 'ended', 'used']);
  });

  it('does not change the list it is given', () => {
    const copy = [...ALL];
    sortDiscounts(ALL, TODAY);
    expect(ALL).toEqual(copy);
  });
});

describe('filterDiscounts', () => {
  it('shows everything, sorted, with no filter', () => {
    expect(ids(filterDiscounts(ALL, NO_DISCOUNT_FILTERS, TODAY))).toHaveLength(ALL.length);
  });

  it('searches the name, any case, and part of a word', () => {
    expect(ids(filterDiscounts(ALL, { ...NO_DISCOUNT_FILTERS, search: 'SALE' }, TODAY))).toEqual(['later', 'ended']);
    expect(ids(filterDiscounts(ALL, { ...NO_DISCOUNT_FILTERS, search: '  long ' }, TODAY))).toEqual(['live-auto']);
  });

  it('searches the promo code too, any case, and never matches an automatic discount by a code', () => {
    expect(ids(filterDiscounts(ALL, { ...NO_DISCOUNT_FILTERS, search: 'welcome15' }, TODAY))).toEqual(['live-code']);
    expect(ids(filterDiscounts(ALL, { ...NO_DISCOUNT_FILTERS, search: 'gone' }, TODAY))).toEqual(['used']);
    expect(ids(filterDiscounts([LIVE_AUTO], { ...NO_DISCOUNT_FILTERS, search: 'undefined' }, TODAY))).toEqual([]);
  });

  it('filters by type', () => {
    expect(ids(filterDiscounts(ALL, { ...NO_DISCOUNT_FILTERS, type: 'coupon' }, TODAY))).toEqual(['live-code', 'off', 'used']);
    expect(ids(filterDiscounts(ALL, { ...NO_DISCOUNT_FILTERS, type: 'automatic' }, TODAY))).toEqual(['live-auto', 'later', 'ended']);
  });

  it.each([
    ['live', ['live-auto', 'live-code']],
    ['starts', ['later']],
    ['used_up', ['used']],
    ['ended', ['ended']],
    ['off', ['off']],
  ] as const)('filters by status %s', (status, expected) => {
    expect(ids(filterDiscounts(ALL, { ...NO_DISCOUNT_FILTERS, status }, TODAY))).toEqual(expected);
  });

  it('combines the three', () => {
    expect(ids(filterDiscounts(ALL, { search: 'code', type: 'coupon', status: 'live' }, TODAY))).toEqual(['live-code']);
    expect(ids(filterDiscounts(ALL, { search: 'code', type: 'automatic', status: 'live' }, TODAY))).toEqual([]);
  });
});

describe('small helpers', () => {
  it('reads the code of a coupon and nothing for an automatic discount', () => {
    expect(couponCodeOf(LIVE_CODE)).toBe('WELCOME15');
    expect(couponCodeOf(LIVE_AUTO)).toBeNull();
  });

  it('says "Once per guest" only for a coupon that has the limit', () => {
    expect(guestLimitLabel(LIVE_CODE)).toBe('Once per guest');
    expect(guestLimitLabel(coupon('c', 'ABC'))).toBeNull();
    expect(guestLimitLabel({ ...LIVE_AUTO, oncePerGuest: true })).toBeNull();
  });

  it('knows when a filter is set', () => {
    expect(hasActiveFilters(NO_DISCOUNT_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...NO_DISCOUNT_FILTERS, search: '  ' })).toBe(false);
    expect(hasActiveFilters({ ...NO_DISCOUNT_FILTERS, search: 'a' })).toBe(true);
    expect(hasActiveFilters({ ...NO_DISCOUNT_FILTERS, type: 'coupon' })).toBe(true);
    expect(hasActiveFilters({ ...NO_DISCOUNT_FILTERS, status: 'off' })).toBe(true);
  });
});
