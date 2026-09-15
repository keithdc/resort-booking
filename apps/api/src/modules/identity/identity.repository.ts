/**
 * @file apps/api/src/modules/identity/identity.repository.ts
 * @feature identity
 * @dependencies DatabaseService
 */

import { Injectable } from '@nestjs/common';
import type { OrganizationSettings, StaffProfile } from '@resort-booking/shared-types';
import { DatabaseService } from '../../shared/database/database.service';

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
}

@Injectable()
export class IdentityRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async getSettings(): Promise<OrganizationSettings | null> {
    const result = await this.database.query<OrganizationSettingsRow>(
      `
      SELECT id, name, legal_name, legal_address, vat_number, iban, bic,
        bank_account_name, contact_email, contact_phone,
        owner_name, booking_email, guest_reply_email
      FROM organizations
      ORDER BY created_at ASC
      LIMIT 1
      `,
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

  public async findFirstStaff(): Promise<(StaffProfile & { passwordHash: string }) | null> {
    const result = await this.database.query<StaffUserRow>(
      `
      SELECT id, organization_id, full_name, email, password_hash
      FROM staff_users
      ORDER BY created_at ASC
      LIMIT 1
      `,
    );
    const row = result.rows[0];
    if (row === undefined) {
      return null;
    }
    return { ...mapStaff(row), passwordHash: row.password_hash };
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
  ): Promise<StaffProfile> {
    const result = await this.database.query<StaffUserRow>(
      `
      INSERT INTO staff_users (organization_id, full_name, email, password_hash)
      VALUES ($1, $2, $3, $4)
      RETURNING id, organization_id, full_name, email, password_hash
      `,
      [organizationId, fullName, email.toLowerCase(), passwordHash],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error('Staff user insert returned no row');
    }
    return mapStaff(row);
  }

  public async findStaffByEmail(email: string): Promise<(StaffProfile & { passwordHash: string }) | null> {
    const result = await this.database.query<StaffUserRow>(
      `
      SELECT id, organization_id, full_name, email, password_hash
      FROM staff_users
      WHERE email = $1
      `,
      [email.toLowerCase()],
    );
    const row = result.rows[0];
    if (row === undefined) {
      return null;
    }
    return { ...mapStaff(row), passwordHash: row.password_hash };
  }

  public async findStaffById(id: string): Promise<(StaffProfile & { passwordHash: string }) | null> {
    const result = await this.database.query<StaffUserRow>(
      `
      SELECT id, organization_id, full_name, email, password_hash
      FROM staff_users
      WHERE id = $1
      `,
      [id],
    );
    const row = result.rows[0];
    if (row === undefined) {
      return null;
    }
    return { ...mapStaff(row), passwordHash: row.password_hash };
  }

  public async updateStaffProfile(id: string, fullName: string, email: string): Promise<StaffProfile | null> {
    const result = await this.database.query<StaffUserRow>(
      `
      UPDATE staff_users SET full_name = $2, email = $3
      WHERE id = $1
      RETURNING id, organization_id, full_name, email, password_hash
      `,
      [id, fullName, email.toLowerCase()],
    );
    const row = result.rows[0];
    return row === undefined ? null : mapStaff(row);
  }

  public async updateStaffPassword(id: string, passwordHash: string): Promise<void> {
    await this.database.query('UPDATE staff_users SET password_hash = $2 WHERE id = $1', [id, passwordHash]);
  }

  public async createSession(staffUserId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.database.query(
      `
      INSERT INTO staff_sessions (staff_user_id, token_hash, expires_at)
      VALUES ($1, $2, $3)
      `,
      [staffUserId, tokenHash, expiresAt.toISOString()],
    );
  }

  public async findStaffBySessionTokenHash(tokenHash: string): Promise<StaffProfile | null> {
    const result = await this.database.query<StaffUserRow>(
      `
      SELECT u.id, u.organization_id, u.full_name, u.email, u.password_hash
      FROM staff_sessions s
      INNER JOIN staff_users u ON u.id = s.staff_user_id
      WHERE s.token_hash = $1 AND s.expires_at > now()
      `,
      [tokenHash],
    );
    const row = result.rows[0];
    return row === undefined ? null : mapStaff(row);
  }

  public async deleteSessionByTokenHash(tokenHash: string): Promise<void> {
    await this.database.query('DELETE FROM staff_sessions WHERE token_hash = $1', [tokenHash]);
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

function mapStaff(row: StaffUserRow): StaffProfile {
  return {
    id: row.id,
    organizationId: row.organization_id,
    fullName: row.full_name,
    email: row.email,
  };
}
