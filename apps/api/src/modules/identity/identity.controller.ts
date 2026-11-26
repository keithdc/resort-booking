/**
 * @file apps/api/src/modules/identity/identity.controller.ts
 * @feature identity
 * @dependencies IdentityService
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type {
  ApiOkBody,
  Organization,
  OrganizationSettings,
  StaffSessionList,
  StaffSessionsEnded,
  TwoFactorChallenge,
} from '@resort-booking/shared-types';
import type { AuditChangeCarrier, AuditMetadata } from '../../shared/audit/audit.types';
import { Audited } from '../../shared/audit/audited.decorator';
import { clientIp } from '../../shared/http/client-ip';
import { RoleGuard } from '../../shared/roles/role.guard';
import { AllowRoles, RequireRole } from '../../shared/roles/roles.decorator';
import type { StaffAccount, StaffSessionResult } from '../../shared/roles/staff-role';
import type { RequestWithId } from '../../shared/http/request-id';
import { ChangeStaffPasswordDto } from './dto/change-staff-password.dto';
import { StaffLoginDto } from './dto/staff-login.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { TwoFactorLoginDto } from './dto/two-factor.dto';
import { UpdateStaffProfileDto } from './dto/update-staff-profile.dto';
import { IdentityService } from './identity.service';
import { StaffGuard, type StaffRequest } from './staff.guard';
import { PublicRateLimit } from '../../shared/http/public-rate-limit';
import { CurrentStaff } from '../../shared/tenancy/current-staff.decorator';
import { TenantExempt } from '../../shared/tenancy/tenant-scope.decorator';

/** The count out of a revoke-others answer, for the audit row (0 when the answer has another shape). */
function sessionsEndedOf(result: unknown): number {
  const data = typeof result === 'object' && result !== null && 'data' in result ? result.data : null;
  return typeof data === 'object' && data !== null && 'sessionsEnded' in data && typeof data.sessionsEnded === 'number' ? data.sessionsEnded : 0;
}

@Controller()
export class IdentityController {
  public constructor(private readonly identity: IdentityService) {}

  /**
   * Public stub: which operator this deployment belongs to.
   */
  @Get('identity/organization')
  @PublicRateLimit('read')
  public async getOrganization(): Promise<ApiOkBody<Organization>> {
    const organization = await this.identity.getOrganization();
    if (organization === null) {
      throw new NotFoundException({ message: 'Organization not found', code: 'ORG_NOT_FOUND' });
    }
    return { status: 'ok', data: organization };
  }

  /**
   * Email + password for the admin app. Answers a session, or (only when the account has two-factor on) a
   * `{ twoFactorRequired: true, challengeToken }` challenge to finish at /staff/login/two-factor.
   */
  @Post('staff/login')
  public async login(
    @Body() body: StaffLoginDto,
    @Req() request: RequestWithId,
  ): Promise<ApiOkBody<StaffSessionResult | TwoFactorChallenge>> {
    const context = { ip: clientIp(request), requestId: request.requestId, userAgent: request.header('user-agent') };
    return { status: 'ok', data: await this.identity.login(body.email, body.password, context) };
  }

  /**
   * Second login step: the challenge token plus an authenticator or recovery code. Answers the normal session.
   */
  @Post('staff/login/two-factor')
  public async loginTwoFactor(@Body() body: TwoFactorLoginDto, @Req() request: RequestWithId): Promise<ApiOkBody<StaffSessionResult>> {
    const context = { ip: clientIp(request), requestId: request.requestId, userAgent: request.header('user-agent') };
    return { status: 'ok', data: await this.identity.completeTwoFactorLogin(body.challengeToken, body.code, context) };
  }

  /**
   * Drops the current session token.
   */
  @Post('staff/logout')
  public async logout(
    @Headers('x-staff-token') token: string | undefined,
  ): Promise<ApiOkBody<{ loggedOut: true }>> {
    if (token !== undefined && token !== '') {
      await this.identity.logout(token);
    }
    return { status: 'ok', data: { loggedOut: true } };
  }

  /**
   * "Sign out everywhere": drops every session of the signed-in person, this one included.
   */
  @Post('staff/logout-all')
  @UseGuards(StaffGuard, RoleGuard)
  @AllowRoles('admin', 'employee')
  @Audited({ action: 'auth.logout_all', targetType: 'staff_user' })
  @TenantExempt('acts only on the signed-in staff member (the id comes from the session, never from the request)')
  public async logoutAll(@Req() request: StaffRequest): Promise<ApiOkBody<{ sessionsEnded: number }>> {
    if (request.staff === undefined) {
      throw new UnauthorizedException({ message: 'Staff authentication required', code: 'STAFF_UNAUTHORIZED' });
    }
    return { status: 'ok', data: { sessionsEnded: await this.identity.logoutAll(request.staff.id) } };
  }

  /**
   * The signed-in person's own live sessions ("signed-in devices"): a coarse device label and times, never the token,
   * an IP or the raw User-Agent. The session making the request is flagged `current`.
   */
  @Get('staff/me/sessions')
  @UseGuards(StaffGuard, RoleGuard)
  @AllowRoles('admin', 'employee')
  @TenantExempt('acts only on the signed-in staff member (the id comes from the session, never from the request)')
  public async listSessions(
    @CurrentStaff() staff: StaffAccount,
    @Headers('x-staff-token') token: string | undefined,
  ): Promise<ApiOkBody<StaffSessionList>> {
    return { status: 'ok', data: { sessions: await this.identity.listSessions(staff.id, token ?? '') } };
  }

  /**
   * "Sign out everywhere else": ends every session of the signed-in person except this one.
   */
  @Post('staff/me/sessions/revoke-others')
  @UseGuards(StaffGuard, RoleGuard)
  @AllowRoles('admin', 'employee')
  @Audited({
    action: 'auth.sessions_revoked_others',
    targetType: 'staff_user',
    details: ({ result }): AuditMetadata => ({ sessionsEnded: sessionsEndedOf(result) }),
  })
  @TenantExempt('acts only on the signed-in staff member (the id comes from the session, never from the request)')
  public async revokeOthers(
    @CurrentStaff() staff: StaffAccount,
    @Headers('x-staff-token') token: string | undefined,
  ): Promise<ApiOkBody<StaffSessionsEnded>> {
    return { status: 'ok', data: { sessionsEnded: await this.identity.revokeOtherSessions(staff.id, token ?? '') } };
  }

  /**
   * Ends one of the signed-in person's OWN sessions. The owner is part of the SQL, so another person's session is 404.
   */
  @Delete('staff/me/sessions/:id')
  @UseGuards(StaffGuard, RoleGuard)
  @AllowRoles('admin', 'employee')
  @Audited({ action: 'auth.session_revoked', targetType: 'staff_session', targetParam: 'id' })
  @TenantExempt('the session must belong to the signed-in staff member: the owner is part of the DELETE statement')
  public async revokeSession(@CurrentStaff() staff: StaffAccount, @Param('id') id: string): Promise<ApiOkBody<{ revoked: true }>> {
    await this.identity.revokeSession(staff.id, id);
    return { status: 'ok', data: { revoked: true } };
  }

  /**
   * Signed-in owner profile.
   */
  @Get('staff/me')
  @UseGuards(StaffGuard, RoleGuard)
  @AllowRoles('admin', 'employee')
  @TenantExempt('acts only on the signed-in staff member (the id comes from the session, never from the request)')
  public me(@Req() request: StaffRequest): ApiOkBody<StaffAccount> {
    if (request.staff === undefined) {
      throw new UnauthorizedException({ message: 'Staff authentication required', code: 'STAFF_UNAUTHORIZED' });
    }
    return { status: 'ok', data: request.staff };
  }

  /**
   * Name and login email for the owner account. Changing the email signs the person out of every other device.
   */
  @Patch('staff/me')
  @UseGuards(StaffGuard, RoleGuard)
  @AllowRoles('admin', 'employee')
  @Audited({ action: 'auth.profile_changed', targetType: 'staff_user', fieldNames: true })
  @TenantExempt('acts only on the signed-in staff member (the id comes from the session, never from the request)')
  public async patchMe(
    @Req() request: StaffRequest,
    @Body() body: UpdateStaffProfileDto,
    @Headers('x-staff-token') token: string | undefined,
  ): Promise<ApiOkBody<StaffAccount>> {
    if (request.staff === undefined) {
      throw new UnauthorizedException({ message: 'Staff authentication required', code: 'STAFF_UNAUTHORIZED' });
    }
    const session = { currentEmail: request.staff.email, token: token ?? '' };
    return { status: 'ok', data: await this.identity.updateProfile(request.staff.id, body, session) };
  }

  /**
   * Changes the owner password.
   */
  @Post('staff/me/password')
  @UseGuards(StaffGuard, RoleGuard)
  @AllowRoles('admin', 'employee')
  @Audited({ action: 'auth.password_changed', targetType: 'staff_user' })
  @TenantExempt('acts only on the signed-in staff member (the id comes from the session, never from the request)')
  public async changePassword(
    @Req() request: StaffRequest,
    @Body() body: ChangeStaffPasswordDto,
    @Headers('x-staff-token') token: string | undefined,
  ): Promise<ApiOkBody<{ changed: true }>> {
    if (request.staff === undefined) {
      throw new UnauthorizedException({ message: 'Staff authentication required', code: 'STAFF_UNAUTHORIZED' });
    }
    await this.identity.changePassword(request.staff.id, body, token);
    return { status: 'ok', data: { changed: true } };
  }

  /**
   * Operator bank + legal details (not property refund ladders).
   */
  @Get('staff/organization')
  @UseGuards(StaffGuard, RoleGuard)
  @RequireRole('admin')
  @TenantExempt('reads and writes the caller organization, taken from the session')
  public async getStaffOrganization(@CurrentStaff() staff: StaffAccount): Promise<ApiOkBody<OrganizationSettings>> {
    return { status: 'ok', data: await this.identity.getSettings(staff.organizationId) };
  }

  /**
   * Saves org-wide settings.
   */
  @Patch('staff/organization')
  @UseGuards(StaffGuard, RoleGuard)
  @RequireRole('admin')
  @Audited({ action: 'org.settings_changed', targetType: 'organization', changeSet: true })
  @TenantExempt('reads and writes the caller organization, taken from the session')
  public async patchOrganization(
    @CurrentStaff() staff: StaffAccount,
    @Body() body: UpdateOrganizationDto,
    @Req() request: AuditChangeCarrier,
  ): Promise<ApiOkBody<OrganizationSettings>> {
    const saved = await this.identity.updateSettings(body, staff.organizationId);
    // The audit row names what really changed (never the values) and carries the bank-details signal.
    request.auditChanges = saved.audit;
    return { status: 'ok', data: saved.settings };
  }
}
