/**
 * @file apps/api/src/modules/identity/two-factor.controller.ts
 * @feature identity
 * @dependencies TwoFactorService, StaffGuard, RoleGuard
 * The signed-in person manages their OWN two-factor (any role). The id always comes from the session.
 */

import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { ApiOkBody, TwoFactorRecoveryCodes, TwoFactorSetup, TwoFactorStatus } from '@resort-booking/shared-types';
import { clientIp } from '../../shared/http/client-ip';
import type { RequestWithId } from '../../shared/http/request-id';
import { RoleGuard } from '../../shared/roles/role.guard';
import { AllowRoles } from '../../shared/roles/roles.decorator';
import type { StaffAccount } from '../../shared/roles/staff-role';
import { CurrentStaff } from '../../shared/tenancy/current-staff.decorator';
import { TenantExempt } from '../../shared/tenancy/tenant-scope.decorator';
import { ConfirmTwoFactorDto, EnableTwoFactorDto } from './dto/two-factor.dto';
import { StaffGuard } from './staff.guard';
import { TwoFactorService, type TwoFactorContext } from './two-factor.service';

const SELF_ONLY = 'acts only on the signed-in staff member (the id comes from the session, never from the request)';

function contextOf(request: RequestWithId): TwoFactorContext {
  return { ip: clientIp(request), requestId: request.requestId };
}

@Controller('staff/me/two-factor')
@UseGuards(StaffGuard, RoleGuard)
@AllowRoles('admin', 'employee')
export class TwoFactorController {
  public constructor(private readonly twoFactor: TwoFactorService) {}

  /**
   * Is two-factor on, and how many recovery codes are left?
   */
  @Get()
  @TenantExempt(SELF_ONLY)
  public async status(@CurrentStaff() staff: StaffAccount): Promise<ApiOkBody<TwoFactorStatus>> {
    return { status: 'ok', data: await this.twoFactor.getStatus(staff.id) };
  }

  /**
   * Issues a secret (base32 + otpauth URI). Not enabled until a code is confirmed.
   */
  @Post('setup')
  @TenantExempt(SELF_ONLY)
  public async setup(@CurrentStaff() staff: StaffAccount): Promise<ApiOkBody<TwoFactorSetup>> {
    return { status: 'ok', data: await this.twoFactor.setup(staff) };
  }

  /**
   * Confirms the first code and switches two-factor on. The recovery codes are in the answer once.
   */
  @Post('enable')
  @TenantExempt(SELF_ONLY)
  public async enable(
    @CurrentStaff() staff: StaffAccount,
    @Body() body: EnableTwoFactorDto,
    @Req() request: RequestWithId,
  ): Promise<ApiOkBody<TwoFactorRecoveryCodes>> {
    return { status: 'ok', data: await this.twoFactor.enable(staff, body.code, contextOf(request)) };
  }

  /**
   * Switches two-factor off: current password plus a code or recovery code.
   */
  @Post('disable')
  @TenantExempt(SELF_ONLY)
  public async disable(
    @CurrentStaff() staff: StaffAccount,
    @Body() body: ConfirmTwoFactorDto,
    @Req() request: RequestWithId,
  ): Promise<ApiOkBody<{ disabled: true }>> {
    await this.twoFactor.disable(staff, body.currentPassword, body.code, contextOf(request));
    return { status: 'ok', data: { disabled: true } };
  }

  /**
   * Replaces the recovery codes. The new ones are in the answer once.
   */
  @Post('recovery-codes/regenerate')
  @TenantExempt(SELF_ONLY)
  public async regenerate(
    @CurrentStaff() staff: StaffAccount,
    @Body() body: ConfirmTwoFactorDto,
    @Req() request: RequestWithId,
  ): Promise<ApiOkBody<TwoFactorRecoveryCodes>> {
    return {
      status: 'ok',
      data: await this.twoFactor.regenerateRecoveryCodes(staff, body.currentPassword, body.code, contextOf(request)),
    };
  }
}
