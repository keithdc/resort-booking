/**
 * @file apps/api/src/modules/bookings/staff-notes-isolation.spec.ts
 * @feature bookings
 * Staff notes are internal. Only a small, named set of files may touch the table: the staff notes code, the booking list
 * count (staff only), the privacy tools and the migration/role set-up. No guest route, public read or report may read it.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..', '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name: string): string[] => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      return sourceFiles(full);
    }
    return /\.(ts|sql)$/.test(name) ? [full] : [];
  });
}

const ALLOWED = [
  'migrations/043_booking_staff_notes.sql',
  'modules/bookings/staff-notes.repository.ts',
  'modules/reservations/reservations.repository.ts',
  'shared/database/roles.ts',
  'shared/database/role-probes.ts',
  'shared/privacy/anonymise-sql.ts',
  'shared/privacy/export-guest.ts',
];

describe('staff notes stay inside the staff side', () => {
  const users = sourceFiles(SRC)
    .filter((file: string): boolean => !/\.spec\.ts$/.test(file))
    .filter((file: string): boolean => readFileSync(file, 'utf8').includes('booking_staff_notes'))
    .map((file: string): string => relative(SRC, file));

  it('is read by nothing outside the allowed files', () => {
    expect(users.filter((file: string): boolean => !ALLOWED.includes(file))).toEqual([]);
  });

  it('is never read by the guest booking code or the report queries', () => {
    for (const forbidden of ['modules/bookings/bookings.repository.ts', 'modules/bookings/booking-reader.ts', 'modules/reservations/report-summary.repository.ts', 'modules/inventory/inventory.repository.ts']) {
      expect(users).not.toContain(forbidden);
    }
  });

  it('is not part of any report_ view', () => {
    const views = sourceFiles(join(SRC, 'migrations'))
      .filter((file: string): boolean => file.endsWith('.sql'))
      .map((file: string): string => readFileSync(file, 'utf8'))
      .join('\n');
    const reportViews = views.match(/CREATE (?:OR REPLACE )?VIEW report_[\s\S]*?;/g) ?? [];
    expect(reportViews.length).toBeGreaterThan(0);
    expect(reportViews.filter((view: string): boolean => view.includes('booking_staff_notes'))).toEqual([]);
  });
});
