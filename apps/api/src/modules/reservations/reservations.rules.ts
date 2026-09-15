/**
 * @file apps/api/src/modules/reservations/reservations.rules.ts
 * @feature reservations
 * @dependencies inventory.rules
 */

import type {
  CalendarDayOccupancy,
  CancellationTierWrite,
  HoldStatus,
  InventoryKind,
  StaffReservation,
} from '@resort-booking/shared-types';
import { nightsBetween } from '../inventory/inventory.rules';

export const DEFAULT_CANCELLATION_TIERS: CancellationTierWrite[] = [
  { minDaysBeforeCheckIn: 7, refundPercent: 100 },
  { minDaysBeforeCheckIn: 3, refundPercent: 75 },
  { minDaysBeforeCheckIn: 1, refundPercent: 25 },
  { minDaysBeforeCheckIn: 0, refundPercent: 0 },
];

/**
 * Rejects empty, duplicate, or out-of-range ladders. Percents are never hardcoded in callers.
 */
export function validateCancellationTiers(tiers: CancellationTierWrite[]): string | null {
  if (tiers.length === 0) {
    return 'At least one cancellation tier is required';
  }
  const days = new Set<number>();
  let hasCatchAll = false;
  for (const tier of tiers) {
    if (!Number.isInteger(tier.minDaysBeforeCheckIn) || tier.minDaysBeforeCheckIn < 0) {
      return 'Days before check-in must be a whole number of 0 or more';
    }
    if (!Number.isInteger(tier.refundPercent) || tier.refundPercent < 0 || tier.refundPercent > 100) {
      return 'Refund percent must be an integer from 0 to 100';
    }
    if (days.has(tier.minDaysBeforeCheckIn)) {
      return 'Each days-before-check-in value must be unique on a property';
    }
    days.add(tier.minDaysBeforeCheckIn);
    if (tier.minDaysBeforeCheckIn === 0) {
      hasCatchAll = true;
    }
  }
  if (!hasCatchAll) {
    return 'Keep a 0-day catch-all tier';
  }
  return null;
}

/**
 * Farther-out tiers that refund less than closer ones — usually a staff mistake.
 */
export function hasInvertedRefundLadder(tiers: CancellationTierWrite[]): boolean {
  const sorted = [...tiers].sort(
    (left: CancellationTierWrite, right: CancellationTierWrite): number =>
      right.minDaysBeforeCheckIn - left.minDaysBeforeCheckIn,
  );
  for (let i = 1; i < sorted.length; i += 1) {
    const earlier = sorted[i - 1];
    const later = sorted[i];
    if (earlier === undefined || later === undefined) {
      continue;
    }
    if (earlier.refundPercent < later.refundPercent) {
      return true;
    }
  }
  return false;
}

/**
 * True when the stay occupies this calendar date (checkout exclusive).
 */
export function stayOccupiesDate(checkIn: string, checkOut: string, day: string): boolean {
  return day >= checkIn && day < checkOut;
}

/**
 * Each YYYY-MM-DD from fromInclusive up to, not including, toExclusive.
 */
export function eachIsoDate(fromInclusive: string, toExclusive: string): string[] {
  const nights = nightsBetween(fromInclusive, toExclusive);
  if (nights === null) {
    return [];
  }
  const dates: string[] = [];
  const start = Date.parse(`${fromInclusive}T00:00:00Z`);
  for (let i = 0; i < nights; i += 1) {
    dates.push(isoFromUtcMs(start + i * 86_400_000));
  }
  return dates;
}

/**
 * Nights of a stay that fall inside [from, to).
 */
export function overlapNights(
  checkIn: string,
  checkOut: string,
  from: string,
  toExclusive: string,
): number {
  const start = checkIn > from ? checkIn : from;
  const end = checkOut < toExclusive ? checkOut : toExclusive;
  const n = nightsBetween(start, end);
  return n === null ? 0 : n;
}

export type PipelineBucket = 'confirmed' | 'pending_payment' | 'cancelled' | 'expired' | 'other';

export type CalendarLane = 'booking' | 'rebook' | 'cancelled' | 'pending';

const DEFAULT_AS_OF_TIME_ZONE = 'Europe/Paris';

/**
 * Civil date in a property timezone (not UTC).
 */
export function isoTodayInTimeZone(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timeZone === '' ? DEFAULT_AS_OF_TIME_ZONE : timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const year = parts.find((part): boolean => part.type === 'year')?.value;
  const month = parts.find((part): boolean => part.type === 'month')?.value;
  const day = parts.find((part): boolean => part.type === 'day')?.value;
  if (year === undefined || month === undefined || day === undefined) {
    return reportAsOfDateFallback(now);
  }
  return `${year}-${month}-${day}`;
}

export function reportAsOfDate(now: Date = new Date()): string {
  return isoTodayInTimeZone(DEFAULT_AS_OF_TIME_ZONE, now);
}

function reportAsOfDateFallback(now: Date): string {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Future confirmed stay that has not arrived and has not already ended.
 */
export function isUpcomingArrival(stay: StaffReservation, asOfDate: string): boolean {
  if (stay.kind !== 'reservation' || stay.status !== 'confirmed') {
    return false;
  }
  if (stay.arrivalStatus === 'checked_in' || stay.arrivalStatus === 'checked_out') {
    return false;
  }
  if (stay.checkOut <= asOfDate) {
    return false;
  }
  return stay.checkIn > asOfDate;
}

/**
 * Guest is on site: staff checked them in, or the dates say they occupy tonight.
 */
export function isInHouseNow(stay: StaffReservation, asOfDate: string): boolean {
  if (stay.kind !== 'reservation' || stay.status !== 'confirmed') {
    return false;
  }
  if (stay.arrivalStatus === 'checked_out') {
    return false;
  }
  if (stay.arrivalStatus === 'checked_in') {
    return true;
  }
  return stayOccupiesDate(stay.checkIn, stay.checkOut, asOfDate);
}

const LANE_ORDER: Record<CalendarLane, number> = {
  booking: 0,
  rebook: 1,
  pending: 2,
  cancelled: 3,
};

/**
 * How a stay should appear on a staff calendar day (not inventory occupancy).
 */
export function classifyCalendarLane(stay: StaffReservation): CalendarLane | null {
  if (stay.status === 'expired') {
    return null;
  }
  if (stay.rebookOfId !== null && stay.status !== 'cancelled' && stay.status !== 'released') {
    return 'rebook';
  }
  if (stay.kind === 'reservation' && stay.status === 'confirmed') {
    return 'booking';
  }
  if (stay.status === 'cancelled' || stay.status === 'released') {
    return 'cancelled';
  }
  if (stay.status === 'active') {
    return 'pending';
  }
  return null;
}

/**
 * Booked / rebook / cancelled / pending counts for one night.
 */
export function calendarDayCounts(stays: StaffReservation[], date: string): CalendarDayOccupancy {
  let bookingCount = 0;
  let rebookCount = 0;
  let cancelledCount = 0;
  let pendingCount = 0;
  for (const stay of stays) {
    if (!stayOccupiesDate(stay.checkIn, stay.checkOut, date)) {
      continue;
    }
    const lane = classifyCalendarLane(stay);
    if (lane === 'booking') {
      bookingCount += 1;
    } else if (lane === 'rebook') {
      rebookCount += 1;
    } else if (lane === 'cancelled') {
      cancelledCount += 1;
    } else if (lane === 'pending') {
      pendingCount += 1;
    }
  }
  return { date, bookingCount, rebookCount, cancelledCount, pendingCount };
}

/**
 * Confirmed bookings first, then rebooks, holds, cancelled.
 */
export function sortCalendarDayStays(stays: StaffReservation[]): StaffReservation[] {
  return [...stays]
    .filter((stay: StaffReservation): boolean => classifyCalendarLane(stay) !== null)
    .sort((left: StaffReservation, right: StaffReservation): number => {
      const leftLane = classifyCalendarLane(left);
      const rightLane = classifyCalendarLane(right);
      if (leftLane === null || rightLane === null) {
        return 0;
      }
      const byLane = LANE_ORDER[leftLane] - LANE_ORDER[rightLane];
      if (byLane !== 0) {
        return byLane;
      }
      return left.houseName.localeCompare(right.houseName);
    });
}

/**
 * How a hold or stay should appear on the staff report.
 */
export function classifyPipelineRow(kind: InventoryKind, status: HoldStatus): PipelineBucket {
  if (kind === 'reservation' && status === 'confirmed') {
    return 'confirmed';
  }
  if (status === 'cancelled' || status === 'released') {
    return 'cancelled';
  }
  if (status === 'active') {
    return 'pending_payment';
  }
  if (status === 'expired') {
    return 'expired';
  }
  return 'other';
}

/**
 * Destinations that have at least one confirmed stay in the set.
 */
export function uniquePropertyCount(stays: StaffReservation[]): number {
  return new Set(stays.map((stay: StaffReservation): string => stay.propertyId)).size;
}

function isoFromUtcMs(ms: number): string {
  const date = new Date(ms);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
