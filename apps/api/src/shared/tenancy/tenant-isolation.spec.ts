/**
 * @file apps/api/src/shared/tenancy/tenant-isolation.spec.ts
 * @shared THE TENANT ISOLATION SUITE: staff of organization A can never reach organization B
 *
 * 1. Finds every staff route by reading the controllers' metadata (nothing to register by hand).
 * 2. Fails when a staff route neither declares which ids it must own (`@TenantScoped`) nor says why it
 *    needs none (`@TenantExempt`), so a new route cannot ship without an isolation decision.
 * 3. Runs the REAL TenantGuard for every declared id with an id of ANOTHER organization and expects a 404,
 *    for params, query values and (sets of) body ids alike, and expects the caller's own ids to pass.
 * 4. Pins the exempt routes in one reviewed table.
 * 5. MONEY: lists every employee-reachable write that touches money in two reviewed tables: the ones the SERVICE gates
 *    (cancel, change dates: policy only without money access) and the ones the ROUTE gates with `@RequireMoneyAccess`
 *    (refund retry, mark paid: an admin, or an employee an admin gave "can handle refunds and money actions"). The suite
 *    runs the real RoleGuard on the latter with an employee with and without the permission.
 * 6. ROLES: fails when a staff route does not say which roles may call it (`@RequireRole` / `@AllowRoles`) or does not
 *    run RoleGuard, and pins every route's allowed roles in one reviewed table (ROLE_MATRIX), so a route can
 *    never quietly become available to employees.
 *
 * To add a staff route: put `@TenantScoped({ resource, from, key })` on it and `TenantGuard` after `StaffGuard`.
 * For a route with no id in the request add `@TenantExempt('how it is scoped')` AND one line to EXEMPT_ROUTES below.
 * Every staff route also needs `@RequireRole('admin')` or `@AllowRoles(...)` AND one line to ROLE_MATRIX below.
 */

import 'reflect-metadata';
import { ForbiddenException, NotFoundException, RequestMethod } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { Test } from '@nestjs/testing';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { StaffGuard } from '../../modules/identity/staff.guard';
import { AUDITED } from '../audit/audited.decorator';
import { ALLOWED_ROLES, REQUIRES_MONEY_ACCESS } from '../roles/roles.decorator';
import { RoleGuard } from '../roles/role.guard';
import type { StaffRole } from '../roles/staff-role';
import { TenancyRepository } from './tenancy.repository';
import { TenancyService } from './tenancy.service';
import { TenantGuard } from './tenant.guard';
import { TENANT_EXEMPT, TENANT_REFS, type TenantRef } from './tenant-scope.decorator';

type Handler = (...args: never[]) => unknown;
type Controller = new (...args: never[]) => unknown;

interface StaffRoute {
  key: string;
  handler: Handler;
  controller: Controller;
  guards: unknown[];
  refs: TenantRef[];
  exempt: string | undefined;
  roles: StaffRole[] | undefined;
  method: string;
  audited: boolean;
  moneyAccess: boolean;
}

/** Staff routes that name no row by id, and how each stays inside the caller's organization. */
const EXEMPT_ROUTES: Record<string, string> = {
  'GET /staff/geocode/reverse': 'forwards an address search; no tenant data',
  'GET /staff/geocode': 'forwards an address search; no tenant data',
  'GET /staff/properties': 'listProperties(false, organizationId): SQL filter (property.repository.spec)',
  'POST /staff/properties': 'createStaffProperty(organizationId, ...): created in the caller organization',
  'GET /staff/configuration': 'listBookingConfig(organizationId): SQL filter (reservations.repository.spec)',
  'GET /staff/me': 'the staff id comes from the session',
  'PATCH /staff/me': 'the staff id comes from the session',
  'POST /staff/me/password': 'the staff id comes from the session',
  'GET /staff/me/sessions': 'the staff id comes from the session',
  'POST /staff/me/sessions/revoke-others': 'the staff id comes from the session',
  'DELETE /staff/me/sessions/:id': 'the session must belong to the signed-in staff member (owner is part of the DELETE)',
  'POST /staff/logout-all': 'the staff id comes from the session',
  'GET /staff/me/two-factor': 'the staff id comes from the session',
  'POST /staff/me/two-factor/setup': 'the staff id comes from the session',
  'POST /staff/me/two-factor/enable': 'the staff id comes from the session',
  'POST /staff/me/two-factor/disable': 'the staff id comes from the session',
  'POST /staff/me/two-factor/recovery-codes/regenerate': 'the staff id comes from the session',
  'GET /staff/organization': 'getSettings(organizationId): SQL filter (organization-scope.spec)',
  'PATCH /staff/organization': 'updateSettings(input, organizationId): SQL filter (organization-scope.spec)',
  'GET /staff/system/health': 'server status, no organization data',
  'GET /staff/team': 'the list is filtered by the caller organization in SQL (team.repository)',
  'POST /staff/team/invites': 'the invitation is created in the caller organization',
  'GET /staff/audit': 'the log is filtered by the caller organization in SQL (audit.repository)',
};

/**
 * Staff routes that change data but are NOT marked `@Audited`, and why. Everything else that changes data must be
 * audited, so a new write route cannot ship without a line in the log.
 */
const UNAUDITED_WRITES: Record<string, string> = {
  'POST /staff/team/invites': 'TeamService writes team.invite_created itself (the action depends on the outcome)',
  'DELETE /staff/team/invites/:inviteId': 'TeamService writes team.invite_revoked itself',
  'PATCH /staff/team/:staffId': 'TeamService writes team.role_changed / deactivated / reactivated itself (one request, one or two actions)',
  'POST /staff/team/:staffId/reset-access': 'TeamService writes team.access_reset itself',
  'POST /staff/team/:staffId/reset-two-factor': 'TeamService writes team.two_factor_reset itself',
  'POST /staff/me/two-factor/setup': 'only issues an unconfirmed secret that protects nothing; TwoFactorService audits enable, disable, regenerate and every wrong code itself',
  'POST /staff/me/two-factor/enable': 'TwoFactorService writes auth.two_factor_enabled (or auth.two_factor_failed) itself',
  'POST /staff/me/two-factor/disable': 'TwoFactorService writes auth.two_factor_disabled (or auth.two_factor_failed) itself',
  'POST /staff/me/two-factor/recovery-codes/regenerate': 'TwoFactorService writes auth.recovery_codes_regenerated (or auth.two_factor_failed) itself',
  'POST /staff/reservations/:id/change-dates/quote': 'a price quote: writes nothing',
  'POST /staff/reservations/quote': 'a price quote for a new booking: writes nothing',
  'POST /staff/properties/:propertyId/rate-periods/bulk/preview': 'a dry run: writes nothing',
};

/** Who may call each staff route. Reviewed by hand: loosening a line here is a decision, not an accident. */
const ADMIN: StaffRole[] = ['admin'];
const BOTH: StaffRole[] = ['admin', 'employee'];
const ROLE_MATRIX: Record<string, StaffRole[]> = {
  // Day to day: calendar, bookings, check-in, cancelling and moving bookings, the refund list (read only), reports (money hidden unless the employee has refund access).
  'GET /staff/calendar': BOTH,
  'GET /staff/reservations': BOTH,
  'GET /staff/reports': BOTH,
  'PATCH /staff/reservations/:id/arrival': BOTH,
  'GET /staff/configuration': BOTH,
  'GET /staff/reservations/:id/cancel-preview': BOTH,
  'POST /staff/reservations/:id/cancel': BOTH,
  // Booking for a guest who pays at the property: the front desk does it, audited. Ticking it PAID is money access (below).
  'POST /staff/reservations/quote': BOTH,
  'POST /staff/reservations': BOTH,
  'POST /staff/reservations/:id/change-dates/quote': BOTH,
  'POST /staff/reservations/:id/change-dates': BOTH,
  'GET /staff/refunds': BOTH,
  // The published extras of a property, for the New booking form (the full list with unpublished ones stays admin-only).
  'GET /staff/properties/:propertyId/booking-extras': BOTH,
  'GET /staff/properties': BOTH,
  'GET /staff/me': BOTH,
  'PATCH /staff/me': BOTH,
  'POST /staff/me/password': BOTH,
  'GET /staff/me/sessions': BOTH,
  'POST /staff/me/sessions/revoke-others': BOTH,
  'DELETE /staff/me/sessions/:id': BOTH,
  'POST /staff/logout-all': BOTH,
  'GET /staff/me/two-factor': BOTH,
  'POST /staff/me/two-factor/setup': BOTH,
  'POST /staff/me/two-factor/enable': BOTH,
  'POST /staff/me/two-factor/disable': BOTH,
  'POST /staff/me/two-factor/recovery-codes/regenerate': BOTH,
  // Money in and out: an admin, or an employee with the refund permission (@RequireMoneyAccess, see MONEY_ACCESS_ROUTES).
  'POST /staff/refunds/:id/retry': BOTH,
  'POST /staff/refunds/:id/mark-paid': BOTH,
  'POST /staff/reservations/:id/mark-paid': BOTH,
  // Everything that sets the business up: admin only.
  'GET /staff/properties/:propertyId/configuration': ADMIN,
  'PUT /staff/properties/:propertyId/configuration': ADMIN,
  'GET /staff/organization': ADMIN,
  'PATCH /staff/organization': ADMIN,
  'GET /staff/system/health': ADMIN,
  'GET /staff/geocode': ADMIN,
  'GET /staff/geocode/reverse': ADMIN,
  'POST /staff/properties': ADMIN,
  'GET /staff/properties/:propertyId': ADMIN,
  'PATCH /staff/properties/:propertyId': ADMIN,
  'GET /staff/properties/:propertyId/houses': ADMIN,
  'POST /staff/properties/:propertyId/houses': ADMIN,
  'GET /staff/houses/:houseId': ADMIN,
  'PATCH /staff/houses/:houseId': ADMIN,
  'GET /staff/properties/:propertyId/request-options': ADMIN,
  'POST /staff/properties/:propertyId/request-options': ADMIN,
  'PATCH /staff/request-options/:optionId': ADMIN,
  'DELETE /staff/request-options/:optionId': ADMIN,
  'GET /staff/properties/:propertyId/extras': ADMIN,
  'POST /staff/properties/:propertyId/extras': ADMIN,
  'PATCH /staff/extras/:extraId': ADMIN,
  'DELETE /staff/extras/:extraId': ADMIN,
  'GET /staff/properties/:propertyId/rate-periods': ADMIN,
  'GET /staff/houses/:houseId/rate-periods': ADMIN,
  'POST /staff/houses/:houseId/rate-periods': ADMIN,
  'PATCH /staff/rate-periods/:periodId': ADMIN,
  'DELETE /staff/rate-periods/:periodId': ADMIN,
  'POST /staff/properties/:propertyId/rate-periods/bulk/preview': ADMIN,
  'POST /staff/properties/:propertyId/rate-periods/bulk': ADMIN,
  'GET /staff/properties/:propertyId/discounts': ADMIN,
  'POST /staff/properties/:propertyId/discounts': ADMIN,
  'PATCH /staff/discounts/:discountId': ADMIN,
  'DELETE /staff/discounts/:discountId': ADMIN,
  // The team and the audit log.
  'GET /staff/team': ADMIN,
  'POST /staff/team/invites': ADMIN,
  'DELETE /staff/team/invites/:inviteId': ADMIN,
  'PATCH /staff/team/:staffId': ADMIN,
  'POST /staff/team/:staffId/reset-access': ADMIN,
  'POST /staff/team/:staffId/reset-two-factor': ADMIN,
  'GET /staff/audit': ADMIN,
};

/**
 * Employee-reachable write routes that touch money and are gated in the SERVICE. They stay open to every employee for
 * the normal guest-policy cancellation and a plain date change; StaffBookingsService (see its spec) answers 403
 * FORBIDDEN_ROLE to someone WITHOUT money access (an admin, or an employee with `canManageRefunds`) who asks for
 * reason property_cancelled or goodwill, any amount, waiveFee, or balanceSettledOutside. On a booking whose check-in is
 * today or past in the property's timezone, an employee without money access cancels with the refund forced to ZERO,
 * and gets 403 SAME_DAY_ADMIN_ONLY for change dates (a money difference).
 */
const EMPLOYEE_MONEY_ROUTES_GATED_IN_SERVICE: Record<string, string> = {
  'POST /staff/reservations/:id/cancel': 'without money access: guest_request (policy refund) only; check-in today or past => refund forced to 0',
  'POST /staff/reservations/:id/change-dates/quote': 'without money access: no waiveFee, and never when check-in is today or past (SAME_DAY_ADMIN_ONLY)',
  'POST /staff/reservations/:id/change-dates': 'without money access: no waiveFee, no balanceSettledOutside, never when check-in is today or past (SAME_DAY_ADMIN_ONLY)',
};

/**
 * Pure money-out routes: the ROUTE needs money access (`@RequireMoneyAccess`): an admin, or an employee an admin gave
 * "can handle refunds and money actions". Both are audited with who, the booking reference and the amount.
 */
const MONEY_ACCESS_ROUTES: string[] = ['POST /staff/refunds/:id/retry', 'POST /staff/refunds/:id/mark-paid', 'POST /staff/reservations/:id/mark-paid'];

/** Path fragments that mark a route as touching money. */
const MONEY_PATH_PARTS = ['/refund', '/mark-paid', '/cancel', '/change-dates', '/payment', '/rate-periods', '/discounts'];

/** Routes under /staff that are public on purpose: they create or end a session, or open one through an invitation. */
const PUBLIC_STAFF_ROUTES = new Set([
  'POST /staff/login',
  'POST /staff/login/two-factor',
  'POST /staff/logout',
  'GET /staff/register/status',
  'POST /staff/register',
  'GET /staff/invites/:token/preview',
  'POST /staff/invites/accept',
]);

const MODULES_DIR = join(__dirname, '../../modules');

function controllerFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name: string): string[] => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return controllerFiles(path);
    }
    return name.endsWith('.controller.ts') ? [path] : [];
  });
}

function joinPath(...parts: string[]): string {
  return `/${parts.map((part) => part.replace(/^\/+|\/+$/g, '')).filter((part) => part !== '').join('/')}`;
}

function collectRoutes(): { staff: StaffRoute[]; staffPathsWithoutGuard: string[] } {
  const staff: StaffRoute[] = [];
  const staffPathsWithoutGuard: string[] = [];
  for (const file of controllerFiles(MODULES_DIR)) {
    const exported = jest.requireActual<Record<string, unknown>>(file);
    for (const value of Object.values(exported)) {
      if (typeof value !== 'function' || Reflect.getMetadata('path', value) === undefined) {
        continue;
      }
      const controller: Controller = value as Controller;
      const prefix = Reflect.getMetadata('path', controller) as string;
      const classGuards = (Reflect.getMetadata('__guards__', controller) as unknown[] | undefined) ?? [];
      for (const name of Object.getOwnPropertyNames(controller.prototype)) {
        const handler = (controller.prototype as Record<string, unknown>)[name];
        if (typeof handler !== 'function' || Reflect.getMetadata('method', handler) === undefined) {
          continue;
        }
        const method = RequestMethod[Reflect.getMetadata('method', handler) as number];
        const path = joinPath(prefix, Reflect.getMetadata('path', handler) as string);
        const key = `${method} ${path}`;
        const guards = [...classGuards, ...((Reflect.getMetadata('__guards__', handler) as unknown[] | undefined) ?? [])];
        if (guards.includes(StaffGuard)) {
          const refs = [
            ...((Reflect.getMetadata(TENANT_REFS, controller) as TenantRef[] | undefined) ?? []),
            ...((Reflect.getMetadata(TENANT_REFS, handler) as TenantRef[] | undefined) ?? []),
          ];
          staff.push({
            key,
            handler: handler as Handler,
            controller,
            guards,
            refs,
            exempt: Reflect.getMetadata(TENANT_EXEMPT, handler) as string | undefined,
            method: method ?? '',
            audited: Reflect.getMetadata(AUDITED, handler) !== undefined,
            moneyAccess:
              Reflect.getMetadata(REQUIRES_MONEY_ACCESS, handler) === true || Reflect.getMetadata(REQUIRES_MONEY_ACCESS, controller) === true,
            roles:
              (Reflect.getMetadata(ALLOWED_ROLES, handler) as StaffRole[] | undefined) ??
              (Reflect.getMetadata(ALLOWED_ROLES, controller) as StaffRole[] | undefined),
          });
        } else if (path.startsWith('/staff/') && !PUBLIC_STAFF_ROUTES.has(key)) {
          staffPathsWithoutGuard.push(key);
        }
      }
    }
  }
  return { staff, staffPathsWithoutGuard };
}

const { staff: STAFF_ROUTES, staffPathsWithoutGuard } = collectRoutes();

// --- Two organizations, one fake database ---

const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OWN = 'a0000000-0000-4000-8000-000000000001';
const OWN_TWO = 'a0000000-0000-4000-8000-000000000002';
const FOREIGN = 'b0000000-0000-4000-8000-000000000001';

/** Every id in `a*` belongs to org A; every other id belongs to org B. */
class FakeTenancyRepository {
  public readonly lookups: string[] = [];

  public owns(resource: string, organizationId: string, id: string): Promise<boolean> {
    this.lookups.push(`${resource}:${id}`);
    return Promise.resolve(organizationId === ORG_A && id.startsWith('a'));
  }

  public countOwned(resource: string, organizationId: string, ids: readonly string[]): Promise<number> {
    this.lookups.push(`${resource}:[${ids.join(',')}]`);
    return Promise.resolve(organizationId === ORG_A ? ids.filter((id) => id.startsWith('a')).length : 0);
  }
}

async function buildGuard(): Promise<{ guard: TenantGuard; repository: FakeTenancyRepository }> {
  const repository = new FakeTenancyRepository();
  const moduleRef = await Test.createTestingModule({
    providers: [TenantGuard, TenancyService, Reflector, { provide: TenancyRepository, useValue: repository }],
  }).compile();
  return { guard: moduleRef.get(TenantGuard), repository };
}

function contextFor(route: StaffRoute, request: Record<string, unknown>): ExecutionContextHost {
  return new ExecutionContextHost([request], route.controller, route.handler);
}

function requestWith(route: StaffRoute, valueFor: (ref: TenantRef) => unknown): Record<string, unknown> {
  const request: Record<string, unknown> = {
    staff: { id: 's1', organizationId: ORG_A, fullName: 'A', email: 'a@example.com' },
    params: {},
    query: {},
    body: {},
  };
  for (const ref of route.refs) {
    const target = request[ref.from === 'param' ? 'params' : ref.from === 'query' ? 'query' : 'body'] as Record<string, unknown>;
    target[ref.key] = valueFor(ref);
  }
  return request;
}

describe('tenant isolation: every staff route', () => {
  it('finds the staff routes (a sanity check on the scan itself)', () => {
    expect(STAFF_ROUTES.length).toBeGreaterThan(40);
    expect(STAFF_ROUTES.map((route) => route.key)).toEqual(expect.arrayContaining(['GET /staff/reports', 'PATCH /staff/houses/:houseId']));
  });

  it('has no /staff route without StaffGuard (except sign-in and sign-out)', () => {
    expect(staffPathsWithoutGuard).toEqual([]);
  });

  it.each(STAFF_ROUTES.map((route) => [route.key, route] as const))(
    '%s declares its tenant scope (ids it must own, or a reviewed exemption)',
    (_key, route) => {
      const declared = route.refs.length > 0 || route.exempt !== undefined;
      expect(declared).toBe(true);
      expect(route.refs.length > 0 && route.exempt !== undefined).toBe(false);
    },
  );

  it.each(STAFF_ROUTES.map((route) => [route.key, route] as const))(
    '%s declares which roles may call it and runs RoleGuard last',
    (_key, route) => {
      expect(route.roles).toBeDefined();
      expect(route.roles?.length ?? 0).toBeGreaterThan(0);
      expect(route.guards).toContain(RoleGuard);
      expect(route.guards.indexOf(RoleGuard)).toBe(route.guards.length - 1);
    },
  );

  it.each(STAFF_ROUTES.map((route) => [route.key, route] as const))(
    '%s is in the reviewed role matrix with the same roles',
    (key, route) => {
      expect(Object.keys(ROLE_MATRIX)).toContain(key);
      expect([...(route.roles ?? [])].sort()).toEqual([...(ROLE_MATRIX[key] ?? [])].sort());
    },
  );

  it.each(STAFF_ROUTES.filter((route) => route.method !== 'GET').map((route) => [route.key, route] as const))(
    '%s (a write) is audited, or is in the reviewed list of unaudited writes',
    (key, route) => {
      expect(route.audited || Object.keys(UNAUDITED_WRITES).includes(key)).toBe(true);
    },
  );

  it('the list of unaudited writes lists only writes that exist and are not audited', () => {
    const unaudited = STAFF_ROUTES.filter((route) => route.method !== 'GET' && !route.audited).map((route) => route.key);
    expect(Object.keys(UNAUDITED_WRITES).sort()).toEqual(unaudited.sort());
  });

  it('the role matrix lists only routes that exist', () => {
    expect(Object.keys(ROLE_MATRIX).sort()).toEqual(STAFF_ROUTES.map((route) => route.key).sort());
  });

  it('every route open to employees that can move money is on a reviewed list: gated in its service, or by money access on the route', () => {
    const employeeRoutes = STAFF_ROUTES.filter((route) => route.roles?.includes('employee') === true).map((route) => route.key);
    const moneyRelated = employeeRoutes.filter((key) => MONEY_PATH_PARTS.some((part) => key.includes(part)) && !key.startsWith('GET '));
    // A new employee-reachable write that touches money must be added to one list on purpose (and gated).
    expect(moneyRelated.sort()).toEqual([...Object.keys(EMPLOYEE_MONEY_ROUTES_GATED_IN_SERVICE), ...MONEY_ACCESS_ROUTES].sort());
  });

  it('no route is open to employees that sets the business up (money-out routes are permission-gated, see below)', () => {
    const employeeRoutes = STAFF_ROUTES.filter((route) => route.roles?.includes('employee') === true).map((route) => route.key);
    const forbiddenForEmployees = ['/organization', '/team', '/audit', '/discounts', '/rate-periods', '/extras', '/system'];
    for (const key of employeeRoutes) {
      for (const part of forbiddenForEmployees) {
        expect(key.includes(part)).toBe(false);
      }
    }
  });

  it('the money-access routes are exactly the ones marked @RequireMoneyAccess, and each is audited', () => {
    const marked = STAFF_ROUTES.filter((route) => route.moneyAccess).map((route) => route.key);
    expect(marked.sort()).toEqual([...MONEY_ACCESS_ROUTES].sort());
    for (const key of MONEY_ACCESS_ROUTES) {
      expect(STAFF_ROUTES.find((candidate) => candidate.key === key)?.audited).toBe(true);
    }
  });

  it.each(MONEY_ACCESS_ROUTES)('%s: the real RoleGuard lets an admin and an employee WITH the permission in, and refuses one without', (key) => {
    const route = STAFF_ROUTES.find((candidate) => candidate.key === key);
    expect(route).toBeDefined();
    if (route === undefined) {
      return;
    }
    const guard = new RoleGuard(new Reflector());
    const base = { id: 's1', organizationId: ORG_A, fullName: 'A', email: 'a@example.com', organizationName: 'Org' };
    const attempt = (role: StaffRole, canManageRefunds: boolean): boolean =>
      guard.canActivate(contextFor(route, { staff: { ...base, role, canManageRefunds } }));

    expect(attempt('admin', false)).toBe(true);
    expect(attempt('employee', true)).toBe(true);
    expect(() => attempt('employee', false)).toThrow(ForbiddenException);
  });

  it('team routes that change who has money access stay admin only and are tenant-scoped', () => {
    const route = STAFF_ROUTES.find((candidate) => candidate.key === 'PATCH /staff/team/:staffId');
    expect(route?.roles).toEqual(['admin']);
    expect(route?.refs.map((ref) => ref.resource)).toEqual(['staffUser']);
    expect(route?.moneyAccess).toBe(false);
  });

  it.each(STAFF_ROUTES.filter((route) => route.refs.length > 0).map((route) => [route.key, route] as const))(
    '%s runs TenantGuard after StaffGuard',
    (_key, route) => {
      expect(route.guards).toContain(TenantGuard);
      expect(route.guards.indexOf(StaffGuard)).toBeLessThan(route.guards.indexOf(TenantGuard));
    },
  );

  it.each(STAFF_ROUTES.filter((route) => route.refs.length > 0).map((route) => [route.key, route] as const))(
    '%s answers 404 for ids of another organization and lets the caller\'s own through',
    async (_key, route) => {
      for (const ref of route.refs) {
        const { guard, repository } = await buildGuard();
        const foreign = requestWith(route, (other) => (other === ref ? (ref.from === 'body' ? [OWN, FOREIGN] : FOREIGN) : ownValue(other)));
        await expect(guard.canActivate(contextFor(route, foreign))).rejects.toBeInstanceOf(NotFoundException);
        expect(repository.lookups.length).toBeGreaterThan(0);
      }
      const { guard } = await buildGuard();
      const own = requestWith(route, ownValue);
      await expect(guard.canActivate(contextFor(route, own))).resolves.toBe(true);

      // And the other way round: staff of organization B cannot use organization A's ids either.
      const fromB = { ...requestWith(route, ownValue), staff: { id: 's2', organizationId: ORG_B, fullName: 'B', email: 'b@example.com' } };
      await expect(guard.canActivate(contextFor(route, fromB))).rejects.toBeInstanceOf(NotFoundException);
    },
  );

  it.each(STAFF_ROUTES.filter((route) => route.exempt !== undefined).map((route) => [route.key, route] as const))(
    '%s is in the reviewed table of exempt routes',
    (key) => {
      expect(Object.keys(EXEMPT_ROUTES)).toContain(key);
    },
  );

  it('the exempt table lists only routes that exist and are exempt', () => {
    const exemptKeys = STAFF_ROUTES.filter((route) => route.exempt !== undefined).map((route) => route.key);
    expect(Object.keys(EXEMPT_ROUTES).sort()).toEqual(exemptKeys.sort());
  });
});

function ownValue(ref: TenantRef): unknown {
  return ref.from === 'body' ? [OWN, OWN_TWO] : OWN;
}
