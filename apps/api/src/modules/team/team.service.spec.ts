/**
 * @file apps/api/src/modules/team/team.service.spec.ts
 * @feature team
 * @dependencies TeamService, mocked repository, identity, audit and limiter
 */

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AuditService } from '../../shared/audit/audit.service';
import type { AuditActor } from '../../shared/audit/audit.types';
import { MailService, type MailMessage, type MailResult } from '../../shared/mail/mail.service';
import { RateLimitedException } from '../../shared/http/rate-limited.exception';
import type { StaffAccount, StaffSessionResult } from '../../shared/roles/staff-role';
import { PasswordTooWeakException } from '../../shared/validation/password-too-weak.exception';
import { hashSessionToken } from '../identity/identity.password';
import { IdentityService } from '../identity/identity.service';
import { TeamLimiter } from './team-limiter';
import { TeamRepository, type InviteRecord, type MemberChangeOutcome } from './team.repository';
import { TeamService, type PublicContext, type TeamActor } from './team.service';
import type { TeamInvite, TeamMember } from './team.types';

const ORG = '11111111-1111-4111-8111-111111111111';
const CONTEXT: PublicContext = { ip: '203.0.113.7', requestId: 'req-1' };
const GOOD_PASSWORD = 'Correct-Horse-9';
const TOKEN = 'a'.repeat(64);

const ADMIN: StaffAccount = { id: 'admin-1', organizationId: ORG, fullName: 'Ada', email: 'ada@example.com', role: 'admin', organizationName: 'Humphreys', canManageRefunds: true };
const ACTOR: TeamActor = { staff: ADMIN, ip: '203.0.113.7', requestId: 'req-2' };

const INVITE: TeamInvite = {
  id: 'inv-1',
  email: 'new@example.com',
  fullName: 'New Person',
  role: 'employee',
  expiresAt: '2026-11-29T12:00:00.000Z',
  createdAt: '2026-11-26T12:00:00.000Z',
  createdByName: 'Ada',
  expired: false,
  isReset: false,
  canManageRefunds: false,
};

function inviteRecord(overrides: Partial<InviteRecord> = {}): InviteRecord {
  return {
    id: 'inv-1',
    organizationId: ORG,
    organizationName: 'Humphreys',
    email: 'new@example.com',
    fullName: 'New Person',
    role: 'employee',
    canManageRefunds: false,
    staffUserId: null,
    expiresAt: new Date(Date.now() + 3_600_000),
    acceptedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

const MEMBER: TeamMember = {
  id: 'eve-1',
  fullName: 'Eve',
  email: 'eve@example.com',
  role: 'admin',
  active: true,
  lastLoginAt: null,
  createdAt: '2026-11-01T00:00:00.000Z',
  canManageRefunds: true,
  isYou: false,
};

describe('TeamService', () => {
  const repo = {
    registerWorkspace: jest.fn<Promise<StaffAccount>, [Record<string, unknown>]>(),
    listMembers: jest.fn<Promise<TeamMember[]>, [string, string]>(),
    listOpenInvites: jest.fn<Promise<TeamInvite[]>, [string, Date]>(),
    findMember: jest.fn<Promise<{ id: string; role: 'admin' | 'employee'; active: boolean; canManageRefunds: boolean; email: string; fullName: string } | null>, [string, string]>(),
    emailInUse: jest.fn<Promise<boolean>, [string]>(),
    issueInvite: jest.fn<Promise<TeamInvite>, [Record<string, unknown>]>(),
    revokeInvite: jest.fn<Promise<{ email: string } | null>, [string, string]>(),
    findInviteByTokenHash: jest.fn<Promise<InviteRecord | null>, [string]>(),
    acceptInvite: jest.fn<Promise<{ account: StaffAccount; inviteId: string; reset: boolean } | null>, [Record<string, unknown>]>(),
    changeMember: jest.fn<Promise<MemberChangeOutcome>, [string, string, string, Record<string, unknown>]>(),
  };
  const identity = {
    assertPasswordAcceptable: jest.fn<void, [string, string]>(),
    startSession: jest.fn<Promise<StaffSessionResult>, [StaffAccount, unknown?]>(),
    logoutAll: jest.fn<Promise<number>, [string]>(),
    resetTwoFactor: jest.fn<Promise<{ hadTwoFactor: boolean }>, [string, string]>(),
  };
  const recordBy = jest.fn<Promise<boolean>, [AuditActor, string, Record<string, unknown>?]>();
  const limiter = {
    checkRegistration: jest.fn<Promise<void>, [string | undefined, string]>(),
    checkInviteAccept: jest.fn<Promise<void>, [string | undefined]>(),
    checkInvitePreview: jest.fn<Promise<void>, [string | undefined]>(),
    allowInviteEmail: jest.fn<Promise<boolean>, [string, string]>(),
  };
  const mail = { enabled: true, send: jest.fn<Promise<MailResult>, [MailMessage]>() };
  let env: Record<string, string>;
  const logs: string[] = [];

  async function build(): Promise<TeamService> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TeamService,
        { provide: TeamRepository, useValue: repo },
        { provide: IdentityService, useValue: identity },
        { provide: AuditService, useValue: { recordBy } },
        { provide: TeamLimiter, useValue: limiter },
        { provide: MailService, useValue: mail },
        { provide: ConfigService, useValue: { get: (name: string): string | undefined => env[name] } },
      ],
    }).compile();
    return moduleRef.get(TeamService);
  }

  function sessionFor(account: StaffAccount): StaffSessionResult {
    return { token: 'session-token', expiresAt: '2026-12-03T00:00:00.000Z', staff: account };
  }

  let service: TeamService;

  beforeEach(async () => {
    jest.resetAllMocks();
    logs.length = 0;
    jest.spyOn(Logger.prototype, 'log').mockImplementation((...args: unknown[]): void => {
      logs.push(String(args[0]));
    });
    jest.spyOn(Logger.prototype, 'warn').mockImplementation((...args: unknown[]): void => {
      logs.push(String(args[0]));
    });
    env = { ALLOW_REGISTRATION: 'true', ADMIN_APP_URL: 'https://admin.example.com/' };
    mail.enabled = true;
    mail.send.mockResolvedValue({ status: 'sent', providerId: 'abc' });
    limiter.allowInviteEmail.mockResolvedValue(true);
    repo.emailInUse.mockResolvedValue(false);
    repo.issueInvite.mockResolvedValue(INVITE);
    identity.startSession.mockImplementation((account) => Promise.resolve(sessionFor(account)));
    identity.logoutAll.mockResolvedValue(1);
    recordBy.mockResolvedValue(true);
    limiter.checkRegistration.mockResolvedValue(undefined);
    limiter.checkInviteAccept.mockResolvedValue(undefined);
    limiter.checkInvitePreview.mockResolvedValue(undefined);
    service = await build();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('registration', () => {
    const input = { organizationName: ' Humphreys ', fullName: ' Ada Lovelace ', email: ' Ada@Example.com ', password: GOOD_PASSWORD };
    const created: StaffAccount = { id: 's1', organizationId: ORG, fullName: 'Ada Lovelace', email: 'ada@example.com', role: 'admin', organizationName: 'Humphreys', canManageRefunds: true };

    it('reports whether it is open', async () => {
      expect(service.status()).toEqual({ open: true });
      env.ALLOW_REGISTRATION = 'false';
      expect((await build()).status()).toEqual({ open: false });
    });

    it('is CLOSED in production unless ALLOW_REGISTRATION=true', async () => {
      const before = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        env = {};
        expect((await build()).status()).toEqual({ open: false });
        env = { ALLOW_REGISTRATION: 'true' };
        expect((await build()).status()).toEqual({ open: true });
      } finally {
        process.env.NODE_ENV = before;
      }
    });

    it('is CLOSED by default when NODE_ENV is unset or staging (fail safe), open only when ALLOW_REGISTRATION=true', async () => {
      const before = process.env.NODE_ENV;
      try {
        for (const value of [undefined, 'staging', 'prod']) {
          if (value === undefined) {
            delete process.env.NODE_ENV;
          } else {
            process.env.NODE_ENV = value;
          }
          env = {};
          expect((await build()).status()).toEqual({ open: false });
        }
      } finally {
        process.env.NODE_ENV = before;
      }
    });

    it('refuses with 403 REGISTRATION_CLOSED when closed, before counting, hashing or reading anything', async () => {
      env.ALLOW_REGISTRATION = 'false';
      service = await build();

      await expect(service.register(input, CONTEXT)).rejects.toMatchObject({ status: 403, response: { code: 'REGISTRATION_CLOSED' } });

      expect(limiter.checkRegistration).not.toHaveBeenCalled();
      expect(repo.emailInUse).not.toHaveBeenCalled();
      expect(repo.registerWorkspace).not.toHaveBeenCalled();
    });

    it('creates the workspace and its admin from trimmed, lower-cased input, signs them in and writes the audit row', async () => {
      repo.registerWorkspace.mockResolvedValue(created);

      const session = await service.register(input, CONTEXT);
      expect(identity.startSession).toHaveBeenCalledWith(expect.anything(), CONTEXT);

      expect(limiter.checkRegistration).toHaveBeenCalledWith('203.0.113.7', 'ada@example.com');
      expect(identity.assertPasswordAcceptable).toHaveBeenCalledWith(GOOD_PASSWORD, 'ada@example.com');
      const passed = repo.registerWorkspace.mock.calls[0]?.[0];
      expect(passed).toMatchObject({ organizationName: 'Humphreys', fullName: 'Ada Lovelace', email: 'ada@example.com' });
      expect(passed?.passwordHash).toMatch(/^scrypt[$]\d+[$]\d+[$]\d+[$][0-9a-f]+[$][0-9a-f]+$/);
      expect(JSON.stringify(passed)).not.toContain(GOOD_PASSWORD);
      expect(session.staff).toMatchObject({ role: 'admin', organizationName: 'Humphreys', canManageRefunds: true });
      expect(recordBy).toHaveBeenCalledWith(
        { organizationId: ORG, staffUserId: 's1', ip: '203.0.113.7', requestId: 'req-1' },
        'auth.register',
        { targetType: 'organization', targetId: ORG },
      );
    });

    it('checks the rate limit BEFORE the password policy, hashing and the database', async () => {
      limiter.checkRegistration.mockRejectedValue(new RateLimitedException('REGISTRATION_RATE_LIMITED', 'slow down', 60));

      await expect(service.register(input, CONTEXT)).rejects.toMatchObject({ status: 429 });

      expect(identity.assertPasswordAcceptable).not.toHaveBeenCalled();
      expect(repo.emailInUse).not.toHaveBeenCalled();
    });

    it('refuses a weak password before anything is hashed or stored', async () => {
      identity.assertPasswordAcceptable.mockImplementation(() => {
        throw new PasswordTooWeakException(['Use at least 10 characters']);
      });

      await expect(service.register({ ...input, password: 'short' }, CONTEXT)).rejects.toMatchObject({ response: { code: 'PASSWORD_TOO_WEAK' } });

      expect(repo.registerWorkspace).not.toHaveBeenCalled();
    });

    it('answers 409 EMAIL_TAKEN when the email already has an account', async () => {
      repo.emailInUse.mockResolvedValue(true);

      await expect(service.register(input, CONTEXT)).rejects.toMatchObject({ status: 409, response: { code: 'EMAIL_TAKEN' } });

      expect(repo.registerWorkspace).not.toHaveBeenCalled();
    });

    it('answers 409 EMAIL_TAKEN too when the database says so at the last moment (two sign-ups at once)', async () => {
      repo.registerWorkspace.mockRejectedValue(Object.assign(new Error('duplicate key'), { code: '23505' }));

      await expect(service.register(input, CONTEXT)).rejects.toMatchObject({ status: 409, response: { code: 'EMAIL_TAKEN' } });

      expect(identity.startSession).not.toHaveBeenCalled();
    });

    it('lets other database errors through as errors', async () => {
      repo.registerWorkspace.mockRejectedValue(new Error('connection lost'));

      await expect(service.register(input, CONTEXT)).rejects.toThrow('connection lost');
    });

    it('refuses names that are only spaces', async () => {
      await expect(service.register({ ...input, organizationName: '   ' }, CONTEXT)).rejects.toMatchObject({ status: 400, response: { code: 'REGISTRATION_INVALID' } });
      await expect(service.register({ ...input, fullName: ' a ' }, CONTEXT)).rejects.toMatchObject({ status: 400 });
    });

    it('never logs the password or the email', async () => {
      repo.registerWorkspace.mockResolvedValue(created);

      await service.register(input, CONTEXT);

      expect(logs.join('\n')).not.toContain(GOOD_PASSWORD);
      expect(logs.join('\n')).not.toContain('ada@example.com');
    });
  });

  describe('overview', () => {
    it('lists members and open invitations of the caller\'s workspace, marking the caller', async () => {
      repo.listMembers.mockResolvedValue([MEMBER]);
      repo.listOpenInvites.mockResolvedValue([INVITE]);

      await expect(service.overview(ADMIN)).resolves.toEqual({ members: [MEMBER], invites: [INVITE], mailEnabled: true });

      expect(repo.listMembers).toHaveBeenCalledWith(ORG, 'admin-1');
      expect(repo.listOpenInvites).toHaveBeenCalledWith(ORG, expect.any(Date));
    });

    it('says mail is NOT available without a provider, or without a usable ADMIN_APP_URL', async () => {
      repo.listMembers.mockResolvedValue([]);
      repo.listOpenInvites.mockResolvedValue([]);
      mail.enabled = false;
      expect((await service.overview(ADMIN)).mailEnabled).toBe(false);
      mail.enabled = true;
      env.ADMIN_APP_URL = 'not a url';
      expect((await (await build()).overview(ADMIN)).mailEnabled).toBe(false);
    });
  });

  describe('createInvite', () => {
    const input = { email: ' New@Example.com ', fullName: ' New Person ', role: 'employee' as const };

    it('issues a one-time token, stores only its hash, keeps to the 72 hour default, and audits without the email', async () => {
      const before = Date.now();

      const issued = await service.createInvite(ACTOR, input);

      expect(issued.inviteToken).toMatch(/^[0-9a-f]{64}$/);
      const passed = repo.issueInvite.mock.calls[0]?.[0];
      expect(passed).toMatchObject({ organizationId: ORG, email: 'new@example.com', fullName: 'New Person', role: 'employee', staffUserId: null, createdBy: 'admin-1' });
      expect(passed?.tokenHash).toBe(hashSessionToken(issued.inviteToken));
      expect(passed?.tokenHash).not.toBe(issued.inviteToken);
      expect(JSON.stringify(passed)).not.toContain(issued.inviteToken);
      const hours = (new Date(issued.expiresAt).getTime() - before) / 3_600_000;
      expect(hours).toBeGreaterThan(71.9);
      expect(hours).toBeLessThan(72.1);
      expect(issued.invite).toEqual(INVITE);
      expect(recordBy).toHaveBeenCalledWith(
        { organizationId: ORG, staffUserId: 'admin-1', ip: '203.0.113.7', requestId: 'req-2' },
        'team.invite_created',
        { targetType: 'staff_invite', targetId: 'inv-1', metadata: { role: 'employee', canManageRefunds: false, emailed: false } },
      );
      expect(JSON.stringify(recordBy.mock.calls)).not.toContain('example.com');
    });

    it('uses INVITE_TTL_HOURS when set, and ignores nonsense', async () => {
      env.INVITE_TTL_HOURS = '24';
      service = await build();
      const issued = await service.createInvite(ACTOR, input);
      expect((new Date(issued.expiresAt).getTime() - Date.now()) / 3_600_000).toBeLessThan(24.1);

      env.INVITE_TTL_HOURS = 'banana';
      service = await build();
      const fallback = await service.createInvite(ACTOR, input);
      expect((new Date(fallback.expiresAt).getTime() - Date.now()) / 3_600_000).toBeGreaterThan(71.9);
    });

    it('refuses an email that already has an account anywhere (409 EMAIL_TAKEN)', async () => {
      repo.emailInUse.mockResolvedValue(true);

      await expect(service.createInvite(ACTOR, input)).rejects.toMatchObject({ status: 409, response: { code: 'EMAIL_TAKEN' } });

      expect(repo.issueInvite).not.toHaveBeenCalled();
    });

    it('refuses a blank name', async () => {
      await expect(service.createInvite(ACTOR, { ...input, fullName: '   ' })).rejects.toMatchObject({ status: 400 });
    });

    it('can invite another admin', async () => {
      await service.createInvite(ACTOR, { ...input, role: 'admin' });

      expect(repo.issueInvite.mock.calls[0]?.[0]).toMatchObject({ role: 'admin', canManageRefunds: false });
    });

    it('starts an employee with refund access when the admin ticks it, and audits that choice', async () => {
      await service.createInvite(ACTOR, { ...input, canManageRefunds: true });

      expect(repo.issueInvite.mock.calls[0]?.[0]).toMatchObject({ role: 'employee', canManageRefunds: true });
      expect(recordBy.mock.calls[0]?.[2]).toMatchObject({ metadata: { role: 'employee', canManageRefunds: true } });
    });

    it('never stores refund access on an admin invitation, whatever was sent', async () => {
      await service.createInvite(ACTOR, { ...input, role: 'admin', canManageRefunds: true });

      expect(repo.issueInvite.mock.calls[0]?.[0]).toMatchObject({ role: 'admin', canManageRefunds: false });
      expect(recordBy.mock.calls[0]?.[2]).toMatchObject({ metadata: { role: 'admin', canManageRefunds: false } });
    });
  });

  describe('emailing the link', () => {
    const input = { email: 'new@example.com', fullName: 'New Person', role: 'employee' as const, sendEmail: true };

    it('does not touch mail or the limiter unless asked, and leaves emailStatus out', async () => {
      const issued = await service.createInvite(ACTOR, { ...input, sendEmail: false });

      expect(issued.emailStatus).toBeUndefined();
      expect(mail.send).not.toHaveBeenCalled();
      expect(limiter.allowInviteEmail).not.toHaveBeenCalled();
    });

    it('sends the one-time link built from ADMIN_APP_URL to the invited address and reports "sent"', async () => {
      const issued = await service.createInvite(ACTOR, input);

      expect(issued.emailStatus).toBe('sent');
      expect(limiter.allowInviteEmail).toHaveBeenCalledWith(ORG, 'new@example.com');
      const message = mail.send.mock.calls[0]?.[0];
      expect(message?.to).toBe('new@example.com');
      expect(message?.requestId).toBe('req-2');
      expect(message?.text).toContain(`https://admin.example.com/invite/${issued.inviteToken}`);
      expect(message?.html).toContain(`https://admin.example.com/invite/${issued.inviteToken}`);
      expect(message?.text).toContain('Ada');
      expect(message?.text).toContain('Humphreys');
    });

    it('audits emailed true/false and never the token', async () => {
      const sent = await service.createInvite(ACTOR, input);
      mail.send.mockResolvedValue({ status: 'failed', errorClass: 'timeout' });
      const failed = await service.createInvite(ACTOR, input);

      expect(recordBy.mock.calls[0]?.[2]).toMatchObject({ metadata: { role: 'employee', emailed: true } });
      expect(recordBy.mock.calls[1]?.[2]).toMatchObject({ metadata: { role: 'employee', emailed: false } });
      expect(JSON.stringify(recordBy.mock.calls)).not.toContain(sent.inviteToken);
      expect(JSON.stringify(recordBy.mock.calls)).not.toContain(failed.inviteToken);
    });

    it('still creates the invite and returns the token when the provider fails ("failed")', async () => {
      mail.send.mockResolvedValue({ status: 'failed', errorClass: 'http_500' });

      const issued = await service.createInvite(ACTOR, input);

      expect(repo.issueInvite).toHaveBeenCalledTimes(1);
      expect(issued.inviteToken).toMatch(/^[0-9a-f]{64}$/);
      expect(issued.emailStatus).toBe('failed');
    });

    it('still creates the invite when the mailer throws (it should not) or the template step fails', async () => {
      mail.send.mockRejectedValue(new Error('boom'));

      const issued = await service.createInvite(ACTOR, input);

      expect(issued.emailStatus).toBe('failed');
      expect(issued.inviteToken).toMatch(/^[0-9a-f]{64}$/);
      expect(logs.join('\n')).not.toContain(issued.inviteToken);
    });

    it('reports "not_configured" without a provider, and without calling the limiter', async () => {
      mail.enabled = false;

      const issued = await service.createInvite(ACTOR, input);

      expect(issued.emailStatus).toBe('not_configured');
      expect(mail.send).not.toHaveBeenCalled();
      expect(limiter.allowInviteEmail).not.toHaveBeenCalled();
    });

    it('reports "failed" and sends nothing when the rate limit says no (fail closed), invite still created', async () => {
      limiter.allowInviteEmail.mockResolvedValue(false);

      const issued = await service.createInvite(ACTOR, input);

      expect(issued.emailStatus).toBe('failed');
      expect(mail.send).not.toHaveBeenCalled();
      expect(repo.issueInvite).toHaveBeenCalledTimes(1);
    });

    it('reports "failed" when the limiter itself throws', async () => {
      limiter.allowInviteEmail.mockRejectedValue(new Error('redis down'));

      expect((await service.createInvite(ACTOR, input)).emailStatus).toBe('failed');
    });

    it('emails an access reset as a reset (to the member, link to the same route)', async () => {
      repo.findMember.mockResolvedValue({ id: 'eve-1', role: 'employee', active: true, canManageRefunds: false, email: 'eve@example.com', fullName: 'Eve' });

      const issued = await service.resetAccess(ACTOR, 'eve-1', { sendEmail: true });

      expect(issued.emailStatus).toBe('sent');
      const message = mail.send.mock.calls[0]?.[0];
      expect(message?.to).toBe('eve@example.com');
      expect(message?.subject).toContain('Reset your access');
      expect(message?.text).toContain(`/invite/${issued.inviteToken}`);
      expect(recordBy.mock.calls[0]?.[2]).toMatchObject({ metadata: { inviteId: 'inv-1', emailed: true } });
    });

    it('keeps the reset (sessions ended, token returned) when the email fails', async () => {
      repo.findMember.mockResolvedValue({ id: 'eve-1', role: 'employee', active: true, canManageRefunds: false, email: 'eve@example.com', fullName: 'Eve' });
      mail.send.mockResolvedValue({ status: 'failed', errorClass: 'network' });

      const issued = await service.resetAccess(ACTOR, 'eve-1', { sendEmail: true });

      expect(identity.logoutAll).toHaveBeenCalledWith('eve-1');
      expect(issued.emailStatus).toBe('failed');
      expect(issued.inviteToken).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('revokeInvite', () => {
    it('revokes inside the caller\'s organization and audits it', async () => {
      repo.revokeInvite.mockResolvedValue({ email: 'new@example.com' });

      await service.revokeInvite(ACTOR, 'inv-1');

      expect(repo.revokeInvite).toHaveBeenCalledWith(ORG, 'inv-1');
      expect(recordBy.mock.calls[0]?.[1]).toBe('team.invite_revoked');
    });

    it('answers 404 for an invitation that is not open, and audits nothing', async () => {
      repo.revokeInvite.mockResolvedValue(null);

      await expect(service.revokeInvite(ACTOR, 'inv-1')).rejects.toMatchObject({ status: 404, response: { code: 'INVITE_NOT_FOUND' } });

      expect(recordBy).not.toHaveBeenCalled();
    });
  });

  describe('updateMember', () => {
    const before = { id: 'eve-1', role: 'employee' as const, active: true, canManageRefunds: false };

    beforeEach(() => {
      repo.listMembers.mockResolvedValue([{ ...MEMBER, role: 'admin' }]);
    });

    it('refuses an empty change', async () => {
      await expect(service.updateMember(ACTOR, 'eve-1', {})).rejects.toMatchObject({ status: 400, response: { code: 'NOTHING_TO_CHANGE' } });

      expect(repo.changeMember).not.toHaveBeenCalled();
    });

    it('promotes, audits the role change and answers with the updated member', async () => {
      repo.changeMember.mockResolvedValue({ kind: 'changed', before, after: { role: 'admin', active: true, canManageRefunds: false } });

      const member = await service.updateMember(ACTOR, 'eve-1', { role: 'admin' });

      expect(repo.changeMember).toHaveBeenCalledWith(ORG, 'admin-1', 'eve-1', { role: 'admin' });
      expect(recordBy.mock.calls.map((call) => call[1])).toEqual(['team.role_changed']);
      expect(member).toMatchObject({ id: 'eve-1', role: 'admin' });
    });

    it('audits a switch off as team.deactivated and a switch on as team.reactivated', async () => {
      repo.changeMember.mockResolvedValueOnce({ kind: 'changed', before, after: { role: 'employee', active: false, canManageRefunds: false } });
      await service.updateMember(ACTOR, 'eve-1', { active: false });
      repo.changeMember.mockResolvedValueOnce({ kind: 'changed', before: { ...before, active: false }, after: { role: 'employee', active: true, canManageRefunds: false } });
      await service.updateMember(ACTOR, 'eve-1', { active: true });

      expect(recordBy.mock.calls.map((call) => call[1])).toEqual(['team.deactivated', 'team.reactivated']);
    });

    it('grants refund access: audits WHO changed WHOSE access, with the new value and no secrets', async () => {
      repo.changeMember.mockResolvedValue({ kind: 'changed', before, after: { role: 'employee', active: true, canManageRefunds: true } });
      repo.listMembers.mockResolvedValue([{ ...MEMBER, role: 'employee', canManageRefunds: true }]);

      const member = await service.updateMember(ACTOR, 'eve-1', { canManageRefunds: true });

      expect(repo.changeMember).toHaveBeenCalledWith(ORG, 'admin-1', 'eve-1', { canManageRefunds: true });
      expect(recordBy.mock.calls).toHaveLength(1);
      expect(recordBy.mock.calls[0]?.[0]).toMatchObject({ organizationId: ORG, staffUserId: 'admin-1' });
      expect(recordBy.mock.calls[0]?.[1]).toBe('team.refund_access_granted');
      expect(recordBy.mock.calls[0]?.[2]).toEqual({
        targetType: 'staff_user',
        targetId: 'eve-1',
        metadata: { role: 'employee', canManageRefunds: true, memberName: 'Eve', changedByName: 'Ada', changedByRole: 'admin' },
      });
      expect(member.canManageRefunds).toBe(true);
    });

    it('removes refund access and audits it as team.refund_access_removed', async () => {
      repo.changeMember.mockResolvedValue({
        kind: 'changed',
        before: { ...before, canManageRefunds: true },
        after: { role: 'employee', active: true, canManageRefunds: false },
      });
      repo.listMembers.mockResolvedValue([{ ...MEMBER, role: 'employee', canManageRefunds: false }]);

      await service.updateMember(ACTOR, 'eve-1', { canManageRefunds: false });

      expect(recordBy.mock.calls.map((call) => call[1])).toEqual(['team.refund_access_removed']);
    });

    it.each([
      ['LAST_ADMIN', 409],
      ['CANNOT_DEACTIVATE_SELF', 409],
      ['STAFF_NOT_FOUND', 404],
      ['NOTHING_TO_CHANGE', 400],
      ['REFUND_ACCESS_NOT_FOR_ADMIN', 400],
      ['CANNOT_CHANGE_OWN_REFUND_ACCESS', 400],
    ] as const)('turns the refusal %s into HTTP %s and audits nothing', async (code, status) => {
      repo.changeMember.mockResolvedValue({ kind: 'refused', code });

      await expect(service.updateMember(ACTOR, 'eve-1', { role: 'employee' })).rejects.toMatchObject({ status, response: { code } });

      expect(recordBy).not.toHaveBeenCalled();
    });
  });

  describe('resetAccess', () => {
    it('ends the person\'s sessions, issues a reset link for THAT account and audits it', async () => {
      repo.findMember.mockResolvedValue({ id: 'eve-1', role: 'employee', active: true, canManageRefunds: false, email: 'eve@example.com', fullName: 'Eve' });

      const issued = await service.resetAccess(ACTOR, 'eve-1');

      expect(identity.logoutAll).toHaveBeenCalledWith('eve-1');
      expect(repo.issueInvite.mock.calls[0]?.[0]).toMatchObject({ staffUserId: 'eve-1', email: 'eve@example.com', role: 'employee', organizationId: ORG });
      expect(issued.inviteToken).toMatch(/^[0-9a-f]{64}$/);
      expect(recordBy.mock.calls[0]?.[1]).toBe('team.access_reset');
    });

    it('is not for your own account', async () => {
      await expect(service.resetAccess(ACTOR, 'admin-1')).rejects.toMatchObject({ status: 400, response: { code: 'USE_PASSWORD_CHANGE' } });

      expect(identity.logoutAll).not.toHaveBeenCalled();
    });

    it('answers 404 for someone outside the organization, ending nobody\'s sessions', async () => {
      repo.findMember.mockResolvedValue(null);

      await expect(service.resetAccess(ACTOR, 'stranger')).rejects.toMatchObject({ status: 404, response: { code: 'STAFF_NOT_FOUND' } });

      expect(identity.logoutAll).not.toHaveBeenCalled();
    });

    it('asks for a switched-off member to be switched on first', async () => {
      repo.findMember.mockResolvedValue({ id: 'eve-1', role: 'employee', active: false, canManageRefunds: false, email: 'eve@example.com', fullName: 'Eve' });

      await expect(service.resetAccess(ACTOR, 'eve-1')).rejects.toMatchObject({ status: 409, response: { code: 'MEMBER_INACTIVE' } });

      expect(identity.logoutAll).not.toHaveBeenCalled();
    });
  });

  describe('resetTwoFactor', () => {
    it('removes the member\'s two-factor in the admin\'s organization (which also ends their sessions) and audits it', async () => {
      identity.resetTwoFactor.mockResolvedValue({ hadTwoFactor: true });

      await expect(service.resetTwoFactor(ACTOR, 'eve-1')).resolves.toEqual({ hadTwoFactor: true });

      expect(identity.resetTwoFactor).toHaveBeenCalledWith(ORG, 'eve-1');
      expect(recordBy).toHaveBeenCalledWith(expect.objectContaining({ organizationId: ORG, staffUserId: 'admin-1' }), 'team.two_factor_reset', {
        targetType: 'staff_user',
        targetId: 'eve-1',
        metadata: { hadTwoFactor: true },
      });
    });

    it('is not for your own account', async () => {
      await expect(service.resetTwoFactor(ACTOR, 'admin-1')).rejects.toMatchObject({ status: 400, response: { code: 'USE_TWO_FACTOR_DISABLE' } });

      expect(identity.resetTwoFactor).not.toHaveBeenCalled();
      expect(recordBy).not.toHaveBeenCalled();
    });

    it('is a 404 for a member of another organization and writes no audit row (tenant isolation)', async () => {
      identity.resetTwoFactor.mockRejectedValue(Object.assign(new Error('not found'), { status: 404 }));

      await expect(service.resetTwoFactor(ACTOR, 'stranger')).rejects.toMatchObject({ status: 404 });

      expect(identity.resetTwoFactor).toHaveBeenCalledWith(ORG, 'stranger');
      expect(recordBy).not.toHaveBeenCalled();
    });
  });

  describe('preview', () => {
    it('shows only the workspace name, the email and the role of an open invitation', async () => {
      repo.findInviteByTokenHash.mockResolvedValue(inviteRecord());

      await expect(service.preview(TOKEN, CONTEXT)).resolves.toEqual({ organizationName: 'Humphreys', email: 'new@example.com', role: 'employee', isReset: false });

      expect(repo.findInviteByTokenHash).toHaveBeenCalledWith(hashSessionToken(TOKEN));
      expect(limiter.checkInvitePreview).toHaveBeenCalledWith('203.0.113.7');
    });

    it.each([
      ['unknown', null],
      ['used', inviteRecord({ acceptedAt: new Date() })],
      ['revoked', inviteRecord({ revokedAt: new Date() })],
      ['expired', inviteRecord({ expiresAt: new Date(Date.now() - 1000) })],
    ])('answers the SAME 404 INVITE_INVALID for a %s link', async (_label, record) => {
      repo.findInviteByTokenHash.mockResolvedValue(record);

      const error: unknown = await service.preview(TOKEN, CONTEXT).catch((caught: unknown) => caught);

      expect(error).toMatchObject({ status: 404, response: { code: 'INVITE_INVALID', message: 'This link is not valid any more. Ask your admin for a new one.' } });
    });

    it('is rate limited per IP', async () => {
      limiter.checkInvitePreview.mockRejectedValue(new RateLimitedException('INVITE_RATE_LIMITED', 'slow', 30));

      await expect(service.preview(TOKEN, CONTEXT)).rejects.toMatchObject({ status: 429 });

      expect(repo.findInviteByTokenHash).not.toHaveBeenCalled();
    });
  });

  describe('preview of a reset link', () => {
    it('says isReset for a link tied to an existing member', async () => {
      repo.findInviteByTokenHash.mockResolvedValue(inviteRecord({ staffUserId: 'eve-1' }));

      await expect(service.preview(TOKEN, CONTEXT)).resolves.toMatchObject({ isReset: true });
    });
  });

  describe('accept', () => {
    const input = { token: TOKEN, password: GOOD_PASSWORD, fullName: ' Chosen Name ' };
    const account: StaffAccount = { id: 'new-1', organizationId: ORG, fullName: 'Chosen Name', email: 'new@example.com', role: 'employee', organizationName: 'Humphreys', canManageRefunds: false };

    beforeEach(() => {
      repo.findInviteByTokenHash.mockResolvedValue(inviteRecord());
      repo.acceptInvite.mockResolvedValue({ account, inviteId: 'inv-1', reset: false });
    });

    it('checks the password against the INVITED email, hashes it, creates the account and signs the person in', async () => {
      const session = await service.accept(input, CONTEXT);

      expect(limiter.checkInviteAccept).toHaveBeenCalledWith('203.0.113.7');
      expect(identity.assertPasswordAcceptable).toHaveBeenCalledWith(GOOD_PASSWORD, 'new@example.com');
      const passed = repo.acceptInvite.mock.calls[0]?.[0];
      expect(passed).toMatchObject({ tokenHash: hashSessionToken(TOKEN), fullName: 'Chosen Name' });
      expect(passed?.passwordHash).toMatch(/^scrypt[$]\d+[$]\d+[$]\d+[$][0-9a-f]+[$][0-9a-f]+$/);
      expect(JSON.stringify(passed)).not.toContain(GOOD_PASSWORD);
      expect(session.staff).toEqual(account);
      expect(recordBy).toHaveBeenCalledWith(
        { organizationId: ORG, staffUserId: 'new-1', ip: '203.0.113.7', requestId: 'req-1' },
        'team.invite_accepted',
        { targetType: 'staff_invite', targetId: 'inv-1' },
      );
    });

    it('keeps the invited name when none (or a blank one) is typed', async () => {
      await service.accept({ token: TOKEN, password: GOOD_PASSWORD }, CONTEXT);
      await service.accept({ token: TOKEN, password: GOOD_PASSWORD, fullName: ' ' }, CONTEXT);

      expect(repo.acceptInvite.mock.calls[0]?.[0].fullName).toBeNull();
      expect(repo.acceptInvite.mock.calls[1]?.[0].fullName).toBeNull();
    });

    it('never renames the member on an access-reset link, even if a name is sent', async () => {
      repo.findInviteByTokenHash.mockResolvedValue(inviteRecord({ staffUserId: 'eve-1' }));
      repo.acceptInvite.mockResolvedValue({ account, inviteId: 'inv-1', reset: true });

      await service.accept(input, CONTEXT);

      expect(repo.acceptInvite.mock.calls[0]?.[0].fullName).toBeNull();
    });

    it('refuses a weak password and uses up nothing', async () => {
      identity.assertPasswordAcceptable.mockImplementation(() => {
        throw new PasswordTooWeakException(['Add a number']);
      });

      await expect(service.accept(input, CONTEXT)).rejects.toMatchObject({ response: { code: 'PASSWORD_TOO_WEAK' } });

      expect(repo.acceptInvite).not.toHaveBeenCalled();
    });

    it.each([
      ['unknown', null],
      ['used', inviteRecord({ acceptedAt: new Date() })],
      ['expired', inviteRecord({ expiresAt: new Date(Date.now() - 1000) })],
    ])('answers 404 INVITE_INVALID for a %s link, before any password work', async (_label, record) => {
      repo.findInviteByTokenHash.mockResolvedValue(record);

      await expect(service.accept(input, CONTEXT)).rejects.toMatchObject({ status: 404, response: { code: 'INVITE_INVALID' } });

      expect(identity.assertPasswordAcceptable).not.toHaveBeenCalled();
      expect(repo.acceptInvite).not.toHaveBeenCalled();
    });

    it('answers 404 when the link was used by someone else between the check and the lock (the race)', async () => {
      repo.acceptInvite.mockResolvedValue(null);

      await expect(service.accept(input, CONTEXT)).rejects.toMatchObject({ status: 404, response: { code: 'INVITE_INVALID' } });

      expect(identity.startSession).not.toHaveBeenCalled();
    });

    it('answers 409 EMAIL_TAKEN when the invited email got an account in the meantime', async () => {
      repo.emailInUse.mockResolvedValue(true);

      await expect(service.accept(input, CONTEXT)).rejects.toMatchObject({ status: 409, response: { code: 'EMAIL_TAKEN' } });

      expect(repo.acceptInvite).not.toHaveBeenCalled();
    });

    it('does not look for an existing account when the link is an access reset for one', async () => {
      repo.findInviteByTokenHash.mockResolvedValue(inviteRecord({ staffUserId: 'eve-1' }));
      repo.acceptInvite.mockResolvedValue({ account, inviteId: 'inv-1', reset: true });

      await service.accept(input, CONTEXT);

      expect(repo.emailInUse).not.toHaveBeenCalled();
      expect(recordBy.mock.calls[0]?.[1]).toBe('auth.access_reset_completed');
    });

    it('is rate limited per IP before anything else', async () => {
      limiter.checkInviteAccept.mockRejectedValue(new RateLimitedException('INVITE_RATE_LIMITED', 'slow', 30));

      await expect(service.accept(input, CONTEXT)).rejects.toMatchObject({ status: 429 });

      expect(repo.findInviteByTokenHash).not.toHaveBeenCalled();
    });
  });
});
