/**
 * @file apps/api/src/shared/privacy/erase-guest.spec.ts
 * Guest erasure with a fake database: planning rules, one transaction, hashes only in the audit entry.
 */

import { eraseGuest, planGuestErasure, reapplyErasures, skipReasonsFor, type GuestBooking } from './erase-guest';
import { fakePrivacyDb } from './privacy-fake-db';
import { subjectHash } from './privacy-hash';

const EMAIL = 'Ada.Guest@Example.com';
const SALT = 'unit-test-salt';

function booking(overrides: Partial<GuestBooking> = {}): GuestBooking {
  return {
    id: '1a2b3c4d-0000-4000-8000-000000000001',
    reference: 'BK-1A2B3C4D00',
    organizationId: '11111111-1111-1111-1111-111111111111',
    kind: 'reservation',
    status: 'confirmed',
    checkIn: '2020-01-01',
    checkOut: '2020-01-03',
    anonymisedAt: null,
    upcoming: false,
    openRefund: false,
    openPayment: false,
    liveHold: false,
    ...overrides,
  };
}

function rowOf(item: GuestBooking): Record<string, unknown> {
  return {
    id: item.id,
    organization_id: item.organizationId,
    kind: item.kind,
    status: item.status,
    check_in: item.checkIn,
    check_out: item.checkOut,
    anonymised_at: item.anonymisedAt,
    upcoming: item.upcoming,
    open_refund: item.openRefund,
    open_payment: item.openPayment,
    live_hold: item.liveHold,
  };
}

describe('planning', () => {
  it('skips a future stay, an open refund, an open payment and a live checkout', () => {
    expect(skipReasonsFor(booking({ upcoming: true, openRefund: true, openPayment: true, liveHold: true }))).toEqual(['future_stay', 'open_refund', 'open_payment', 'live_hold']);
    expect(skipReasonsFor(booking())).toEqual([]);
  });

  it('--force-future erases them anyway; an already anonymised booking is only counted', () => {
    const items = [booking({ upcoming: true }), booking({ id: 'b', anonymisedAt: '2024-01-01' })];

    expect(planGuestErasure(items, false)).toMatchObject({ toErase: 0, skipped: 1, alreadyDone: 1 });
    expect(planGuestErasure(items, true)).toMatchObject({ toErase: 1, skipped: 0, alreadyDone: 1 });
  });
});

describe('eraseGuest', () => {
  it('a dry run changes nothing and writes nothing', async () => {
    const db = fakePrivacyDb((statement) => (statement.text.includes('FROM inventory_blocks ib') ? [rowOf(booking())] : undefined));

    const receipt = await eraseGuest(db, { email: EMAIL, apply: false, forceFuture: false, operator: 'op', salt: SALT });

    expect(receipt).toMatchObject({ mode: 'dry-run', found: 1 });
    expect(receipt.erased).toHaveLength(1);
    expect(db.transactions).toHaveLength(1);
    expect(db.transactions[0]?.options.readOnly).toBe(true);
  });

  it('looks up the normalised email and applies in ONE maintenance transaction with ledger and audit', async () => {
    const db = fakePrivacyDb((statement) => {
      if (statement.text.includes('WHERE lower(btrim(ib.booker_email)) = $1')) {
        return [rowOf(booking()), rowOf(booking({ id: '2b3c4d5e-0000-4000-8000-000000000002', upcoming: true }))];
      }
      return statement.text.includes('WITH picked') ? [{ n: 1, refund_notes: 2, change_notes: 0, staff_notes: 3 }] : undefined;
    });

    const receipt = await eraseGuest(db, { email: EMAIL, apply: true, forceFuture: false, operator: 'op', salt: SALT });

    expect(db.transactions[0]?.statements[0]?.params).toEqual(['ada.guest@example.com']);
    expect(receipt.erased).toHaveLength(1);
    expect(receipt.skipped).toHaveLength(1);
    expect(receipt.refundNotesScrubbed).toBe(2);
    expect(receipt.staffNotesScrubbed).toBe(3);
    const write = db.transactions[1];
    expect(write?.options.maintenance).toBe(true);
    expect(write?.statements.map((statement) => statement.text.trim().split(/\s+/)[0])).toEqual(['WITH', 'INSERT', 'INSERT']);
    expect(write?.committed).toBe(true);
  });

  it('puts only the hash of the email in the ledger and the audit entry', async () => {
    const db = fakePrivacyDb((statement) => (statement.text.includes('FROM inventory_blocks ib') && !statement.text.includes('WITH') ? [rowOf(booking())] : [{ n: 1, refund_notes: 0, change_notes: 0 }]));

    await eraseGuest(db, { email: EMAIL, apply: true, forceFuture: false, operator: 'op', salt: SALT });

    const written = JSON.stringify(db.transactions[1]?.statements.slice(1).map((statement) => statement.params));
    expect(written).not.toMatch(/ada/i);
    expect(written).not.toContain('example.com');
    expect(written).toContain(subjectHash(EMAIL, SALT));
  });

  it('writes nothing when everything is skipped, and nothing when the person is not found', async () => {
    const skipped = fakePrivacyDb((statement) => (statement.text.includes('FROM inventory_blocks ib') ? [rowOf(booking({ openRefund: true }))] : undefined));
    const empty = fakePrivacyDb();

    await eraseGuest(skipped, { email: EMAIL, apply: true, forceFuture: false, operator: 'op', salt: SALT });
    const receipt = await eraseGuest(empty, { email: EMAIL, apply: true, forceFuture: false, operator: 'op', salt: SALT });

    expect(skipped.transactions).toHaveLength(1);
    expect(empty.transactions).toHaveLength(1);
    expect(receipt.found).toBe(0);
  });

  it('writes one audit entry per organization', async () => {
    const other = '22222222-2222-2222-2222-222222222222';
    const db = fakePrivacyDb((statement) => {
      if (statement.text.includes('WHERE lower(btrim(ib.booker_email)) = $1')) {
        return [rowOf(booking()), rowOf(booking({ id: '3c4d5e6f-0000-4000-8000-000000000003', organizationId: other }))];
      }
      return statement.text.includes('WITH picked') ? [{ n: 2, refund_notes: 0, change_notes: 0 }] : undefined;
    });

    await eraseGuest(db, { email: EMAIL, apply: true, forceFuture: false, operator: 'op', salt: SALT });

    const audits = db.transactions[1]?.statements.filter((statement) => statement.text.includes('privacy.guest_erased')) ?? [];
    expect(audits.map((statement) => statement.params[0])).toEqual(['11111111-1111-1111-1111-111111111111', other]);
  });
});

describe('reapplyErasures', () => {
  it('anonymises only the emails whose hash is in the ledger', async () => {
    const known = subjectHash('gone@example.com', SALT);
    const db = fakePrivacyDb((statement) => {
      if (statement.text.includes('privacy_erasure_ledger')) {
        return [{ subject_hash: known }];
      }
      if (statement.text.includes('DISTINCT lower')) {
        return [{ email: 'gone@example.com' }, { email: 'stay@example.com' }];
      }
      return [{ n: 3 }];
    });

    const dry = await reapplyErasures(db, { apply: false, salt: SALT });
    const done = await reapplyErasures(db, { apply: true, salt: SALT });

    expect(dry).toMatchObject({ mode: 'dry-run', ledgerEntries: 1, emailsMatched: 1, bookingsAnonymised: 0 });
    expect(done.bookingsAnonymised).toBe(3);
    const write = db.transactions[db.transactions.length - 1];
    expect(write?.options.maintenance).toBe(true);
    expect(write?.statements[0]?.params[2]).toEqual(['gone@example.com']);
  });
});
