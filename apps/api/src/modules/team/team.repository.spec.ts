/**
 * @file apps/api/src/modules/team/team.repository.spec.ts
 * @feature team
 * @dependencies TeamRepository, a fake database that records every statement
 */

import { Test } from '@nestjs/testing';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../shared/database/database.service';
import { TeamRepository } from './team.repository';

type Result = { rows: Record<string, unknown>[]; rowCount: number };
type Responder = (sql: string, params: unknown[]) => Result | Error | undefined;

const ORG = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-11-26T12:00:00Z');
const LATER = new Date('2026-11-27T12:00:00Z');
const EARLIER = new Date('2026-11-25T12:00:00Z');

describe('TeamRepository', () => {
  const statements: { sql: string; params: unknown[] }[] = [];
  let responder: Responder;
  let repository: TeamRepository;

  const run = (sql: string, params: unknown[] = []): Promise<Result> => {
    statements.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
    const answer = responder(sql, params);
    if (answer instanceof Error) {
      return Promise.reject(answer);
    }
    return Promise.resolve(answer ?? { rows: [], rowCount: 0 });
  };
  const sqlOf = (): string[] => statements.map((statement) => statement.sql);

  beforeEach(async () => {
    statements.length = 0;
    responder = (): Result => ({ rows: [], rowCount: 0 });
    // A client that only needs `query`: built from a bare object so no type assertion is involved.
    const client: PoolClient = Object.assign(Object.create(null), { query: run });
    const moduleRef = await Test.createTestingModule({
      providers: [
        TeamRepository,
        {
          provide: DatabaseService,
          useValue: { query: run, withClient: <T>(fn: (c: PoolClient) => Promise<T>): Promise<T> => fn(client) },
        },
      ],
    }).compile();
    repository = moduleRef.get(TeamRepository);
  });

  describe('registerWorkspace', () => {
    const input = { organizationName: 'Humphreys', fullName: 'Ada Lovelace', email: 'Ada@Example.com', passwordHash: 'salt:hash' };

    it('creates the organization and its admin in ONE transaction, then commits', async () => {
      responder = (sql): Result | undefined => {
        if (sql.includes('INSERT INTO organizations')) {
          return { rows: [{ id: ORG }], rowCount: 1 };
        }
        if (sql.includes('INSERT INTO staff_users')) {
          return { rows: [{ id: 's1' }], rowCount: 1 };
        }
        return undefined;
      };

      const account = await repository.registerWorkspace(input);

      expect(sqlOf()[0]).toBe('BEGIN');
      expect(sqlOf()[1]).toContain('INSERT INTO organizations');
      expect(sqlOf()[2]).toContain('INSERT INTO staff_users');
      expect(sqlOf()[2]).toContain("'admin'");
      expect(sqlOf()[3]).toBe('COMMIT');
      expect(statements[2]?.params).toEqual([ORG, 'Ada Lovelace', 'ada@example.com', 'salt:hash']);
      expect(account).toEqual({
        id: 's1',
        organizationId: ORG,
        fullName: 'Ada Lovelace',
        email: 'ada@example.com',
        role: 'admin',
        organizationName: 'Humphreys',
      });
    });

    it('rolls back (no organization without an admin) when the admin cannot be created, e.g. the email is taken', async () => {
      const duplicate = Object.assign(new Error('duplicate key'), { code: '23505' });
      responder = (sql): Result | Error | undefined => {
        if (sql.includes('INSERT INTO organizations')) {
          return { rows: [{ id: ORG }], rowCount: 1 };
        }
        if (sql.includes('INSERT INTO staff_users')) {
          return duplicate;
        }
        return undefined;
      };

      await expect(repository.registerWorkspace(input)).rejects.toBe(duplicate);

      expect(sqlOf()).toContain('ROLLBACK');
      expect(sqlOf()).not.toContain('COMMIT');
    });
  });

  describe('lists', () => {
    it('lists only the organization\'s members, marking the asker, in one statement', async () => {
      responder = (): Result => ({
        rows: [
          { id: 's1', full_name: 'Ada', email: 'ada@example.com', role: 'admin', active: true, last_login_at: NOW, created_at: EARLIER },
          { id: 's2', full_name: 'Bob', email: 'bob@example.com', role: 'surprise', active: false, last_login_at: null, created_at: EARLIER },
        ],
        rowCount: 2,
      });

      const members = await repository.listMembers(ORG, 's1');

      expect(statements).toHaveLength(1);
      expect(statements[0]?.sql).toContain('WHERE organization_id = $1');
      expect(statements[0]?.params).toEqual([ORG]);
      expect(members.map((member) => member.isYou)).toEqual([true, false]);
      // An unknown role value in the column never becomes admin.
      expect(members[1]?.role).toBe('employee');
      expect(members[0]?.lastLoginAt).toBe(NOW.toISOString());
      expect(members[1]?.lastLoginAt).toBeNull();
    });

    it('lists open invitations (not used, not revoked) with who made them, flagging expired ones and reset links', async () => {
      responder = (): Result => ({
        rows: [
          { id: 'i1', email: 'new@example.com', full_name: 'New', role: 'employee', staff_user_id: null, expires_at: LATER, accepted_at: null, revoked_at: null, created_at: EARLIER, created_by_name: 'Ada' },
          { id: 'i2', email: 'old@example.com', full_name: 'Old', role: 'employee', staff_user_id: 's9', expires_at: EARLIER, accepted_at: null, revoked_at: null, created_at: EARLIER, created_by_name: null },
        ],
        rowCount: 2,
      });

      const invites = await repository.listOpenInvites(ORG, NOW);

      expect(statements).toHaveLength(1);
      expect(statements[0]?.sql).toContain('i.organization_id = $1');
      expect(statements[0]?.sql).toContain('i.accepted_at IS NULL AND i.revoked_at IS NULL');
      expect(invites.map((invite) => [invite.expired, invite.isReset, invite.createdByName])).toEqual([
        [false, false, 'Ada'],
        [true, true, null],
      ]);
    });
  });

  describe('lookups', () => {
    it('finds a member only inside the organization', async () => {
      await repository.findMember(ORG, 's1');

      expect(statements[0]?.sql).toContain('id = $1 AND organization_id = $2');
      expect(statements[0]?.params).toEqual(['s1', ORG]);
    });

    it('checks an email case-insensitively across the whole system', async () => {
      responder = (): Result => ({ rows: [{}], rowCount: 1 });

      await expect(repository.emailInUse('  Ada@Example.com ')).resolves.toBe(true);

      expect(statements[0]?.sql).toContain('lower(email) = $1');
      expect(statements[0]?.params).toEqual(['ada@example.com']);
    });
  });

  describe('issueInvite', () => {
    const input = {
      organizationId: ORG,
      email: 'New@Example.com',
      fullName: 'New Person',
      role: 'employee' as const,
      staffUserId: null,
      tokenHash: 'hash-of-token',
      expiresAt: LATER,
      createdBy: 's1',
      now: NOW,
    };

    it('revokes any open invitation for the same email first, then inserts the new one, in one transaction', async () => {
      responder = (sql): Result | undefined =>
        sql.includes('INSERT INTO staff_invites')
          ? {
              rows: [{ id: 'i1', email: 'new@example.com', full_name: 'New Person', role: 'employee', staff_user_id: null, expires_at: LATER, accepted_at: null, revoked_at: null, created_at: NOW, created_by_name: 'Ada' }],
              rowCount: 1,
            }
          : undefined;

      const invite = await repository.issueInvite(input);

      expect(sqlOf()[0]).toBe('BEGIN');
      expect(sqlOf()[1]).toContain('UPDATE staff_invites SET revoked_at = now()');
      expect(sqlOf()[1]).toContain('lower(email) = lower($2)');
      expect(sqlOf()[2]).toContain('INSERT INTO staff_invites');
      expect(sqlOf()[3]).toBe('COMMIT');
      // The token itself never reaches the database: only its hash.
      expect(JSON.stringify(statements.map((statement) => statement.params))).toContain('hash-of-token');
      expect(statements[2]?.params).toEqual([ORG, 'new@example.com', 'New Person', 'employee', null, 'hash-of-token', LATER.toISOString(), 's1']);
      expect(invite).toMatchObject({ id: 'i1', expired: false, isReset: false, createdByName: 'Ada' });
    });

    it('rolls back when the insert fails, so the old invitation is not lost', async () => {
      responder = (sql): Error | undefined => (sql.includes('INSERT INTO staff_invites') ? new Error('boom') : undefined);

      await expect(repository.issueInvite(input)).rejects.toThrow('boom');

      expect(sqlOf()).toContain('ROLLBACK');
      expect(sqlOf()).not.toContain('COMMIT');
    });
  });

  describe('revokeInvite', () => {
    it('revokes only an open invitation of THIS organization and returns its email', async () => {
      responder = (): Result => ({ rows: [{ email: 'new@example.com' }], rowCount: 1 });

      await expect(repository.revokeInvite(ORG, 'i1')).resolves.toEqual({ email: 'new@example.com' });

      expect(statements[0]?.sql).toContain('id = $1 AND organization_id = $2 AND accepted_at IS NULL AND revoked_at IS NULL');
      expect(statements[0]?.params).toEqual(['i1', ORG]);
    });

    it('returns null when nothing matched', async () => {
      await expect(repository.revokeInvite(ORG, 'i1')).resolves.toBeNull();
    });
  });

  describe('findInviteByTokenHash', () => {
    it('looks up by the hash and returns the invitation with its workspace name', async () => {
      responder = (): Result => ({
        rows: [{ id: 'i1', organization_id: ORG, organization_name: 'Humphreys', email: 'new@example.com', full_name: 'New', role: 'employee', staff_user_id: null, expires_at: LATER, accepted_at: null, revoked_at: null, created_at: NOW, created_by_name: null }],
        rowCount: 1,
      });

      const invite = await repository.findInviteByTokenHash('hash');

      expect(statements[0]?.sql).toContain('WHERE i.token_hash = $1');
      expect(statements[0]?.params).toEqual(['hash']);
      expect(invite).toMatchObject({ id: 'i1', organizationName: 'Humphreys', email: 'new@example.com', role: 'employee', staffUserId: null });
    });

    it('returns null for an unknown hash', async () => {
      await expect(repository.findInviteByTokenHash('nope')).resolves.toBeNull();
    });
  });

  describe('acceptInvite', () => {
    const lockedRow = {
      id: 'i1',
      organization_id: ORG,
      organization_name: 'Humphreys',
      email: 'New@Example.com',
      full_name: 'New Person',
      role: 'employee',
      staff_user_id: null as string | null,
      expires_at: LATER,
      accepted_at: null as Date | null,
      revoked_at: null as Date | null,
      created_at: NOW,
      created_by_name: null,
    };

    function lockedWith(overrides: Partial<typeof lockedRow>): Responder {
      return (sql): Result | undefined => {
        if (sql.includes('FOR UPDATE')) {
          return { rows: [{ ...lockedRow, ...overrides }], rowCount: 1 };
        }
        if (sql.includes('INSERT INTO staff_users')) {
          return { rows: [{ id: 'new-staff' }], rowCount: 1 };
        }
        if (sql.includes('UPDATE staff_users SET password_hash')) {
          return { rows: [{ id: 's9', full_name: 'Existing', email: 'existing@example.com', role: 'employee', active: true }], rowCount: 1 };
        }
        return undefined;
      };
    }

    const accept = (): ReturnType<TeamRepository['acceptInvite']> =>
      repository.acceptInvite({ tokenHash: 'hash', passwordHash: 'salt:hash', fullName: null, now: NOW });

    it('locks the invitation row, creates the account with the invited role, marks it used and commits', async () => {
      responder = lockedWith({});

      const result = await accept();

      expect(sqlOf()[0]).toBe('BEGIN');
      expect(sqlOf()[1]).toContain('FOR UPDATE OF i');
      expect(sqlOf()[2]).toContain('INSERT INTO staff_users');
      expect(statements[2]?.params).toEqual([ORG, 'New Person', 'new@example.com', 'salt:hash', 'employee']);
      expect(sqlOf()[3]).toContain('UPDATE staff_invites SET accepted_at = now()');
      expect(sqlOf()[4]).toBe('COMMIT');
      expect(result).toMatchObject({ inviteId: 'i1', reset: false, account: { id: 'new-staff', role: 'employee', organizationName: 'Humphreys' } });
    });

    it('uses the name the person typed instead of the invited one', async () => {
      responder = lockedWith({});

      await repository.acceptInvite({ tokenHash: 'hash', passwordHash: 'salt:hash', fullName: 'Chosen Name', now: NOW });

      expect(statements[2]?.params?.[1]).toBe('Chosen Name');
    });

    it.each([
      ['already used', { accepted_at: EARLIER }],
      ['revoked', { revoked_at: EARLIER }],
      ['expired', { expires_at: EARLIER }],
      ['expiring right now', { expires_at: NOW }],
    ])('refuses an invitation that is %s: nothing is created and the transaction is rolled back', async (_label, overrides) => {
      responder = lockedWith(overrides);

      await expect(accept()).resolves.toBeNull();

      expect(sqlOf()).toContain('ROLLBACK');
      expect(sqlOf().some((sql) => sql.includes('INSERT INTO staff_users'))).toBe(false);
      expect(sqlOf()).not.toContain('COMMIT');
    });

    it('returns null for an unknown token', async () => {
      await expect(accept()).resolves.toBeNull();
      expect(sqlOf()).toContain('ROLLBACK');
    });

    it('for an access-reset link sets the existing account\'s password and signs it out everywhere, creating no account', async () => {
      responder = lockedWith({ staff_user_id: 's9' });

      const result = await accept();

      expect(sqlOf().some((sql) => sql.includes('INSERT INTO staff_users'))).toBe(false);
      expect(sqlOf().some((sql) => sql.includes('UPDATE staff_users SET password_hash'))).toBe(true);
      expect(sqlOf().some((sql) => sql.includes('DELETE FROM staff_sessions WHERE staff_user_id = $1'))).toBe(true);
      expect(result).toMatchObject({ reset: true, account: { id: 's9', email: 'existing@example.com' } });
    });

    it('rolls back and rethrows when the account insert collides (the email was taken meanwhile)', async () => {
      const duplicate = Object.assign(new Error('duplicate key'), { code: '23505' });
      responder = (sql, params): Result | Error | undefined => (sql.includes('INSERT INTO staff_users') ? duplicate : lockedWith({})(sql, params));

      await expect(accept()).rejects.toBe(duplicate);

      expect(sqlOf()).toContain('ROLLBACK');
      expect(sqlOf().some((sql) => sql.includes('accepted_at = now()'))).toBe(false);
    });
  });

  describe('changeMember', () => {
    const members = [
      { id: 'ada', role: 'admin', active: true },
      { id: 'eve', role: 'employee', active: true },
    ];

    function withMembers(): Responder {
      return (sql): Result | undefined => (sql.includes('FOR UPDATE') ? { rows: members, rowCount: members.length } : undefined);
    }

    it('locks every member of the organization first, so two admins cannot demote each other at once', async () => {
      responder = withMembers();

      await repository.changeMember(ORG, 'ada', 'eve', { role: 'admin' });

      expect(sqlOf()[1]).toContain('FROM staff_users WHERE organization_id = $1 FOR UPDATE');
      expect(statements[1]?.params).toEqual([ORG]);
    });

    it('applies a valid change inside the organization and commits', async () => {
      responder = withMembers();

      const outcome = await repository.changeMember(ORG, 'ada', 'eve', { role: 'admin' });

      expect(outcome).toEqual({ kind: 'changed', before: { id: 'eve', role: 'employee', active: true }, after: { role: 'admin', active: true } });
      const update = statements.find((statement) => statement.sql.startsWith('UPDATE staff_users SET role'));
      expect(update?.sql).toContain('AND organization_id = $4');
      expect(update?.params).toEqual(['eve', 'admin', true, ORG]);
      expect(sqlOf()[sqlOf().length - 1]).toBe('COMMIT');
    });

    it('removes a switched-off member\'s sessions in the same transaction', async () => {
      responder = withMembers();

      await repository.changeMember(ORG, 'ada', 'eve', { active: false });

      const deletion = statements.findIndex((statement) => statement.sql.includes('DELETE FROM staff_sessions'));
      expect(deletion).toBeGreaterThan(0);
      expect(statements[deletion]?.params).toEqual(['eve']);
      expect(sqlOf()[sqlOf().length - 1]).toBe('COMMIT');
    });

    it('keeps the sessions when only the role changes', async () => {
      responder = withMembers();

      await repository.changeMember(ORG, 'ada', 'eve', { role: 'admin' });

      expect(sqlOf().some((sql) => sql.includes('DELETE FROM staff_sessions'))).toBe(false);
    });

    it.each([
      ['demoting the last admin', 'ada', 'ada', { role: 'employee' as const }, 'LAST_ADMIN'],
      ['switching yourself off', 'ada', 'ada', { active: false }, 'CANNOT_DEACTIVATE_SELF'],
      ['someone outside the organization', 'ada', 'stranger', { active: false }, 'STAFF_NOT_FOUND'],
      ['a change that changes nothing', 'ada', 'eve', { role: 'employee' as const }, 'NOTHING_TO_CHANGE'],
    ])('refuses %s without writing anything', async (_label, actor, target, change, code) => {
      responder = withMembers();

      const outcome = await repository.changeMember(ORG, actor, target, change);

      expect(outcome).toEqual({ kind: 'refused', code });
      expect(sqlOf()).toContain('ROLLBACK');
      expect(sqlOf().some((sql) => sql.startsWith('UPDATE staff_users'))).toBe(false);
    });
  });
});
