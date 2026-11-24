/**
 * @file apps/admin/src/features/reporting/utils/report-properties.test.ts
 * @feature reporting
 */

import type { PropertyReportRow } from '@resort-booking/shared-types';
import { describe, expect, it } from 'vitest';
import { buildPropertyRows, sortPropertyRows } from './report-properties';

const PROPERTIES: PropertyReportRow[] = [
  {
    propertyId: 'p1', propertyName: 'Alpine Lake', reservationCount: 3, occupiedNights: 12, revenueCents: 60000, currencyCode: 'EUR', houseCount: 2,
    houses: [
      { houseId: 'h1', houseName: 'Lake Chalet', reservationCount: 3, occupiedNights: 12, revenueCents: 60000 },
      { houseId: 'h2', houseName: 'Old Barn', reservationCount: 0, occupiedNights: 0, revenueCents: 0 },
    ],
  },
  {
    propertyId: 'p2', propertyName: 'Atlantic Dune', reservationCount: 1, occupiedNights: 3, revenueCents: 40000, currencyCode: 'EUR', houseCount: 1,
    houses: [{ houseId: 'h3', houseName: 'Dune House', reservationCount: 1, occupiedNights: 3, revenueCents: 40000 }],
  },
];
const PERIOD = { from: '2027-07-01', to: '2027-07-31', properties: PROPERTIES }; // 30 nights

describe('buildPropertyRows', () => {
  it('measures occupancy against every stay of the property and every night of the period', () => {
    const rows = buildPropertyRows(PERIOD);
    expect(rows[0]?.occupancyPercent).toBe(20); // 12 of 2 stays x 30 nights
    expect(rows[1]?.occupancyPercent).toBe(10); // 3 of 1 stay x 30 nights
    expect(rows[0]?.stays[0]?.occupancyPercent).toBe(40); // 12 of 30
    expect(rows[0]?.stays[1]?.occupancyPercent).toBe(0);
  });

  it('shares revenue against the whole report', () => {
    const rows = buildPropertyRows(PERIOD);
    expect(rows.map((row) => row.sharePercent)).toEqual([60, 40]);
    expect(rows[0]?.stays.map((stay) => stay.sharePercent)).toEqual([60, 0]);
  });

  it('keeps unbooked stays and carries the stay count and currency', () => {
    const [first] = buildPropertyRows(PERIOD);
    expect(first?.stayCount).toBe(2);
    expect(first?.stays).toHaveLength(2);
    expect(first?.currencyCode).toBe('EUR');
  });

  it('is all zero and safe without revenue or nights', () => {
    const rows = buildPropertyRows({ from: '2027-07-01', to: '2027-07-01', properties: [{ ...PROPERTIES[1]!, occupiedNights: 0, revenueCents: 0, houses: [] }] });
    expect(rows[0]).toMatchObject({ occupancyPercent: 0, sharePercent: 0 });
  });

  it('is empty without properties', () => {
    expect(buildPropertyRows({ from: '2027-07-01', to: '2027-07-31', properties: [] })).toEqual([]);
  });
});

describe('sortPropertyRows', () => {
  const rows = buildPropertyRows(PERIOD);

  it('sorts by revenue, biggest first', () => {
    expect(sortPropertyRows(rows, 'revenue', 'desc').map((row) => row.name)).toEqual(['Alpine Lake', 'Atlantic Dune']);
    expect(sortPropertyRows(rows, 'revenue', 'asc').map((row) => row.name)).toEqual(['Atlantic Dune', 'Alpine Lake']);
  });

  it('sorts by name regardless of case', () => {
    expect(sortPropertyRows(rows, 'name', 'desc').map((row) => row.name)).toEqual(['Atlantic Dune', 'Alpine Lake']);
  });

  it('sorts the stays inside a property too', () => {
    const alpine = sortPropertyRows(rows, 'bookings', 'asc').find((row) => row.name === 'Alpine Lake');
    expect(alpine?.stays.map((stay) => stay.name)).toEqual(['Old Barn', 'Lake Chalet']);
  });

  it('keeps name order for equal values and does not change the input', () => {
    const tied = sortPropertyRows(rows, 'bookings', 'desc');
    expect(tied[0]?.name).toBe('Alpine Lake');
    expect(rows[0]?.name).toBe('Alpine Lake');
    expect(sortPropertyRows(rows, 'occupancy', 'desc')[0]?.name).toBe('Alpine Lake');
    expect(sortPropertyRows(rows, 'nights', 'asc')[0]?.name).toBe('Atlantic Dune');
  });
});
