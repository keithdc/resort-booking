/**
 * @file apps/api/src/shared/roles/roles.decorator.ts
 * @shared Declares which roles may call a staff route
 * @dependencies @nestjs/common
 */

import { applyDecorators, SetMetadata } from '@nestjs/common';
import type { StaffRole } from './staff-role';

export const ALLOWED_ROLES = 'roles:allowed';

/**
 * Only admins. Put it on the route (or the whole controller); a route-level decorator wins over a
 * controller-level one.
 */
export const RequireRole = (role: 'admin'): MethodDecorator & ClassDecorator => SetMetadata(ALLOWED_ROLES, [role]);

/**
 * These roles, e.g. `@AllowRoles('admin', 'employee')` for the day-to-day routes. EVERY staff route must carry
 * `@RequireRole` or `@AllowRoles`: the tenant isolation suite fails otherwise.
 */
export const AllowRoles = (...roles: StaffRole[]): MethodDecorator & ClassDecorator => SetMetadata(ALLOWED_ROLES, roles);

/** Metadata key: the route also needs money access (an admin, or an employee an admin granted the permission to). */
export const REQUIRES_MONEY_ACCESS = 'roles:money-access';

/**
 * Money routes (refund retry, mark a refund paid): an admin, or an employee who has been given "can handle refunds and
 * money actions" (`staff.canManageRefunds`, read from the database on every request). Everyone else gets 403.
 */
export const RequireMoneyAccess = (): MethodDecorator & ClassDecorator =>
  applyDecorators(SetMetadata(ALLOWED_ROLES, ['admin', 'employee']), SetMetadata(REQUIRES_MONEY_ACCESS, true));
