/**
 * @file apps/admin/src/features/reporting/utils/report-csv.ts
 * @feature reporting
 * @dependencies shared-types, report-labels
 *
 * Builds the CSV of the report: a summary block, then one row per booking. RFC 4180 quoting, and a
 * guard so a guest name like "=HYPERLINK(...)" cannot run as a spreadsheet formula.
 */

import type { StaffReport, StaffReservation } from '@resort-booking/shared-types';
import { bookingNights, bookingStatusLabel, bookingPaymentLabel } from './report-labels';

export type CsvCell = string | number;

const FORMULA_STARTERS = ['=', '+', '-', '@', '\t', '\r'];
const BYTE_ORDER_MARK = '﻿';

/**
 * One cell, ready for a row. Numbers are written as they are; text that a spreadsheet could read as
 * a formula gets a leading apostrophe; anything with a comma, quote or line break is quoted.
 */
export function csvCell(value: CsvCell): string {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : '';
  }
  const text = FORMULA_STARTERS.some((starter: string): boolean => value.startsWith(starter)) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Rows joined with CRLF (RFC 4180), a blank row being an empty array.
 */
export function csvFromRows(rows: readonly (readonly CsvCell[])[]): string {
  return rows.map((row: readonly CsvCell[]): string => row.map(csvCell).join(',')).join('\r\n');
}

function money(cents: number): number {
  return cents / 100;
}

export interface CsvContext {
  propertyName: string;
  periodLabel: string;
  generatedOn: string;
  /** The API withheld the money figures: leave every money row and column out instead of writing zeros. */
  moneyHidden?: boolean;
}

/**
 * The whole file: title block, summary numbers, then the bookings of the report. Starts with a byte
 * order mark so Excel reads accents correctly.
 */
export function buildReportCsv(report: StaffReport, context: CsvContext): string {
  const withMoney = context.moneyHidden !== true;
  const rows: CsvCell[][] = [
    ['Humphreys report'],
    ['Property', context.propertyName],
    ['Period', context.periodLabel],
    ['Generated', context.generatedOn],
    ['Currency', report.currencyCode],
    [],
    ['Summary', 'Value'],
    ...(withMoney ? [['Revenue (after refunds)', money(report.netRevenueCents)], ['Paid by guests', money(report.grossRevenueCents)], ['Refunded', money(report.refundedCents)]] : []),
    ['Bookings (confirmed)', report.reservationCount],
    ['Nights booked', report.occupiedNights],
    ['Occupancy (%)', report.occupancyPercent],
    ...(withMoney ? [['Average nightly rate', money(report.averageNightlyCents)]] : []),
    ['Cancelled bookings', report.cancellationReasons.reduce((sum: number, row): number => sum + row.cancelledCount, 0)],
    ['Cancellation rate (%)', report.cancellationRatePercent],
    [],
    ['Reference', 'Guest', 'Email', 'Property', 'Stay', 'Check-in', 'Check-out', 'Nights', 'Guests', ...(withMoney ? ['Amount'] : []), 'Payment method', 'Status'],
    ...report.pipeline.map((booking: StaffReservation): CsvCell[] => [
      booking.reference,
      booking.bookerName,
      booking.bookerEmail,
      booking.propertyName,
      booking.houseName,
      booking.checkIn,
      booking.checkOut,
      bookingNights(booking),
      booking.guestCount,
      ...(withMoney ? [money(booking.totalCents)] : []),
      bookingPaymentLabel(booking),
      bookingStatusLabel(booking),
    ]),
  ];
  return `${BYTE_ORDER_MARK}${csvFromRows(rows)}\r\n`;
}

/**
 * A safe file name such as "humphreys-report-2027-07-01-to-2027-07-31.csv".
 */
export function csvFileName(from: string, lastDay: string): string {
  return `humphreys-report-${from}-to-${lastDay}.csv`;
}
