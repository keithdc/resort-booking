/**
 * @file apps/api/src/modules/team/team.controller.spec.ts
 * @feature team
 */

import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { RequestWithId } from '../../shared/http/request-id';
import { RoleGuard } from '../../shared/roles/role.guard';
import { ALLOWED_ROLES } from '../../shared/roles/roles.decorator';
import type { StaffAccount } from '../../shared/roles/staff-role';
import { TenantGuard } from '../../shared/tenancy/tenant.guard';
import { TENANT_REFS, type TenantRef } from '../../shared/tenancy/tenant-scope.decorator';
import { StaffGuard } from '../identity/staff.guard';
import { TeamController } from './team.controller';
import { TeamService, type TeamActor } from './team.service';
import type { InviteIssued, TeamMember, TeamOverview } from './team.types';

const STAFF: StaffAccount = { id: 's1', organizationId: 'o1', fullName: 'Ada', email: 'ada@example.com', role: 'admin', organizationName: 'Humphreys' };
const ISSUED: InviteIssued = {
  invite: { id: 'i1', email: 'new@example.com', fullName: 'New', role: 'employee', expiresAt: 'x', createdAt: 'y', createdByName: 'Ada', expired: false, isReset: false },
  inviteToken: 'c'.repeat(64),
  expiresAt: 'x',
};

function request(): RequestWithId {
  return Object.assign(Object.create(null) as RequestWithId, { ip: '203.0.113.7', requestId: 'req-2' });
}

const ACTOR: TeamActor = { staff: STAFF, ip: '203.0.113.7', requestId: 'req-2' };

describe('TeamController', () => {
  const overview = jest.fn<Promise<TeamOverview>, [StaffAccount]>();
  const createInvite = jest.fn<Promise<InviteIssued>, [TeamActor, unknown]>();
  const revokeInvite = jest.fn<Promise<void>, [TeamActor, string]>();
  const updateMember = jest.fn<Promise<TeamMember>, [TeamActor, string, unknown]>();
  const resetAccess = jest.fn<Promise<InviteIssued>, [TeamActor, string]>();
  const resetTwoFactor = jest.fn<Promise<{ hadTwoFactor: boolean }>, [TeamActor, string]>();
  let controller: TeamController;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [TeamController],
      providers: [{ provide: TeamService, useValue: { overview, createInvite, revokeInvite, updateMember, resetAccess, resetTwoFactor } }],
    })
      .overrideGuard(StaffGuard)
      .useValue({ canActivate: (): boolean => true })
      .overrideGuard(TenantGuard)
      .useValue({ canActivate: (): boolean => true })
      .overrideGuard(RoleGuard)
      .useValue({ canActivate: (): boolean => true })
      .compile();
    controller = moduleRef.get(TeamController);
  });

  it('lists the team of the caller\'s workspace', async () => {
    overview.mockResolvedValue({ members: [], invites: [], mailEnabled: false });

    await expect(controller.overview(STAFF)).resolves.toEqual({ status: 'ok', data: { members: [], invites: [], mailEnabled: false } });

    expect(overview).toHaveBeenCalledWith(STAFF);
  });

  it('invites with the caller, their IP and the request id', async () => {
    createInvite.mockResolvedValue(ISSUED);
    const body = { email: 'new@example.com', fullName: 'New', role: 'employee' as const };

    await expect(controller.invite(STAFF, body, request())).resolves.toEqual({ status: 'ok', data: ISSUED });

    expect(createInvite).toHaveBeenCalledWith(ACTOR, body);
  });

  it('revokes an invitation and answers null data', async () => {
    revokeInvite.mockResolvedValue(undefined);

    await expect(controller.revokeInvite(STAFF, 'i1', request())).resolves.toEqual({ status: 'ok', data: null });

    expect(revokeInvite).toHaveBeenCalledWith(ACTOR, 'i1');
  });

  it('updates a member and resets access through the service', async () => {
    const member = { id: 'm1' } as TeamMember;
    updateMember.mockResolvedValue(member);
    resetAccess.mockResolvedValue(ISSUED);

    await expect(controller.update(STAFF, 'm1', { role: 'admin' }, request())).resolves.toEqual({ status: 'ok', data: member });
    await expect(controller.resetAccess(STAFF, 'm1', { sendEmail: true }, request())).resolves.toEqual({ status: 'ok', data: ISSUED });

    expect(updateMember).toHaveBeenCalledWith(ACTOR, 'm1', { role: 'admin' });
    expect(resetAccess).toHaveBeenCalledWith(ACTOR, 'm1', { sendEmail: true });
  });

  it('resets a member\'s two-factor through the service, as the signed-in admin', async () => {
    resetTwoFactor.mockResolvedValue({ hadTwoFactor: true });

    await expect(controller.resetTwoFactor(STAFF, 'm1', request())).resolves.toEqual({ status: 'ok', data: { hadTwoFactor: true } });

    expect(resetTwoFactor).toHaveBeenCalledWith(ACTOR, 'm1');
  });

  it('is admin only, behind the staff, tenant and role guards in that order', () => {
    expect(Reflect.getMetadata('__guards__', TeamController)).toEqual([StaffGuard, TenantGuard, RoleGuard]);
    expect(Reflect.getMetadata(ALLOWED_ROLES, TeamController)).toEqual(['admin']);
  });

  it('scopes the routes that name a member or an invitation to the caller\'s organization', () => {
    const refs = (handler: object): TenantRef[] => Reflect.getMetadata(TENANT_REFS, handler) as TenantRef[];

    expect(refs(TeamController.prototype.revokeInvite)).toEqual([{ resource: 'staffInvite', from: 'param', key: 'inviteId' }]);
    expect(refs(TeamController.prototype.update)).toEqual([{ resource: 'staffUser', from: 'param', key: 'staffId' }]);
    expect(refs(TeamController.prototype.resetAccess)).toEqual([{ resource: 'staffUser', from: 'param', key: 'staffId' }]);
    expect(refs(TeamController.prototype.resetTwoFactor)).toEqual([{ resource: 'staffUser', from: 'param', key: 'staffId' }]);
  });
});
