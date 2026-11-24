/**
 * @file apps/admin/src/features/refunds/utils/refund-filters.test.ts
 * @feature refunds
 */

import { describe, expect, it } from 'vitest';
import { staffRefund } from '@/test/fixtures';
import { apiStatusFor, matchesFilter, REFUND_FILTERS, searchRefunds } from './refund-filters';

describe('REFUND_FILTERS', () => {
  it('starts with "Needs attention", the default view', () => {
    expect(REFUND_FILTERS[0]).toEqual({ filter: 'attention', label: 'Needs attention' });
    expect(REFUND_FILTERS.map((option) => option.label)).toEqual(['Needs attention', 'Pending', 'Failed', 'Done', 'All']);
  });
});

describe('apiStatusFor', () => {
  it('maps each chip to the status the API understands', () => {
    expect(apiStatusFor('attention')).toBe('needs_attention');
    expect(apiStatusFor('pending')).toBe('pending');
    expect(apiStatusFor('failed')).toBe('failed');
    expect(apiStatusFor('done')).toBe('succeeded');
    expect(apiStatusFor('all')).toBe('all');
  });
});

describe('matchesFilter', () => {
  it('puts pending and failed refunds under "needs attention", never done ones', () => {
    expect(matchesFilter({ status: 'pending' }, 'attention')).toBe(true);
    expect(matchesFilter({ status: 'failed' }, 'attention')).toBe(true);
    expect(matchesFilter({ status: 'succeeded' }, 'attention')).toBe(false);
  });

  it('matches each single status and everything for "all"', () => {
    expect(matchesFilter({ status: 'pending' }, 'pending')).toBe(true);
    expect(matchesFilter({ status: 'failed' }, 'pending')).toBe(false);
    expect(matchesFilter({ status: 'failed' }, 'failed')).toBe(true);
    expect(matchesFilter({ status: 'succeeded' }, 'done')).toBe(true);
    expect(matchesFilter({ status: 'pending' }, 'done')).toBe(false);
    expect(matchesFilter({ status: 'succeeded' }, 'all')).toBe(true);
  });
});

describe('searchRefunds', () => {
  const refunds = [
    staffRefund({ id: 'a', reference: 'BK-AAA0000000', bookerName: 'Ada Lovelace', bookerEmail: 'ada@example.com', stayName: 'Lake Chalet', propertyName: 'Alpine Lake' }),
    staffRefund({ id: 'b', reference: 'BK-BBB0000000', bookerName: 'Grace Hopper', bookerEmail: 'grace@example.com', stayName: 'Dune House', propertyName: 'Pine Coast' }),
  ];

  it('shows everything for a blank search, as a copy', () => {
    const result = searchRefunds(refunds, '   ');

    expect(result).toHaveLength(2);
    expect(result).not.toBe(refunds);
  });

  it.each([
    ['a reference', 'bk-bbb', 'b'],
    ['a guest name', 'LOVELACE', 'a'],
    ['an email', 'grace@', 'b'],
    ['a stay', 'dune', 'b'],
    ['a property', 'alpine', 'a'],
  ])('finds by %s, ignoring case', (_what, query, id) => {
    expect(searchRefunds(refunds, query).map((refund) => refund.id)).toEqual([id]);
  });

  it('ignores spaces around the search and finds nothing for an unknown word', () => {
    expect(searchRefunds(refunds, '  ada  ')).toHaveLength(1);
    expect(searchRefunds(refunds, 'zzz')).toEqual([]);
  });
});
