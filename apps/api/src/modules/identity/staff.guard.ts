/**
 * @file apps/api/src/modules/identity/staff.guard.ts
 * @feature identity
 * @dependencies IdentityService
 */

import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { StaffProfile } from '@resort-booking/shared-types';
import type { Request } from 'express';
import { IdentityService } from './identity.service';

export interface StaffRequest extends Request {
  staff?: StaffProfile;
}

@Injectable()
export class StaffGuard implements CanActivate {
  public constructor(private readonly identity: IdentityService) {}

  /**
   * Accepts a staff session token or the prototype STAFF_TOKEN env value.
   */
  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<StaffRequest>();
    const header = request.header('x-staff-token');
    if (header === undefined || header === '') {
      throw new UnauthorizedException({
        message: 'Staff authentication required',
        code: 'STAFF_UNAUTHORIZED',
      });
    }
    const staff = await this.identity.staffFromToken(header);
    if (staff === null) {
      throw new UnauthorizedException({
        message: 'Staff authentication required',
        code: 'STAFF_UNAUTHORIZED',
      });
    }
    request.staff = staff;
    return true;
  }
}
