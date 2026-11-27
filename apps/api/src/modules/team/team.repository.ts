/**
 * @file apps/api/src/modules/team/team.repository.ts
 * @feature team
 * @dependencies DatabaseService
 */

import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../shared/database/database.service';
import { isStaffRole, type StaffAccount, type StaffRole } from '../../shared/roles/staff-role';
import { planMemberChange, type MemberRefusal, type MemberState } from './team.rules';
import type { MemberChange, TeamInvite, TeamMember } from './team.types';

interface MemberRow {
  id: string;
  full_name: string;
  email: string;
  role: string;
  active: boolean;
  can_manage_refunds: boolean;
  last_login_at: Date | null;
  created_at: Date;
}

interface InviteRow {
  id: string;
  email: string;
  full_name: string;
  role: string;
  staff_user_id: string | null;
  expires_at: Date;
  accepted_at: Date | null;
  revoked_at: Date | null;
  created_at: Date;
  created_by_name: string | null;
  can_manage_refunds: boolean;
  organization_id?: string;
  organization_name?: string;
}

/** An invitation looked up by its token hash, with everything the accept step needs. */
export interface InviteRecord {
  id: string;
  organizationId: string;
  organizationName: string;
  email: string;
  fullName: string;
  role: StaffRole;
  /** The refund permission the new account starts with. */
  canManageRefunds: boolean;
  /** Set for an access-reset link: the existing account whose password it sets. */
  staffUserId: string | null;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
}

/** What a member change did, for the audit log. */
export type MemberChangeOutcome =
  | { kind: 'changed'; before: MemberState; after: { role: StaffRole; active: boolean; canManageRefunds: boolean } }
  | { kind: 'refused'; code: MemberRefusal };

/** Writes the audit row(s) inside the member change's own transaction, after the update and before the commit. */
export type MemberChangeAudit = (client: PoolClient, done: { before: MemberState; after: { role: StaffRole; active: boolean; canManageRefunds: boolean }; memberName: string }) => Promise<void>;

const MEMBER_COLUMNS = 'id, full_name, email, role, active, can_manage_refunds, last_login_at, created_at';

@Injectable()
export class TeamRepository {
  public constructor(private readonly database: DatabaseService) {}

  /**
   * Registers a workspace: the organization and its first admin, in ONE transaction (never an organization
   * without an admin). Throws the database's unique violation (code 23505) when the email is taken.
   */
  public async registerWorkspace(input: {
    organizationName: string;
    fullName: string;
    email: string;
    passwordHash: string;
  }): Promise<StaffAccount> {
    return this.database.withClient(async (client): Promise<StaffAccount> => {
      await client.query('BEGIN');
      try {
        const organization = await client.query<{ id: string }>(
          'INSERT INTO organizations (name, owner_name) VALUES ($1, $2) RETURNING id',
          [input.organizationName, input.fullName],
        );
        const organizationId = organization.rows[0]?.id;
        if (organizationId === undefined) {
          throw new Error('Organization insert returned no row');
        }
        const staff = await client.query<{ id: string }>(
          `
          INSERT INTO staff_users (organization_id, full_name, email, password_hash, role)
          VALUES ($1, $2, $3, $4, 'admin')
          RETURNING id
          `,
          [organizationId, input.fullName, input.email.toLowerCase(), input.passwordHash],
        );
        const id = staff.rows[0]?.id;
        if (id === undefined) {
          throw new Error('Staff insert returned no row');
        }
        await client.query('COMMIT');
        return {
          id,
          organizationId,
          fullName: input.fullName,
          email: input.email.toLowerCase(),
          role: 'admin',
          organizationName: input.organizationName,
          canManageRefunds: true,
        };
      } catch (error: unknown) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  public async listMembers(organizationId: string, actorId: string): Promise<TeamMember[]> {
    const result = await this.database.query<MemberRow>(
      `SELECT ${MEMBER_COLUMNS} FROM staff_users WHERE organization_id = $1 ORDER BY active DESC, role ASC, lower(full_name) ASC`,
      [organizationId],
    );
    return result.rows.map((row): TeamMember => mapMember(row, actorId));
  }

  /** Open invitations (not used, not revoked), expired ones included so the admin can replace them. */
  public async listOpenInvites(organizationId: string, now: Date): Promise<TeamInvite[]> {
    const result = await this.database.query<InviteRow>(
      `
      SELECT i.id, i.email, i.full_name, i.role, i.staff_user_id, i.expires_at, i.accepted_at, i.revoked_at,
        i.created_at, i.can_manage_refunds, c.full_name AS created_by_name
      FROM staff_invites i
      LEFT JOIN staff_users c ON c.id = i.created_by_staff_id
      WHERE i.organization_id = $1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL
      ORDER BY i.created_at DESC
      `,
      [organizationId],
    );
    return result.rows.map((row): TeamInvite => mapInvite(row, now));
  }

  public async findMember(organizationId: string, staffId: string): Promise<(MemberState & { email: string; fullName: string }) | null> {
    const result = await this.database.query<MemberRow>(
      `SELECT ${MEMBER_COLUMNS} FROM staff_users WHERE id = $1 AND organization_id = $2`,
      [staffId, organizationId],
    );
    const row = result.rows[0];
    return row === undefined
      ? null
      : {
          id: row.id,
          role: toRole(row.role),
          active: row.active,
          canManageRefunds: row.can_manage_refunds,
          email: row.email,
          fullName: row.full_name,
        };
  }

  /** Is this email already a staff account anywhere? (Emails are unique across the whole system.) */
  public async emailInUse(email: string): Promise<boolean> {
    const result = await this.database.query('SELECT 1 FROM staff_users WHERE lower(email) = $1', [email.trim().toLowerCase()]);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Issues an invitation (or an access-reset link when `staffUserId` is given): first revokes any open one for
   * the same email, then inserts the new one. One transaction, so there is never none and never two.
   */
  public async issueInvite(input: {
    organizationId: string;
    email: string;
    fullName: string;
    role: StaffRole;
    /** Employees only; stored false for an admin invite. */
    canManageRefunds: boolean;
    staffUserId: string | null;
    tokenHash: string;
    expiresAt: Date;
    createdBy: string;
    now: Date;
  }, audit?: (client: PoolClient, invite: TeamInvite) => Promise<void>): Promise<TeamInvite> {
    return this.database.withClient(async (client): Promise<TeamInvite> => {
      await client.query('BEGIN');
      try {
        await client.query(
          `
          UPDATE staff_invites SET revoked_at = now()
          WHERE organization_id = $1 AND lower(email) = lower($2) AND accepted_at IS NULL AND revoked_at IS NULL
          `,
          [input.organizationId, input.email],
        );
        const inserted = await client.query<InviteRow>(
          `
          WITH i AS (
            INSERT INTO staff_invites (organization_id, email, full_name, role, staff_user_id, token_hash, expires_at, created_by_staff_id, can_manage_refunds)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
          )
          SELECT i.id, i.email, i.full_name, i.role, i.staff_user_id, i.expires_at, i.accepted_at, i.revoked_at,
            i.created_at, i.can_manage_refunds, c.full_name AS created_by_name
          FROM i LEFT JOIN staff_users c ON c.id = i.created_by_staff_id
          `,
          [
            input.organizationId,
            input.email.toLowerCase(),
            input.fullName,
            input.role,
            input.staffUserId,
            input.tokenHash,
            input.expiresAt.toISOString(),
            input.createdBy,
            input.role === 'employee' && input.canManageRefunds,
          ],
        );
        const row = inserted.rows[0];
        if (row === undefined) {
          throw new Error('Invite insert returned no row');
        }
        const invite = mapInvite(row, input.now);
        // Same transaction: the link exists and its audit row exists, or neither (docs/13 R6-05).
        await audit?.(client, invite);
        await client.query('COMMIT');
        return invite;
      } catch (error: unknown) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  /**
   * Revokes an open invitation of this organization. Null when there was none to revoke. With `audit` the audit row is
   * saved in the same transaction, and only when an invitation really was revoked (docs/13 R6-05).
   */
  public async revokeInvite(
    organizationId: string,
    inviteId: string,
    audit?: (client: PoolClient) => Promise<void>,
  ): Promise<{ email: string } | null> {
    const sql = `
      UPDATE staff_invites SET revoked_at = now()
      WHERE id = $1 AND organization_id = $2 AND accepted_at IS NULL AND revoked_at IS NULL
      RETURNING email
      `;
    const params = [inviteId, organizationId];
    if (audit === undefined) {
      return (await this.database.query<{ email: string }>(sql, params)).rows[0] ?? null;
    }
    return this.database.withTransaction(async (client): Promise<{ email: string } | null> => {
      const revoked = (await client.query<{ email: string }>(sql, params)).rows[0] ?? null;
      if (revoked !== null) {
        await audit(client);
      }
      return revoked;
    });
  }

  /** Looks an invitation up by the hash of its token (an indexed equality on a secret hash: nothing to time). */
  public async findInviteByTokenHash(tokenHash: string): Promise<InviteRecord | null> {
    const result = await this.database.query<InviteRow>(
      `
      SELECT i.id, i.organization_id, o.name AS organization_name, i.email, i.full_name, i.role, i.staff_user_id,
        i.expires_at, i.accepted_at, i.revoked_at, i.created_at, i.can_manage_refunds, NULL::text AS created_by_name
      FROM staff_invites i
      INNER JOIN organizations o ON o.id = i.organization_id
      WHERE i.token_hash = $1
      `,
      [tokenHash],
    );
    const row = result.rows[0];
    if (row === undefined || row.organization_id === undefined || row.organization_name === undefined) {
      return null;
    }
    return {
      id: row.id,
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      email: row.email,
      fullName: row.full_name,
      role: toRole(row.role),
      canManageRefunds: row.can_manage_refunds,
      staffUserId: row.staff_user_id,
      expiresAt: row.expires_at,
      acceptedAt: row.accepted_at,
      revokedAt: row.revoked_at,
    };
  }

  /**
   * Uses an invitation, atomically. The row is locked and checked again (two people clicking the same link
   * at once: one wins). A normal invitation creates the account; a reset link sets the existing account's
   * password and signs it out everywhere. Returns null when the invitation is no longer usable.
   */
  public async acceptInvite(input: {
    tokenHash: string;
    passwordHash: string;
    fullName: string | null;
    now: Date;
  }): Promise<{ account: StaffAccount; inviteId: string; reset: boolean } | null> {
    return this.database.withClient(async (client): Promise<{ account: StaffAccount; inviteId: string; reset: boolean } | null> => {
      await client.query('BEGIN');
      try {
        const locked = await client.query<InviteRow>(
          `
          SELECT i.id, i.organization_id, o.name AS organization_name, i.email, i.full_name, i.role, i.staff_user_id,
            i.expires_at, i.accepted_at, i.revoked_at, i.created_at, i.can_manage_refunds, NULL::text AS created_by_name
          FROM staff_invites i
          INNER JOIN organizations o ON o.id = i.organization_id
          WHERE i.token_hash = $1
          FOR UPDATE OF i
          `,
          [input.tokenHash],
        );
        const invite = locked.rows[0];
        if (
          invite === undefined ||
          invite.accepted_at !== null ||
          invite.revoked_at !== null ||
          invite.expires_at.getTime() <= input.now.getTime() ||
          invite.organization_id === undefined ||
          invite.organization_name === undefined
        ) {
          await client.query('ROLLBACK');
          return null;
        }
        const account =
          invite.staff_user_id === null
            ? await insertInvitedUser(client, invite, input.passwordHash, input.fullName)
            : await resetExistingUser(client, invite, input.passwordHash);
        await client.query('UPDATE staff_invites SET accepted_at = now() WHERE id = $1', [invite.id]);
        await client.query('COMMIT');
        return { account, inviteId: invite.id, reset: invite.staff_user_id !== null };
      } catch (error: unknown) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  /**
   * Changes a member's role and/or switched-on state. The organization's members are locked for the
   * duration, so two admins demoting each other at the same moment cannot leave the workspace without an
   * admin. A switched-off member's sessions are removed in the same transaction.
   */
  public async changeMember(
    organizationId: string,
    actorId: string,
    targetId: string,
    change: MemberChange,
    audit?: MemberChangeAudit,
  ): Promise<MemberChangeOutcome> {
    return this.database.withClient(async (client): Promise<MemberChangeOutcome> => {
      await client.query('BEGIN');
      try {
        const rows = await client.query<{ id: string; full_name: string; role: string; active: boolean; can_manage_refunds: boolean }>(
          'SELECT id, full_name, role, active, can_manage_refunds FROM staff_users WHERE organization_id = $1 FOR UPDATE',
          [organizationId],
        );
        const members: MemberState[] = rows.rows.map(
          (row): MemberState => ({ id: row.id, role: toRole(row.role), active: row.active, canManageRefunds: row.can_manage_refunds }),
        );
        const verdict = planMemberChange(members, actorId, targetId, change);
        if (!verdict.ok) {
          await client.query('ROLLBACK');
          return { kind: 'refused', code: verdict.code };
        }
        const before = members.find((member): boolean => member.id === targetId);
        if (before === undefined) {
          await client.query('ROLLBACK');
          return { kind: 'refused', code: 'STAFF_NOT_FOUND' };
        }
        await client.query(
          'UPDATE staff_users SET role = $2, active = $3, can_manage_refunds = $4 WHERE id = $1 AND organization_id = $5',
          [targetId, verdict.role, verdict.active, verdict.canManageRefunds, organizationId],
        );
        if (!verdict.active) {
          await client.query('DELETE FROM staff_sessions WHERE staff_user_id = $1', [targetId]);
        }
        const after = { role: verdict.role, active: verdict.active, canManageRefunds: verdict.canManageRefunds };
        // Same transaction: the change and its audit row(s) both happen, or neither (docs/13 R6-05).
        await audit?.(client, { before, after, memberName: rows.rows.find((row) => row.id === targetId)?.full_name ?? '' });
        await client.query('COMMIT');
        return { kind: 'changed', before, after };
      } catch (error: unknown) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }
}

async function insertInvitedUser(
  client: PoolClient,
  invite: InviteRow,
  passwordHash: string,
  fullName: string | null,
): Promise<StaffAccount> {
  const organizationId = invite.organization_id ?? '';
  const name = fullName ?? invite.full_name;
  const inserted = await client.query<{ id: string }>(
    `
    INSERT INTO staff_users (organization_id, full_name, email, password_hash, role, can_manage_refunds)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id
    `,
    [organizationId, name, invite.email.toLowerCase(), passwordHash, invite.role, invite.role === 'employee' && invite.can_manage_refunds],
  );
  const id = inserted.rows[0]?.id;
  if (id === undefined) {
    throw new Error('Staff insert returned no row');
  }
  return {
    id,
    organizationId,
    fullName: name,
    email: invite.email.toLowerCase(),
    role: toRole(invite.role),
    organizationName: invite.organization_name ?? '',
    canManageRefunds: invite.role === 'admin' || invite.can_manage_refunds,
  };
}

async function resetExistingUser(client: PoolClient, invite: InviteRow, passwordHash: string): Promise<StaffAccount> {
  const updated = await client.query<{ id: string; full_name: string; email: string; role: string; active: boolean; can_manage_refunds: boolean }>(
    `
    UPDATE staff_users SET password_hash = $2
    WHERE id = $1 AND organization_id = $3 AND active
    RETURNING id, full_name, email, role, active, can_manage_refunds
    `,
    [invite.staff_user_id, passwordHash, invite.organization_id],
  );
  const row = updated.rows[0];
  if (row === undefined) {
    throw new Error('The account for this access link is no longer active');
  }
  // Setting a new password through a reset link ends every other way in.
  await client.query('DELETE FROM staff_sessions WHERE staff_user_id = $1', [row.id]);
  return {
    id: row.id,
    organizationId: invite.organization_id ?? '',
    fullName: row.full_name,
    email: row.email,
    role: toRole(row.role),
    organizationName: invite.organization_name ?? '',
    canManageRefunds: row.role === 'admin' || row.can_manage_refunds,
  };
}

function toRole(value: string): StaffRole {
  return isStaffRole(value) ? value : 'employee';
}

function mapMember(row: MemberRow, actorId: string): TeamMember {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: toRole(row.role),
    active: row.active,
    lastLoginAt: row.last_login_at === null ? null : row.last_login_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    // An admin always has money access; for an employee it is the stored permission.
    canManageRefunds: row.role === 'admin' || row.can_manage_refunds,
    isYou: row.id === actorId,
  };
}

function mapInvite(row: InviteRow, now: Date): TeamInvite {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: toRole(row.role),
    expiresAt: row.expires_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    createdByName: row.created_by_name,
    expired: row.expires_at.getTime() <= now.getTime(),
    isReset: row.staff_user_id !== null,
    canManageRefunds: row.role === 'employee' && row.can_manage_refunds,
  };
}
