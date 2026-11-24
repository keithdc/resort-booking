/**
 * @file apps/admin/src/features/reporting/utils/report-properties.ts
 * @feature reporting
 * @dependencies shared-types, report-range
 *
 * Rows for the "Properties & stays" table: bookings, nights, occupancy and share of revenue, plus
 * sorting. Display arithmetic over numbers the API already counted.
 */

import type { PropertyReportRow, StaffReport } from '@resort-booking/shared-types';
import { periodNights } from './report-range';

export type PropertySortKey = 'name' | 'bookings' | 'nights' | 'occupancy' | 'revenue';
export type SortDirection = 'asc' | 'desc';

export interface StayRow {
  id: string;
  name: string;
  bookings: number;
  nights: number;
  occupancyPercent: number;
  revenueCents: number;
  sharePercent: number;
}

export interface PropertyRow extends StayRow {
  currencyCode: string;
  stayCount: number;
  stays: StayRow[];
}

function percent(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10;
}

/**
 * One row per property with its stays inside, shares measured against the whole report's revenue.
 */
export function buildPropertyRows(report: Pick<StaffReport, 'from' | 'to' | 'properties'>): PropertyRow[] {
  const nightsInPeriod = periodNights(report.from, report.to);
  const totalRevenue = report.properties.reduce((sum: number, property: PropertyReportRow): number => sum + property.revenueCents, 0);
  return report.properties.map((property: PropertyReportRow): PropertyRow => ({
    id: property.propertyId,
    name: property.propertyName,
    bookings: property.reservationCount,
    nights: property.occupiedNights,
    occupancyPercent: percent(property.occupiedNights, property.houseCount * nightsInPeriod),
    revenueCents: property.revenueCents,
    sharePercent: percent(property.revenueCents, totalRevenue),
    currencyCode: property.currencyCode,
    stayCount: property.houseCount,
    stays: property.houses.map((house): StayRow => ({
      id: house.houseId,
      name: house.houseName,
      bookings: house.reservationCount,
      nights: house.occupiedNights,
      occupancyPercent: percent(house.occupiedNights, nightsInPeriod),
      revenueCents: house.revenueCents,
      sharePercent: percent(house.revenueCents, totalRevenue),
    })),
  }));
}

function valueOf(row: StayRow, key: PropertySortKey): number | string {
  switch (key) {
    case 'name':
      return row.name.toLowerCase();
    case 'bookings':
      return row.bookings;
    case 'nights':
      return row.nights;
    case 'occupancy':
      return row.occupancyPercent;
    case 'revenue':
      return row.revenueCents;
  }
}

/**
 * Sorts rows (and the stays inside each property) by a column. Equal values keep their name order.
 */
export function sortPropertyRows(rows: readonly PropertyRow[], key: PropertySortKey, direction: SortDirection): PropertyRow[] {
  const sign = direction === 'asc' ? 1 : -1;
  const compare = (a: StayRow, b: StayRow): number => {
    const left = valueOf(a, key);
    const right = valueOf(b, key);
    if (left < right) {
      return -1 * sign;
    }
    if (left > right) {
      return 1 * sign;
    }
    return a.name.localeCompare(b.name);
  };
  return [...rows].sort(compare).map((row: PropertyRow): PropertyRow => ({ ...row, stays: [...row.stays].sort(compare) }));
}
