/**
 * @file apps/api/src/shared/roles/roles.decorator.ts
 * @shared Declares which roles may call a staff route
 * @dependencies @nestjs/common
 */

import { SetMetadata } from '@nestjs/common';
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
