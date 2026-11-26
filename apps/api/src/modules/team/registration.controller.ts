/**
 * @file apps/api/src/modules/team/registration.controller.ts
 * @feature team
 * @dependencies TeamService
 * PUBLIC endpoints: registering a workspace and using an invitation link. Everything else about staff needs a session.
 */

import { Body, Controller, Get, NotFoundException, Param, Post, Req } from '@nestjs/common';
import type { ApiOkBody } from '@resort-booking/shared-types';
import { clientIp } from '../../shared/http/client-ip';
import type { RequestWithId } from '../../shared/http/request-id';
import type { StaffSessionResult } from '../../shared/roles/staff-role';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { RegisterDto } from './dto/register.dto';
import { TeamService, type PublicContext } from './team.service';
import type { InvitePreview, RegistrationStatus } from './team.types';

const TOKEN_SHAPE = /^[0-9a-f]{64}$/;

function contextOf(request: RequestWithId): PublicContext {
  return { ip: clientIp(request), requestId: request.requestId };
}

@Controller('staff')
export class RegistrationController {
  public constructor(private readonly team: TeamService) {}

  /**
   * Can a new workspace be registered here? The admin app hides the "Create an account" link when not.
   */
  @Get('register/status')
  public status(): ApiOkBody<RegistrationStatus> {
    return { status: 'ok', data: this.team.status() };
  }

  /**
   * Creates a workspace and its first admin, and signs them in.
   */
  @Post('register')
  public async register(@Body() body: RegisterDto, @Req() request: RequestWithId): Promise<ApiOkBody<StaffSessionResult>> {
    return { status: 'ok', data: await this.team.register(body, contextOf(request)) };
  }

  /**
   * What the invitation page shows. The same 404 for an unknown, used, revoked or expired link.
   */
  @Get('invites/:token/preview')
  public async preview(@Param('token') token: string, @Req() request: RequestWithId): Promise<ApiOkBody<InvitePreview>> {
    if (!TOKEN_SHAPE.test(token)) {
      throw new NotFoundException({ message: 'This link is not valid any more. Ask your admin for a new one.', code: 'INVITE_INVALID' });
    }
    return { status: 'ok', data: await this.team.preview(token, contextOf(request)) };
  }

  /**
   * Uses the link: choose a password and sign in.
   */
  @Post('invites/accept')
  public async accept(@Body() body: AcceptInviteDto, @Req() request: RequestWithId): Promise<ApiOkBody<StaffSessionResult>> {
    return { status: 'ok', data: await this.team.accept(body, contextOf(request)) };
  }
}
