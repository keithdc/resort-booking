/**
 * @file apps/api/src/shared/tenancy/current-staff.decorator.ts
 * @shared The signed-in staff member, for handlers behind StaffGuard
 * @dependencies @nestjs/common
 */

import { createParamDecorator, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { StaffAccount } from '../roles/staff-role';

interface RequestWithStaff extends Request {
  staff?: StaffAccount;
}

/**
 * Hands the handler the staff member the guard attached. Throws 401 if the route forgot StaffGuard, so a
 * handler can never run without knowing whose organization it works in.
 */
export const CurrentStaff = createParamDecorator((_data: unknown, context: ExecutionContext): StaffAccount => {
  const staff = context.switchToHttp().getRequest<RequestWithStaff>().staff;
  if (staff === undefined) {
    throw new UnauthorizedException({ message: 'Staff authentication required', code: 'STAFF_UNAUTHORIZED' });
  }
  return staff;
});
