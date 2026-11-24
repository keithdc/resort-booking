/**
 * @file apps/admin/src/features/reporting/utils/bookings-filter.test.ts
 * @feature reporting
 */

import { describe, expect, it } from 'vitest';
import { staffReservation } from '@/test/fixtures';
import { countByStatus, filterBookings } from './bookings-filter';

const ROWS = [
  staffReservation({ id: '1', bookerName: 'Ada Lovelace', reference: 'BK-AAAA000001' }),
  staffReservation({ id: '2', bookerName: 'Grace Hopper', bookerEmail: 'grace@example.com', status: 'cancelled', reference: 'BK-BBBB000002' }),
  staffReservation({ id: '3', bookerName: 'Alan Turing', bookerEmail: 'alan@example.com', kind: 'hold', status: 'active', houseName: 'Old Barn', reference: 'BK-CCCC000003' }),
  staffReservation({ id: '4', bookerName: 'Linus', bookerEmail: 'linus@example.com', kind: 'hold', status: 'expired', reference: 'BK-DDDD000004' }),
];

const ids = (rows: { id: string }[]): string[] => rows.map((row) => row.id);

describe('filterBookings', () => {
  it('returns everything for no status and no search', () => {
    expect(ids(filterBookings(ROWS, null, ''))).toEqual(['1', '2', '3', '4']);
  });

  it('filters by status', () => {
    expect(ids(filterBookings(ROWS, 'confirmed', ''))).toEqual(['1']);
    expect(ids(filterBookings(ROWS, 'awaiting_payment', ''))).toEqual(['3']);
    expect(ids(filterBookings(ROWS, 'cancelled', ''))).toEqual(['2']);
    expect(ids(filterBookings(ROWS, 'expired', ''))).toEqual(['4']);
  });

  it('searches guest, email, reference, stay and property, ignoring case and spaces around', () => {
    expect(ids(filterBookings(ROWS, null, '  ada '))).toEqual(['1']);
    expect(ids(filterBookings(ROWS, null, 'GRACE@'))).toEqual(['2']);
    expect(ids(filterBookings(ROWS, null, 'bk-cccc'))).toEqual(['3']);
    expect(ids(filterBookings(ROWS, null, 'old barn'))).toEqual(['3']);
    expect(ids(filterBookings(ROWS, null, 'alpine'))).toEqual(['1', '2', '3', '4']);
  });

  it('combines the status and the search', () => {
    expect(ids(filterBookings(ROWS, 'cancelled', 'ada'))).toEqual([]);
    expect(ids(filterBookings(ROWS, 'cancelled', 'grace'))).toEqual(['2']);
  });

  it('is empty when nothing matches', () => {
    expect(filterBookings(ROWS, null, 'zzz')).toEqual([]);
  });
});

describe('countByStatus', () => {
  it('counts each status', () => {
    expect(countByStatus(ROWS)).toEqual({ confirmed: 1, awaiting_payment: 1, cancelled: 1, expired: 1 });
    expect(countByStatus([])).toEqual({ confirmed: 0, awaiting_payment: 0, cancelled: 0, expired: 0 });
  });
});
