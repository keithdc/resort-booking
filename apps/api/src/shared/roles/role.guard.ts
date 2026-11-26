/**
 * @file apps/api/src/shared/roles/role.guard.ts
 * @shared Turns away a signed-in person whose role may not call the route
 * @dependencies Reflector
 */

import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { httpMetrics } from '../http/http-metrics';
import { ALLOWED_ROLES, REQUIRES_MONEY_ACCESS } from './roles.decorator';
import { hasMoneyAccess, type StaffAccount, type StaffRole } from './staff-role';

interface RequestWithStaff extends Request {
  staff?: StaffAccount;
  requestId?: string;
}

@Injectable()
export class RoleGuard implements CanActivate {
  private readonly logger = new Logger(RoleGuard.name);

  public constructor(private readonly reflector: Reflector) {}

  /**
   * Runs after StaffGuard (and TenantGuard). Fails CLOSED: a route with no role declaration is refused for
   * everyone, so forgetting the decorator can never open a route.
   */
  public canActivate(context: ExecutionContext): boolean {
    const staff = context.switchToHttp().getRequest<RequestWithStaff>().staff;
    if (staff === undefined) {
      throw new UnauthorizedException({ message: 'Staff authentication required', code: 'STAFF_UNAUTHORIZED' });
    }
    const allowed = this.reflector.getAllAndOverride<StaffRole[] | undefined>(ALLOWED_ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowed === undefined) {
      this.logger.error(`Route ${context.getClass().name}.${context.getHandler().name} has no role declaration`);
      throw this.deny(context, 'This action is not allowed for your role');
    }
    if (!allowed.includes(staff.role)) {
      throw this.deny(context, 'This action is not allowed for your role');
    }
    const needsMoneyAccess = this.reflector.getAllAndOverride<boolean | undefined>(REQUIRES_MONEY_ACCESS, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (needsMoneyAccess === true && !hasMoneyAccess(staff)) {
      throw this.deny(context, 'You need refund access for this. Ask an admin to turn it on for you.');
    }
    return true;
  }

  /**
   * The 403, counted and logged at warn with the route and the request id only (docs/13 R2-24): probing for routes a role
   * cannot call shows up as a rising count, without a name, email or id in the line.
   */
  private deny(context: ExecutionContext, message: string): ForbiddenException {
    httpMetrics.recordGuardDenial();
    const request = context.switchToHttp().getRequest<RequestWithStaff>();
    this.logger.warn(
      `guard.denied guard=role route=${context.getClass().name}.${context.getHandler().name} req=${request.requestId ?? 'none'}`,
    );
    return new ForbiddenException({ message, code: 'FORBIDDEN_ROLE' });
  }
}
