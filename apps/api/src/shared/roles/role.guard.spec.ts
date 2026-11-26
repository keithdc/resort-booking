/**
 * @file apps/api/src/shared/roles/role.guard.spec.ts
 * @shared RoleGuard: admins and employees see only what their role allows; no declaration means no entry
 */

import 'reflect-metadata';
import { ForbiddenException, Logger, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { Test } from '@nestjs/testing';
import { RoleGuard } from './role.guard';
import { AllowRoles, RequireMoneyAccess, RequireRole } from './roles.decorator';
import type { StaffAccount, StaffRole } from './staff-role';

@RequireRole('admin')
class AdminOnlyController {
  public adminRoute(): void {
    return;
  }

  @AllowRoles('admin', 'employee')
  public sharedRoute(): void {
    return;
  }

  @RequireMoneyAccess()
  public moneyRoute(): void {
    return;
  }
}

class UndeclaredController {
  public route(): void {
    return;
  }
}

function account(role: StaffRole, canManageRefunds = false): StaffAccount {
  return { id: 's1', organizationId: 'o1', fullName: 'Ada', email: 'ada@example.com', role, organizationName: 'Humphreys', canManageRefunds };
}

function context(controller: new () => object, handler: () => void, staff: StaffAccount | undefined): ExecutionContextHost {
  return new ExecutionContextHost([{ staff }], controller, handler);
}

describe('RoleGuard', () => {
  let guard: RoleGuard;

  beforeEach(async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation((): void => undefined);
    const moduleRef = await Test.createTestingModule({ providers: [RoleGuard, Reflector] }).compile();
    guard = moduleRef.get(RoleGuard);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('lets an admin through an admin-only route', () => {
    expect(guard.canActivate(context(AdminOnlyController, AdminOnlyController.prototype.adminRoute, account('admin')))).toBe(true);
  });

  it('turns an employee away from an admin-only route with 403 FORBIDDEN_ROLE', () => {
    const attempt = (): boolean => guard.canActivate(context(AdminOnlyController, AdminOnlyController.prototype.adminRoute, account('employee')));

    expect(attempt).toThrow(ForbiddenException);
    expect(attempt).toThrow(expect.objectContaining({ response: expect.objectContaining({ code: 'FORBIDDEN_ROLE' }) }));
  });

  it('lets both roles through a route that allows both, the route declaration winning over the controller one', () => {
    for (const role of ['admin', 'employee'] as const) {
      expect(guard.canActivate(context(AdminOnlyController, AdminOnlyController.prototype.sharedRoute, account(role)))).toBe(true);
    }
  });

  it('money route: an admin passes even when the stored flag is off', () => {
    expect(guard.canActivate(context(AdminOnlyController, AdminOnlyController.prototype.moneyRoute, account('admin', false)))).toBe(true);
  });

  it('money route: an employee WITH the permission passes', () => {
    expect(guard.canActivate(context(AdminOnlyController, AdminOnlyController.prototype.moneyRoute, account('employee', true)))).toBe(true);
  });

  it('money route: an employee WITHOUT the permission gets 403 FORBIDDEN_ROLE', () => {
    const attempt = (): boolean => guard.canActivate(context(AdminOnlyController, AdminOnlyController.prototype.moneyRoute, account('employee', false)));

    expect(attempt).toThrow(ForbiddenException);
    expect(attempt).toThrow(expect.objectContaining({ response: expect.objectContaining({ code: 'FORBIDDEN_ROLE' }) }));
  });

  it('money route: the permission is read from the account on every call (removal applies at once)', () => {
    const handler = AdminOnlyController.prototype.moneyRoute;
    expect(guard.canActivate(context(AdminOnlyController, handler, account('employee', true)))).toBe(true);
    expect(() => guard.canActivate(context(AdminOnlyController, handler, account('employee', false)))).toThrow(ForbiddenException);
  });

  it('fails closed: a route with no role declaration is refused for everyone, and the mistake is logged', () => {
    for (const role of ['admin', 'employee'] as const) {
      expect(() => guard.canActivate(context(UndeclaredController, UndeclaredController.prototype.route, account(role)))).toThrow(
        ForbiddenException,
      );
    }
    expect(Logger.prototype.error).toHaveBeenCalled();
  });

  it('answers 401 when no one is signed in (StaffGuard did not run first)', () => {
    expect(() => guard.canActivate(context(AdminOnlyController, AdminOnlyController.prototype.adminRoute, undefined))).toThrow(
      UnauthorizedException,
    );
  });
});
