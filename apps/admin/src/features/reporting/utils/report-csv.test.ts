/**
 * @file apps/admin/src/features/reporting/utils/report-csv.test.ts
 * @feature reporting
 */

import { describe, expect, it } from 'vitest';
import { staffReport, staffReservation } from '@/test/fixtures';
import { buildReportCsv, csvCell, csvFileName, csvFromRows } from './report-csv';

describe('csvCell', () => {
  it('leaves plain text and numbers alone', () => {
    expect(csvCell('Ada Lovelace')).toBe('Ada Lovelace');
    expect(csvCell(320)).toBe('320');
    expect(csvCell(80.5)).toBe('80.5');
    expect(csvCell(-5)).toBe('-5');
  });

  it('quotes commas, quotes and line breaks and doubles inner quotes', () => {
    expect(csvCell('Smith, Jo')).toBe('"Smith, Jo"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell('cr\rhere')).toBe('"cr\rhere"');
  });

  it('stops text from running as a spreadsheet formula', () => {
    expect(csvCell('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)");
    expect(csvCell('+33 6 12')).toBe("'+33 6 12");
    expect(csvCell('-2+3')).toBe("'-2+3");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell('\t=1')).toBe("'\t=1");
  });

  it('guards a formula that also needs quoting', () => {
    expect(csvCell('=A1,B1')).toBe('"\'=A1,B1"');
  });

  it('writes a number that is not finite as empty', () => {
    expect(csvCell(Number.NaN)).toBe('');
  });
});

describe('csvFromRows', () => {
  it('joins with CRLF and keeps blank rows', () => {
    expect(csvFromRows([['a', 'b'], [], ['c']])).toBe('a,b\r\n\r\nc');
  });
});

describe('buildReportCsv', () => {
  const report = staffReport({
    currencyCode: 'EUR', netRevenueCents: 120000, grossRevenueCents: 130000, refundedCents: 10000, reservationCount: 3,
    occupiedNights: 10, occupancyPercent: 50, averageNightlyCents: 12000, cancellationRatePercent: 25,
    cancellationReasons: [{ reason: 'guest_request', cancelledCount: 1, paidCents: 30000, refundedCents: 10000 }],
    pipeline: [
      staffReservation({ reference: 'BK-ABC1234567', bookerName: 'Ada, Countess', totalCents: 96000 }),
      staffReservation({ id: 'r2', reference: 'BK-ZZZ9999999', bookerName: '=cmd|calc', status: 'cancelled', paymentMethod: null }),
    ],
  });
  const context = { propertyName: 'All properties', periodLabel: '1 Jul – 31 Jul 2027', generatedOn: '2027-08-01' };

  it('starts with a byte order mark and a title block', () => {
    const csv = buildReportCsv(report, context);
    expect(csv.startsWith('﻿Humphreys report\r\n')).toBe(true);
    expect(csv).toContain('Property,All properties');
    expect(csv).toContain('Period,1 Jul – 31 Jul 2027');
  });

  it('writes the summary in plain words with money in whole units', () => {
    const csv = buildReportCsv(report, context);
    expect(csv).toContain('Revenue (after refunds),1200');
    expect(csv).toContain('Paid by guests,1300');
    expect(csv).toContain('Refunded,100');
    expect(csv).toContain('Cancelled bookings,1');
    expect(csv).toContain('Cancellation rate (%),25');
  });

  it('writes one row per booking, quoted and guarded', () => {
    const lines = buildReportCsv(report, context).trimEnd().split('\r\n');
    const header = lines.findIndex((line) => line.startsWith('Reference,Guest'));
    expect(lines[header + 1]).toContain('BK-ABC1234567,"Ada, Countess",ada@example.com,Alpine Lake,Lake Chalet,2027-07-10,2027-07-12,2,2,960,Card / wallets,Confirmed');
    expect(lines[header + 2]).toContain("'=cmd|calc");
    expect(lines[header + 2]).toContain('Not recorded,Cancelled');
  });

  it('still produces a valid file without any booking', () => {
    const csv = buildReportCsv({ ...report, pipeline: [] }, context);
    expect(csv.trimEnd().endsWith('Payment method,Status')).toBe(true);
  });
});

describe('csvFileName', () => {
  it('names the file after the period', () => {
    expect(csvFileName('2027-07-01', '2027-07-31')).toBe('humphreys-report-2027-07-01-to-2027-07-31.csv');
  });
});
