/**
 * @file apps/api/src/modules/identity/identity.controller.ts
 * @feature identity
 * @dependencies IdentityService
 */

import {
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
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
  StaffLoginResult,
  StaffProfile,
} from '@resort-booking/shared-types';
import { ChangeStaffPasswordDto } from './dto/change-staff-password.dto';
import { StaffLoginDto } from './dto/staff-login.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { UpdateStaffProfileDto } from './dto/update-staff-profile.dto';
import { IdentityService } from './identity.service';
import { StaffGuard, type StaffRequest } from './staff.guard';

@Controller()
export class IdentityController {
  public constructor(private readonly identity: IdentityService) {}

  /**
   * Public stub: which operator this deployment belongs to.
   */
  @Get('identity/organization')
  public async getOrganization(): Promise<ApiOkBody<Organization>> {
    const organization = await this.identity.getOrganization();
    if (organization === null) {
      throw new NotFoundException({ message: 'Organization not found', code: 'ORG_NOT_FOUND' });
    }
    return { status: 'ok', data: organization };
  }

  /**
   * Email + password for the admin app.
   */
  @Post('staff/login')
  public async login(@Body() body: StaffLoginDto): Promise<ApiOkBody<StaffLoginResult>> {
    return { status: 'ok', data: await this.identity.login(body.email, body.password) };
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
   * Signed-in owner profile.
   */
  @Get('staff/me')
  @UseGuards(StaffGuard)
  public me(@Req() request: StaffRequest): ApiOkBody<StaffProfile> {
    if (request.staff === undefined) {
      throw new UnauthorizedException({ message: 'Staff authentication required', code: 'STAFF_UNAUTHORIZED' });
    }
    return { status: 'ok', data: request.staff };
  }

  /**
   * Name and login email for the owner account.
   */
  @Patch('staff/me')
  @UseGuards(StaffGuard)
  public async patchMe(
    @Req() request: StaffRequest,
    @Body() body: UpdateStaffProfileDto,
  ): Promise<ApiOkBody<StaffProfile>> {
    if (request.staff === undefined) {
      throw new UnauthorizedException({ message: 'Staff authentication required', code: 'STAFF_UNAUTHORIZED' });
    }
    return { status: 'ok', data: await this.identity.updateProfile(request.staff.id, body) };
  }

  /**
   * Changes the owner password.
   */
  @Post('staff/me/password')
  @UseGuards(StaffGuard)
  public async changePassword(
    @Req() request: StaffRequest,
    @Body() body: ChangeStaffPasswordDto,
  ): Promise<ApiOkBody<{ changed: true }>> {
    if (request.staff === undefined) {
      throw new UnauthorizedException({ message: 'Staff authentication required', code: 'STAFF_UNAUTHORIZED' });
    }
    await this.identity.changePassword(request.staff.id, body);
    return { status: 'ok', data: { changed: true } };
  }

  /**
   * Operator bank + legal details (not property refund ladders).
   */
  @Get('staff/organization')
  @UseGuards(StaffGuard)
  public async getStaffOrganization(): Promise<ApiOkBody<OrganizationSettings>> {
    return { status: 'ok', data: await this.identity.getSettings() };
  }

  /**
   * Saves org-wide settings.
   */
  @Patch('staff/organization')
  @UseGuards(StaffGuard)
  public async patchOrganization(
    @Body() body: UpdateOrganizationDto,
  ): Promise<ApiOkBody<OrganizationSettings>> {
    return { status: 'ok', data: await this.identity.updateSettings(body) };
  }
}
