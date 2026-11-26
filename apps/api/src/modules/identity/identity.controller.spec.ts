/**
 * @file apps/api/src/modules/identity/identity.controller.spec.ts
 * @feature identity
 */

import { Test } from '@nestjs/testing';
import type { TwoFactorChallenge } from '@resort-booking/shared-types';
import type { StaffSessionResult } from '../../shared/roles/staff-role';
import type { RequestWithId } from '../../shared/http/request-id';
import type { AuditChangeCarrier } from '../../shared/audit/audit.types';
import type { UpdateOrganizationDto } from './dto/update-organization.dto';
import { AUDITED } from '../../shared/audit/audited.decorator';
import { PublicRateLimitGuard } from '../../shared/http/public-rate-limit';
import { RoleGuard } from '../../shared/roles/role.guard';
import { IdentityController } from './identity.controller';
import { IdentityService, type LoginContext } from './identity.service';
import { StaffGuard, type StaffRequest } from './staff.guard';

const RESULT: StaffSessionResult = {
  token: 't'.repeat(64),
  expiresAt: '2027-01-01T00:00:00.000Z',
  staff: { id: 's1', organizationId: 'o1', fullName: 'Owner', email: 'owner@example.com', role: 'admin', organizationName: 'Humphreys', canManageRefunds: true },
};

/** A request header reader that answers the same browser every time. */
const agent = (name: string): string | undefined => (name.toLowerCase() === 'user-agent' ? 'Mozilla/5.0 Test' : undefined);

describe('IdentityController', () => {
  const login = jest.fn<Promise<StaffSessionResult | TwoFactorChallenge>, [string, string, LoginContext]>();
  const completeTwoFactorLogin = jest.fn<Promise<StaffSessionResult>, [string, string, LoginContext]>();
  const logoutAll = jest.fn<Promise<number>, [string]>();
  const listSessions = jest.fn<Promise<unknown[]>, [string, string]>();
  const revokeSession = jest.fn<Promise<void>, [string, string]>();
  const revokeOtherSessions = jest.fn<Promise<number>, [string, string]>();
  const changePassword = jest.fn<Promise<void>, [string, { currentPassword: string; newPassword: string }, string | undefined]>();
  const updateSettings = jest.fn();
  let controller: IdentityController;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [IdentityController],
      providers: [{ provide: IdentityService, useValue: { login, completeTwoFactorLogin, logoutAll, changePassword, updateSettings, listSessions, revokeSession, revokeOtherSessions } }],
    })
      .overrideGuard(StaffGuard)
      .useValue({ canActivate: (): boolean => true })
      .overrideGuard(PublicRateLimitGuard)
      .useValue({ canActivate: (): boolean => true })
      .compile();
    controller = moduleRef.get(IdentityController);
  });

  it('passes the caller IP and request id to the sign-in, for the limiter and the auth log', async () => {
    login.mockResolvedValue(RESULT);
    const request: RequestWithId = Object.assign(Object.create(null) as RequestWithId, { ip: '203.0.113.7', requestId: 'req-test-0001', header: agent });

    await expect(controller.login({ email: 'owner@example.com', password: 'x'.repeat(12) }, request)).resolves.toEqual({ status: 'ok', data: RESULT });

    expect(login).toHaveBeenCalledWith('owner@example.com', 'x'.repeat(12), {
      ip: '203.0.113.7',
      requestId: 'req-test-0001',
      userAgent: 'Mozilla/5.0 Test',
    });
  });

  it('answers the challenge as is when the account has two-factor, and the session shape otherwise', async () => {
    const challenge: TwoFactorChallenge = { twoFactorRequired: true, challengeToken: 'c'.repeat(64), expiresAt: '2027-01-01T00:05:00.000Z' };
    login.mockResolvedValueOnce(challenge);
    const request: RequestWithId = Object.assign(Object.create(null) as RequestWithId, { ip: '203.0.113.7', requestId: 'r', header: agent });

    await expect(controller.login({ email: 'owner@example.com', password: 'x'.repeat(12) }, request)).resolves.toEqual({ status: 'ok', data: challenge });
  });

  it('finishes the sign-in with the challenge, the code, the IP and the request id', async () => {
    completeTwoFactorLogin.mockResolvedValue(RESULT);
    const request: RequestWithId = Object.assign(Object.create(null) as RequestWithId, { ip: '203.0.113.7', requestId: 'req-9', header: agent });

    await expect(controller.loginTwoFactor({ challengeToken: 'c'.repeat(64), code: '123456' }, request)).resolves.toEqual({ status: 'ok', data: RESULT });

    expect(completeTwoFactorLogin).toHaveBeenCalledWith('c'.repeat(64), '123456', {
      ip: '203.0.113.7',
      requestId: 'req-9',
      userAgent: 'Mozilla/5.0 Test',
    });
  });

  it('lists the person\'s own sessions, telling the service which token is the current one', async () => {
    listSessions.mockResolvedValue([{ id: 'a', current: true }]);

    await expect(controller.listSessions(RESULT.staff, 'tok')).resolves.toEqual({ status: 'ok', data: { sessions: [{ id: 'a', current: true }] } });

    expect(listSessions).toHaveBeenCalledWith('s1', 'tok');
  });

  it('revokes one session for the signed-in person only (the id of the person comes from the session)', async () => {
    revokeSession.mockResolvedValue(undefined);

    await expect(controller.revokeSession(RESULT.staff, 'sess-1')).resolves.toEqual({ status: 'ok', data: { revoked: true } });

    expect(revokeSession).toHaveBeenCalledWith('s1', 'sess-1');
  });

  it('signs out the other devices and says how many ended', async () => {
    revokeOtherSessions.mockResolvedValue(3);

    await expect(controller.revokeOthers(RESULT.staff, 'tok')).resolves.toEqual({ status: 'ok', data: { sessionsEnded: 3 } });

    expect(revokeOtherSessions).toHaveBeenCalledWith('s1', 'tok');
  });

  it('guards the device routes with the staff and role guards and audits the two that change something', () => {
    for (const handler of [IdentityController.prototype.listSessions, IdentityController.prototype.revokeSession, IdentityController.prototype.revokeOthers]) {
      expect(Reflect.getMetadata('__guards__', handler)).toEqual([StaffGuard, RoleGuard]);
    }
    expect(Reflect.getMetadata(AUDITED, IdentityController.prototype.revokeSession)).toMatchObject({ action: 'auth.session_revoked', targetParam: 'id' });
    expect(Reflect.getMetadata(AUDITED, IdentityController.prototype.revokeOthers)).toMatchObject({ action: 'auth.sessions_revoked_others' });
  });

  it('leaves the second login step public (the challenge token is the credential)', () => {
    expect(Reflect.getMetadata('__guards__', IdentityController.prototype.loginTwoFactor)).toBeUndefined();
    expect(Reflect.getMetadata('__guards__', IdentityController.prototype.login)).toBeUndefined();
  });

  it('GET /staff/me returns the account the guard loaded, including whether it has refund access', () => {
    const employee = { ...RESULT.staff, role: 'employee' as const, canManageRefunds: true };

    expect(controller.me({ staff: employee } as StaffRequest)).toEqual({ status: 'ok', data: employee });
    expect(controller.me({ staff: { ...employee, canManageRefunds: false } } as StaffRequest)).toMatchObject({ data: { canManageRefunds: false } });
  });

  it('signs the person out everywhere and says how many sessions ended', async () => {
    logoutAll.mockResolvedValue(3);
    const request: StaffRequest = Object.assign(Object.create(null) as StaffRequest, { staff: RESULT.staff });

    await expect(controller.logoutAll(request)).resolves.toEqual({ status: 'ok', data: { sessionsEnded: 3 } });

    expect(logoutAll).toHaveBeenCalledWith('s1');
  });

  it('refuses sign-out-everywhere without a person on the request', async () => {
    const request: StaffRequest = Object.create(null) as StaffRequest;

    await expect(controller.logoutAll(request)).rejects.toMatchObject({ status: 401 });
    expect(logoutAll).not.toHaveBeenCalled();
  });

  it('hands the current token to the password change, so that session stays signed in', async () => {
    changePassword.mockResolvedValue(undefined);
    const request: StaffRequest = Object.assign(Object.create(null) as StaffRequest, { staff: RESULT.staff });

    await controller.changePassword(request, { currentPassword: 'old-pass-1', newPassword: 'new-pass-1234' }, 'my-token');

    expect(changePassword).toHaveBeenCalledWith('s1', { currentPassword: 'old-pass-1', newPassword: 'new-pass-1234' }, 'my-token');
  });

  it('hands the audit row the names of what changed (not the body) and answers only the saved settings', async () => {
    const settings = { id: 'o1', name: 'Humphreys' };
    const audit = { fields: ['iban'], bankDetailsChanged: true, notice: 'bank_details_changed' };
    updateSettings.mockResolvedValue({ settings, audit });
    const request: AuditChangeCarrier = {};
    const body = { name: 'Humphreys', iban: 'FR76 0000' } as UpdateOrganizationDto;

    const answer = await controller.patchOrganization(RESULT.staff, body, request);

    expect(updateSettings).toHaveBeenCalledWith(body, 'o1');
    expect(request.auditChanges).toEqual(audit);
    expect(answer).toEqual({ status: 'ok', data: settings });
  });
});
