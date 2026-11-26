/**
 * @file apps/api/src/shared/privacy/erase-staff.ts
 * @shared Erasing a staff member: deactivate the account, anonymise name and email, remove sessions, two-factor and invites
 * @dependencies privacy-db, privacy-hash, anonymise-sql
 *
 * The row stays (the audit log and bookings refer to it by id), so "who did what" survives without saying who. The last
 * active admin of an organization cannot be erased: the workspace would be locked. One transaction.
 */

import { FORMER_STAFF_NAME, REMOVED_TEXT } from './anonymise-sql';
import type { PrivacyDb, PrivacyTx } from './privacy-db';
import { normaliseEmail, subjectHash } from './privacy-hash';

export interface StaffTarget {
  id: string;
  organizationId: string;
  role: string;
  active: boolean;
  /** Admins in the same organization other than this person who are still active. */
  otherActiveAdmins: number;
}

export interface StaffErasureReceipt {
  mode: 'dry-run' | 'apply';
  found: boolean;
  refused: 'last_admin' | 'already_erased' | null;
  subjectHashPrefix: string;
  sessionsRemoved: number;
  invitesRemoved: number;
  auditRowsScrubbed: number;
  operator: string;
}

interface TargetRow {
  id: string;
  organization_id: string;
  role: string;
  active: boolean;
  other_active_admins: number;
}

/** The email an erased account carries: unique, never deliverable (RFC 2606 `.invalid`). */
export function erasedStaffEmail(id: string): string {
  return `erased-${id}@erased.invalid`;
}

/** The account for this email (ignoring case), or null. */
export async function findStaff(db: PrivacyDb, email: string): Promise<StaffTarget | null> {
  return db.transaction(
    async (tx: PrivacyTx): Promise<StaffTarget | null> => {
      const result = await tx.query<TargetRow>(
        `SELECT u.id, u.organization_id, u.role, u.active,
                (SELECT count(*) FROM staff_users o WHERE o.organization_id = u.organization_id AND o.role = 'admin' AND o.active AND o.id <> u.id)::int AS other_active_admins
         FROM staff_users u WHERE lower(btrim(u.email)) = $1`,
        [normaliseEmail(email)],
      );
      const row = result.rows[0];
      return row === undefined ? null : { id: row.id, organizationId: row.organization_id, role: row.role, active: row.active, otherActiveAdmins: row.other_active_admins };
    },
    { readOnly: true },
  );
}

/** Plans and, with `apply`, performs the erasure of one staff account. */
export async function eraseStaff(db: PrivacyDb, options: { email: string; apply: boolean; operator: string; salt: string }): Promise<StaffErasureReceipt> {
  const hash = subjectHash(options.email, options.salt);
  const receipt: StaffErasureReceipt = {
    mode: options.apply ? 'apply' : 'dry-run',
    found: false,
    refused: null,
    subjectHashPrefix: hash.slice(0, 12),
    sessionsRemoved: 0,
    invitesRemoved: 0,
    auditRowsScrubbed: 0,
    operator: options.operator,
  };
  const target = await findStaff(db, options.email);
  if (target === null) {
    return receipt;
  }
  receipt.found = true;
  if (target.role === 'admin' && target.active && target.otherActiveAdmins === 0) {
    receipt.refused = 'last_admin';
    return receipt;
  }
  if (!options.apply) {
    return receipt;
  }
  await db.transaction(
    async (tx: PrivacyTx): Promise<void> => {
      const email = normaliseEmail(options.email);
      await tx.query(
        `UPDATE staff_users SET active = false, full_name = $2, email = $3, password_hash = 'erased' WHERE id = $1`,
        [target.id, FORMER_STAFF_NAME, erasedStaffEmail(target.id)],
      );
      receipt.sessionsRemoved = (await tx.query(`DELETE FROM staff_sessions WHERE staff_user_id = $1`, [target.id])).rowCount;
      await tx.query(`DELETE FROM staff_two_factor_challenges WHERE staff_user_id = $1`, [target.id]);
      await tx.query(`DELETE FROM staff_two_factor WHERE staff_user_id = $1`, [target.id]);
      receipt.invitesRemoved = (await tx.query(`DELETE FROM staff_invites WHERE staff_user_id = $1 OR lower(btrim(email)) = $2`, [target.id, email])).rowCount;
      receipt.auditRowsScrubbed = (
        await tx.query(
          `UPDATE audit_log SET ip_hash = NULL,
             metadata = CASE WHEN metadata->>'actorName' IS NOT NULL THEN jsonb_set(metadata, '{actorName}', to_jsonb($2::text)) ELSE metadata END
           WHERE staff_user_id = $1 AND (ip_hash IS NOT NULL OR metadata->>'actorName' IS NOT NULL)`,
          [target.id, REMOVED_TEXT],
        )
      ).rowCount;
      await tx.query(`INSERT INTO privacy_erasure_ledger (subject_kind, subject_hash, bookings_anonymised, forced, operator) VALUES ('staff', $1, 0, false, $2)`, [
        hash,
        options.operator.slice(0, 80),
      ]);
      await tx.query(
        `INSERT INTO audit_log (organization_id, staff_user_id, action, target_type, target_id, metadata) VALUES ($1, NULL, 'privacy.staff_erased', 'staff_user', $2, $3::jsonb)`,
        [target.organizationId, target.id, JSON.stringify({ subjectHash: hash, operator: options.operator.slice(0, 80) })],
      );
    },
    { maintenance: true },
  );
  return receipt;
}
