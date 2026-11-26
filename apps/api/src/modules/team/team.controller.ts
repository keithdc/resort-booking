/**
 * @file apps/api/src/modules/team/team.controller.ts
 * @feature team
 * @dependencies TeamService, StaffGuard, TenantGuard, RoleGuard
 * Admin-only: who is on the team, invitations, roles, switching people off, access resets.
 */

import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { ApiOkBody, TwoFactorResetResult } from '@resort-booking/shared-types';
import { clientIp } from '../../shared/http/client-ip';
import type { RequestWithId } from '../../shared/http/request-id';
import { RoleGuard } from '../../shared/roles/role.guard';
import { RequireRole } from '../../shared/roles/roles.decorator';
import type { StaffAccount } from '../../shared/roles/staff-role';
import { CurrentStaff } from '../../shared/tenancy/current-staff.decorator';
import { TenantGuard } from '../../shared/tenancy/tenant.guard';
import { TenantExempt, TenantScoped } from '../../shared/tenancy/tenant-scope.decorator';
import { StaffGuard } from '../identity/staff.guard';
import { CreateInviteDto } from './dto/create-invite.dto';
import { ResetAccessDto } from './dto/reset-access.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { TeamService, type TeamActor } from './team.service';
import type { InviteIssued, TeamMember, TeamOverview } from './team.types';

function actorOf(staff: StaffAccount, request: RequestWithId): TeamActor {
  return { staff, ip: clientIp(request), requestId: request.requestId };
}

@Controller('staff')
@UseGuards(StaffGuard, TenantGuard, RoleGuard)
@RequireRole('admin')
export class TeamController {
  public constructor(private readonly team: TeamService) {}

  /**
   * Members and open invitations of the caller's workspace.
   */
  @Get('team')
  @TenantExempt('the list is filtered by the caller organization in SQL')
  public async overview(@CurrentStaff() staff: StaffAccount): Promise<ApiOkBody<TeamOverview>> {
    return { status: 'ok', data: await this.team.overview(staff) };
  }

  /**
   * Invites a person. The one-time token is in the answer once.
   */
  @Post('team/invites')
  @TenantExempt('the invitation is created in the caller organization')
  public async invite(
    @CurrentStaff() staff: StaffAccount,
    @Body() body: CreateInviteDto,
    @Req() request: RequestWithId,
  ): Promise<ApiOkBody<InviteIssued>> {
    return { status: 'ok', data: await this.team.createInvite(actorOf(staff, request), body) };
  }

  @Delete('team/invites/:inviteId')
  @TenantScoped({ resource: 'staffInvite', from: 'param', key: 'inviteId' })
  public async revokeInvite(
    @CurrentStaff() staff: StaffAccount,
    @Param('inviteId') inviteId: string,
    @Req() request: RequestWithId,
  ): Promise<ApiOkBody<null>> {
    await this.team.revokeInvite(actorOf(staff, request), inviteId);
    return { status: 'ok', data: null };
  }

  /**
   * Changes a role, or switches a person on or off.
   */
  @Patch('team/:staffId')
  @TenantScoped({ resource: 'staffUser', from: 'param', key: 'staffId' })
  public async update(
    @CurrentStaff() staff: StaffAccount,
    @Param('staffId') staffId: string,
    @Body() body: UpdateMemberDto,
    @Req() request: RequestWithId,
  ): Promise<ApiOkBody<TeamMember>> {
    return { status: 'ok', data: await this.team.updateMember(actorOf(staff, request), staffId, body) };
  }

  /**
   * Ends the person's sessions and gives the admin a one-time link to hand over (and emails it when asked).
   */
  @Post('team/:staffId/reset-access')
  @TenantScoped({ resource: 'staffUser', from: 'param', key: 'staffId' })
  public async resetAccess(
    @CurrentStaff() staff: StaffAccount,
    @Param('staffId') staffId: string,
    @Body() body: ResetAccessDto,
    @Req() request: RequestWithId,
  ): Promise<ApiOkBody<InviteIssued>> {
    return { status: 'ok', data: await this.team.resetAccess(actorOf(staff, request), staffId, body) };
  }

  /**
   * Lost phone: removes the member's two-factor and ends their sessions.
   */
  @Post('team/:staffId/reset-two-factor')
  @TenantScoped({ resource: 'staffUser', from: 'param', key: 'staffId' })
  public async resetTwoFactor(
    @CurrentStaff() staff: StaffAccount,
    @Param('staffId') staffId: string,
    @Req() request: RequestWithId,
  ): Promise<ApiOkBody<TwoFactorResetResult>> {
    return { status: 'ok', data: await this.team.resetTwoFactor(actorOf(staff, request), staffId) };
  }
}
