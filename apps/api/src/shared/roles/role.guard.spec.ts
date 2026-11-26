/**
 * @file apps/api/src/shared/roles/role.guard.spec.ts
 * @shared RoleGuard: admins and employees see only what their role allows; no declaration means no entry
 */

import 'reflect-metadata';
import { ForbiddenException, Logger, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { Test } from '@nestjs/testing';
import { httpMetrics } from '../http/http-metrics';
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

  describe('refusals are visible (docs/13 R2-24)', () => {
    it('logs a role refusal at warn with the route and the request id only, and counts it', () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation((): void => undefined);
      httpMetrics.takeWindow();
      const host = new ExecutionContextHost(
        [{ staff: account('employee'), requestId: 'req-12345678', originalUrl: '/staff/team?email=ada@example.com', params: { staffId: 'abc' } }],
        AdminOnlyController,
        AdminOnlyController.prototype.adminRoute,
      );

      expect(() => guard.canActivate(host)).toThrow(ForbiddenException);

      expect(warn).toHaveBeenCalledTimes(1);
      const line = String(warn.mock.calls[0]?.[0]);
      expect(line).toBe('guard.denied guard=role route=AdminOnlyController.adminRoute req=req-12345678');
      for (const personal of ['ada@example.com', 'Ada', 'o1', 's1', 'abc']) {
        expect(line).not.toContain(personal);
      }
      expect(httpMetrics.takeWindow()).toMatchObject({ guardDenied: 1 });
    });

    it('logs and counts the missing money access refusal too, and says "none" when there is no request id', () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation((): void => undefined);
      httpMetrics.takeWindow();

      expect(() => guard.canActivate(context(AdminOnlyController, AdminOnlyController.prototype.moneyRoute, account('employee', false)))).toThrow(ForbiddenException);

      expect(String(warn.mock.calls[0]?.[0])).toBe('guard.denied guard=role route=AdminOnlyController.moneyRoute req=none');
      expect(httpMetrics.takeWindow()).toMatchObject({ guardDenied: 1 });
    });

    it('logs and counts nothing for an allowed request', () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation((): void => undefined);
      httpMetrics.takeWindow();

      expect(guard.canActivate(context(AdminOnlyController, AdminOnlyController.prototype.adminRoute, account('admin')))).toBe(true);

      expect(warn).not.toHaveBeenCalled();
      expect(httpMetrics.takeWindow()).toBeNull();
    });
  });
});
