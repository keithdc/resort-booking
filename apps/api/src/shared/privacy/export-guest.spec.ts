/**
 * @file apps/api/src/shared/privacy/export-guest.spec.ts
 * Guest export: constant query count, never to the terminal, never overwriting, mode 0600.
 */

import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertSafeOutputPath, collectGuestExport, countExport, writeExportFile } from './export-guest';
import { fakePrivacyDb } from './privacy-fake-db';

describe('collectGuestExport', () => {
  it('runs a constant number of read-only queries however many bookings there are', async () => {
    const id = '1a2b3c4d-0000-4000-8000-000000000001';
    const db = fakePrivacyDb((statement) => (statement.text.includes('FROM inventory_blocks ib') ? [{ id }, { id: '2b3c4d5e-0000-4000-8000-000000000002' }] : [{ ok: true }]));

    const data = await collectGuestExport(db, ' Ada@Example.com ', new Date('2026-01-01T00:00:00Z'));

    expect(db.transactions).toHaveLength(1);
    expect(db.transactions[0]?.options.readOnly).toBe(true);
    expect(db.transactions[0]?.statements).toHaveLength(6);
    expect(data.subjectEmail).toBe('ada@example.com');
    expect(data.bookings[0]).toMatchObject({ reference: 'BK-1A2B3C4D00' });
    expect(countExport(data)).toMatchObject({ bookings: 2, payments: 1, refunds: 1 });
  });
});

describe('output file', () => {
  let dir = '';
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'privacy-export-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('refuses a missing path, "-" and a device', () => {
    expect(() => assertSafeOutputPath(undefined)).toThrow(/never printed/);
    expect(() => assertSafeOutputPath('-')).toThrow(/--out/);
    expect(() => assertSafeOutputPath('/dev/stdout')).toThrow(/regular file/);
  });

  it('creates the file with mode 0600 and the JSON inside', async () => {
    const path = join(dir, 'export.json');
    const data = await collectGuestExport(fakePrivacyDb(), 'a@b.co');

    await writeExportFile(path, data);

    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({ format: 'resort-booking-guest-export/1', subjectEmail: 'a@b.co' });
  });

  it('never overwrites an existing file', async () => {
    const path = join(dir, 'taken.json');
    await writeFile(path, 'keep me');
    const data = await collectGuestExport(fakePrivacyDb(), 'a@b.co');

    await expect(writeExportFile(path, data)).rejects.toThrow(/EEXIST/);
    expect(await readFile(path, 'utf8')).toBe('keep me');
  });
});
