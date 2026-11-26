/**
 * @file apps/api/src/modules/identity/identity.repository.ts
 * @feature identity
 * @dependencies DatabaseService
 */

import { Injectable } from '@nestjs/common';
import type { OrganizationSettings, StaffSessionInfo } from '@resort-booking/shared-types';
import { DatabaseService } from '../../shared/database/database.service';
import { isStaffRole, type StaffAccount, type StaffRole } from '../../shared/roles/staff-role';

interface OrganizationSettingsRow {
  id: string;
  name: string;
  legal_name: string;
  legal_address: string;
  vat_number: string;
  iban: string;
  bic: string;
  bank_account_name: string;
  contact_email: string;
  contact_phone: string;
  owner_name: string;
  booking_email: string;
  guest_reply_email: string;
}

interface StaffUserRow {
  id: string;
  organization_id: string;
  full_name: string;
  email: string;
  password_hash: string;
  role: string;
  active: boolean;
  can_manage_refunds: boolean;
  organization_name: string;
}

/** The account plus what only the sign-in code may see: the password hash and whether the account is switched on. */
export interface StaffCredentials extends StaffAccount {
  passwordHash: string;
  active: boolean;
}

/** What is stored about a new session besides the token hash: a coarse label and the salted hash of the sign-in IP. */
export interface SessionDevice {
  label: string | null;
  ipHash: string | null;
}

export const NO_DEVICE: SessionDevice = { label: null, ipHash: null };

/** A live session and the person behind it. */
export interface LiveSession {
  staff: StaffAccount;
  sessionId: string;
  lastUsedAt: Date;
}

interface SessionRow {
  id: string;
  device_label: string | null;
  created_at: Date;
  last_used_at: Date;
  expires_at: Date;
  current: boolean;
}

/** One staff row with its workspace name, joined in the same statement (no per-row lookups). */
const STAFF_COLUMNS = `u.id, u.organization_id, u.full_name, u.email, u.password_hash, u.role, u.active,
  u.can_manage_refunds, o.name AS organization_name`;
const STAFF_FROM = 'FROM staff_users u INNER JOIN organizations o ON o.id = u.organization_id';

@Injectable()
export class IdentityRepository {
  public constructor(private readonly database: DatabaseService) {}

  /**
   * One organization's settings. Staff routes always pass the caller's organization; `null` (the public site and
   * first-boot setup, which have no signed-in staff) reads the first organization.
   */
  public async getSettings(organizationId: string | null = null): Promise<OrganizationSettings | null> {
    const result = await this.database.query<OrganizationSettingsRow>(
      `
      SELECT id, name, legal_name, legal_address, vat_number, iban, bic,
        bank_account_name, contact_email, contact_phone,
        owner_name, booking_email, guest_reply_email
      FROM organizations
      WHERE ($1::uuid IS NULL OR id = $1::uuid)
      ORDER BY created_at ASC
      LIMIT 1
      `,
      [organizationId],
    );
    const row = result.rows[0];
    return row === undefined ? null : mapSettings(row);
  }

  public async updateSettings(
    id: string,
    input: Omit<OrganizationSettings, 'id'>,
  ): Promise<OrganizationSettings | null> {
    const result = await this.database.query<OrganizationSettingsRow>(
      `
      UPDATE organizations SET
        name = $2, legal_name = $3, legal_address = $4, vat_number = $5,
        iban = $6, bic = $7, bank_account_name = $8, contact_email = $9, contact_phone = $10,
        owner_name = $11, booking_email = $12, guest_reply_email = $13
      WHERE id = $1
      RETURNING id, name, legal_name, legal_address, vat_number, iban, bic,
        bank_account_name, contact_email, contact_phone,
        owner_name, booking_email, guest_reply_email
      `,
      [
        id,
        input.name,
        input.legalName,
        input.legalAddress,
        input.vatNumber,
        input.iban,
        input.bic,
        input.bankAccountName,
        input.contactEmail,
        input.contactPhone,
        input.ownerName,
        input.bookingEmail,
        input.guestReplyEmail,
      ],
    );
    const row = result.rows[0];
    return row === undefined ? null : mapSettings(row);
  }

  public async findFirstStaff(): Promise<StaffCredentials | null> {
    const result = await this.database.query<StaffUserRow>(
      `SELECT ${STAFF_COLUMNS} ${STAFF_FROM} ORDER BY u.created_at ASC LIMIT 1`,
    );
    const row = result.rows[0];
    return row === undefined ? null : mapCredentials(row);
  }

  public async countStaffUsers(): Promise<number> {
    const result = await this.database.query<{ n: string }>('SELECT COUNT(*)::text AS n FROM staff_users');
    return Number.parseInt(result.rows[0]?.n ?? '0', 10);
  }

  public async insertStaffUser(
    organizationId: string,
    fullName: string,
    email: string,
    passwordHash: string,
    role: StaffRole = 'admin',
  ): Promise<StaffAccount> {
    const result = await this.database.query<StaffUserRow>(
      `
      WITH u AS (
        INSERT INTO staff_users (organization_id, full_name, email, password_hash, role)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      )
      SELECT ${STAFF_COLUMNS} FROM u INNER JOIN organizations o ON o.id = u.organization_id
      `,
      [organizationId, fullName, email.toLowerCase(), passwordHash, role],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error('Staff user insert returned no row');
    }
    return mapStaff(row);
  }

  public async findStaffByEmail(email: string): Promise<StaffCredentials | null> {
    const result = await this.database.query<StaffUserRow>(
      `SELECT ${STAFF_COLUMNS} ${STAFF_FROM} WHERE lower(u.email) = $1`,
      [email.trim().toLowerCase()],
    );
    const row = result.rows[0];
    return row === undefined ? null : mapCredentials(row);
  }

  public async findStaffById(id: string): Promise<StaffCredentials | null> {
    const result = await this.database.query<StaffUserRow>(`SELECT ${STAFF_COLUMNS} ${STAFF_FROM} WHERE u.id = $1`, [id]);
    const row = result.rows[0];
    return row === undefined ? null : mapCredentials(row);
  }

  public async updateStaffProfile(id: string, fullName: string, email: string): Promise<StaffAccount | null> {
    const result = await this.database.query<StaffUserRow>(
      `
      WITH u AS (
        UPDATE staff_users SET full_name = $2, email = $3
        WHERE id = $1
        RETURNING *
      )
      SELECT ${STAFF_COLUMNS} FROM u INNER JOIN organizations o ON o.id = u.organization_id
      `,
      [id, fullName, email.toLowerCase()],
    );
    const row = result.rows[0];
    return row === undefined ? null : mapStaff(row);
  }

  public async updateStaffPassword(id: string, passwordHash: string): Promise<void> {
    await this.database.query('UPDATE staff_users SET password_hash = $2 WHERE id = $1', [id, passwordHash]);
  }

  public async createSession(staffUserId: string, tokenHash: string, expiresAt: Date, device: SessionDevice = NO_DEVICE): Promise<void> {
    await this.database.query(
      `
      INSERT INTO staff_sessions (staff_user_id, token_hash, expires_at, device_label, created_ip_hash)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [staffUserId, tokenHash, expiresAt.toISOString(), device.label, device.ipHash],
    );
  }

  /**
   * The person behind a live session. Live means: not past its absolute end, used within the idle window, and a
   * switched-off account has no session that works even if one is still stored. Also answers which session row it is and
   * when it was last used, so the caller can refresh that time (at most once a minute).
   */
  public async findLiveSession(tokenHash: string, idleSeconds: number): Promise<LiveSession | null> {
    const result = await this.database.query<StaffUserRow & { session_id: string; session_last_used_at: Date }>(
      `
      SELECT ${STAFF_COLUMNS}, s.id AS session_id, s.last_used_at AS session_last_used_at
      FROM staff_sessions s
      INNER JOIN staff_users u ON u.id = s.staff_user_id
      INNER JOIN organizations o ON o.id = u.organization_id
      WHERE s.token_hash = $1
        AND s.expires_at > now()
        AND s.last_used_at > now() - ($2::double precision * interval '1 second')
        AND u.active
      `,
      [tokenHash, idleSeconds],
    );
    const row = result.rows[0];
    return row === undefined ? null : { staff: mapStaff(row), sessionId: row.session_id, lastUsedAt: new Date(row.session_last_used_at) };
  }

  /**
   * Marks a session as used now. The `WHERE` makes it a no-op when another request already did so within the last
   * minute, so a busy page costs at most one write a minute per session.
   */
  public async touchSession(sessionId: string): Promise<void> {
    await this.database.query(
      "UPDATE staff_sessions SET last_used_at = now() WHERE id = $1 AND last_used_at < now() - interval '1 minute'",
      [sessionId],
    );
  }

  /**
   * The person's own live sessions, newest use first. `currentTokenHash` marks the one making the request.
   */
  public async listSessions(staffUserId: string, currentTokenHash: string, idleSeconds: number): Promise<StaffSessionInfo[]> {
    const result = await this.database.query<SessionRow>(
      `
      SELECT id, device_label, created_at, last_used_at, expires_at, (token_hash = $2) AS current
      FROM staff_sessions
      WHERE staff_user_id = $1
        AND expires_at > now()
        AND last_used_at > now() - ($3::double precision * interval '1 second')
      ORDER BY last_used_at DESC, created_at DESC
      `,
      [staffUserId, currentTokenHash, idleSeconds],
    );
    return result.rows.map(
      (row: SessionRow): StaffSessionInfo => ({
        id: row.id,
        deviceLabel: row.device_label ?? 'Unknown device',
        createdAt: new Date(row.created_at).toISOString(),
        lastUsedAt: new Date(row.last_used_at).toISOString(),
        expiresAt: new Date(row.expires_at).toISOString(),
        current: row.current,
      }),
    );
  }

  /**
   * Ends ONE session, only when it belongs to this person (the owner is part of the DELETE, so another person's id is
   * simply "not found"). True when a session was removed.
   */
  public async deleteOwnSession(staffUserId: string, sessionId: string): Promise<boolean> {
    const result = await this.database.query('DELETE FROM staff_sessions WHERE id = $1 AND staff_user_id = $2', [sessionId, staffUserId]);
    return (result.rowCount ?? 0) > 0;
  }

  public async touchLastLogin(staffUserId: string): Promise<void> {
    await this.database.query('UPDATE staff_users SET last_login_at = now() WHERE id = $1', [staffUserId]);
  }

  public async deleteSessionByTokenHash(tokenHash: string): Promise<void> {
    await this.database.query('DELETE FROM staff_sessions WHERE token_hash = $1', [tokenHash]);
  }

  /**
   * Signs a person out everywhere except the session they are using now (`keepTokenHash`). Returns how many
   * sessions were removed. With no `keepTokenHash` every session goes.
   */
  public async deleteSessionsExcept(staffUserId: string, keepTokenHash: string | null): Promise<number> {
    const result = await this.database.query(
      'DELETE FROM staff_sessions WHERE staff_user_id = $1 AND ($2::text IS NULL OR token_hash <> $2)',
      [staffUserId, keepTokenHash],
    );
    return result.rowCount ?? 0;
  }

  /**
   * Housekeeping: removes sessions that ended: past their absolute end, or unused for longer than the idle window
   * (they are already refused when read). Returns how many.
   */
  public async purgeExpiredSessions(idleSeconds: number): Promise<number> {
    const result = await this.database.query(
      "DELETE FROM staff_sessions WHERE expires_at <= now() OR last_used_at <= now() - ($1::double precision * interval '1 second')",
      [idleSeconds],
    );
    return result.rowCount ?? 0;
  }
}

function mapSettings(row: OrganizationSettingsRow): OrganizationSettings {
  return {
    id: row.id,
    name: row.name,
    legalName: row.legal_name,
    legalAddress: row.legal_address,
    vatNumber: row.vat_number,
    iban: row.iban,
    bic: row.bic,
    bankAccountName: row.bank_account_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    ownerName: row.owner_name,
    bookingEmail: row.booking_email,
    guestReplyEmail: row.guest_reply_email,
  };
}

function mapStaff(row: StaffUserRow): StaffAccount {
  const role: StaffRole = isStaffRole(row.role) ? row.role : 'employee';
  return {
    id: row.id,
    organizationId: row.organization_id,
    fullName: row.full_name,
    email: row.email,
    // An unknown value in the column must never become admin: fall back to the safer role.
    role,
    organizationName: row.organization_name,
    // Read on every request (no cache). An admin always has money access whatever the column says.
    canManageRefunds: role === 'admin' || row.can_manage_refunds,
  };
}

function mapCredentials(row: StaffUserRow): StaffCredentials {
  return { ...mapStaff(row), passwordHash: row.password_hash, active: row.active };
}
