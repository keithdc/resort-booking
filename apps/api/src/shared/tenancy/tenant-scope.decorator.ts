/**
 * @file apps/api/src/shared/tenancy/tenant-scope.decorator.ts
 * @shared Declares which ids in a staff request must belong to the caller's organization
 * @dependencies @nestjs/common
 */

import { SetMetadata } from '@nestjs/common';

/** The kinds of row a staff route can name by id. Each maps to one fixed ownership query. */
export type TenantResource =
  | 'property'
  | 'house'
  | 'ratePeriod'
  | 'discount'
  | 'extra'
  | 'requestOption'
  | 'booking'
  | 'refund'
  | 'staffUser'
  | 'staffInvite';

/** Where in the request the id comes from. */
export type TenantSource = 'param' | 'query' | 'body';

/**
 * One id (or list of ids) in the request. `optional` ids may be absent (a filter such as `?propertyId=`);
 * when present they must be owned. A list is checked as a set in one query.
 */
export interface TenantRef {
  resource: TenantResource;
  from: TenantSource;
  key: string;
  optional?: boolean;
}

export const TENANT_REFS = 'tenant:refs';
export const TENANT_EXEMPT = 'tenant:exempt';

/**
 * Staff routes that name rows by id: the TenantGuard refuses (404, never 403) anything outside the caller's
 * organization BEFORE the handler runs. Put it after StaffGuard: `@UseGuards(StaffGuard, TenantGuard)`.
 */
export const TenantScoped = (...refs: TenantRef[]): MethodDecorator & ClassDecorator => SetMetadata(TENANT_REFS, refs);

/**
 * Staff routes that name no row by id. The reason says how they are scoped instead (for example "the list is
 * filtered by the caller's organization in SQL"). The isolation suite lists every exempt route by hand, so adding
 * one is a reviewed decision.
 */
export const TenantExempt = (reason: string): MethodDecorator & ClassDecorator => SetMetadata(TENANT_EXEMPT, reason);
