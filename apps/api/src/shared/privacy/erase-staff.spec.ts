/**
 * @file apps/api/src/shared/privacy/erase-staff.spec.ts
 * Staff erasure with a fake database: refuses the last admin, one maintenance transaction, hash only.
 */

import { eraseStaff, erasedStaffEmail } from './erase-staff';
import { fakePrivacyDb } from './privacy-fake-db';

const ID = '99999999-9999-4999-8999-999999999999';
const target = (role: string, others: number): Record<string, unknown> => ({ id: ID, organization_id: 'org', role, active: true, other_active_admins: others });
const options = { email: 'Staff@Example.com', apply: true, operator: 'op', salt: 's' };

describe('eraseStaff', () => {
  it('reports an unknown email without writing', async () => {
    const db = fakePrivacyDb();

    expect((await eraseStaff(db, options)).found).toBe(false);
    expect(db.transactions).toHaveLength(1);
  });

  it('refuses the last active admin', async () => {
    const db = fakePrivacyDb(() => [target('admin', 0)]);

    const receipt = await eraseStaff(db, options);

    expect(receipt.refused).toBe('last_admin');
    expect(db.transactions).toHaveLength(1);
  });

  it('a dry run writes nothing', async () => {
    const db = fakePrivacyDb(() => [target('employee', 0)]);

    await eraseStaff(db, { ...options, apply: false });

    expect(db.transactions).toHaveLength(1);
  });

  it('anonymises the account in one maintenance transaction and keeps the row (audit linkage)', async () => {
    const db = fakePrivacyDb((statement) => (statement.text.includes('FROM staff_users u') ? [target('admin', 1)] : undefined));

    const receipt = await eraseStaff(db, options);

    const write = db.transactions[1];
    expect(write?.options.maintenance).toBe(true);
    const sql = write?.statements.map((statement) => statement.text).join('\n') ?? '';
    expect(sql).toContain('UPDATE staff_users SET active = false');
    expect(sql).not.toContain('DELETE FROM staff_users');
    expect(sql).toContain('DELETE FROM staff_sessions');
    expect(sql).toContain('DELETE FROM staff_two_factor');
    expect(write?.statements[0]?.params).toEqual([ID, 'Former staff member', erasedStaffEmail(ID)]);
    // The address is only a search key for the invite delete; nothing that is stored (update, ledger, audit) holds it.
    const stored = write?.statements.filter((statement) => /^\s*(UPDATE|INSERT)/.test(statement.text)) ?? [];
    expect(JSON.stringify(stored.map((statement) => statement.params))).not.toMatch(/staff@example/i);
    expect(receipt.refused).toBeNull();
  });
});
