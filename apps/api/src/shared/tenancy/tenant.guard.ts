/**
 * @file apps/api/src/shared/tenancy/tenant.guard.ts
 * @shared Refuses staff requests that name rows of another organization
 * @dependencies TenancyService, TenantScoped metadata
 */

import { CanActivate, ExecutionContext, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { StaffProfile } from '@resort-booking/shared-types';
import type { Request } from 'express';
import { httpMetrics } from '../http/http-metrics';
import { UUID_LIKE } from '../validation/uuid-like';
import { TenancyService } from './tenancy.service';
import { TENANT_REFS, type TenantRef } from './tenant-scope.decorator';

interface RequestWithStaff extends Request {
  staff?: StaffProfile;
  requestId?: string;
}

/**
 * Runs after StaffGuard. For every id the route declared with `@TenantScoped(...)`, checks it belongs to the
 * signed-in staff member's organization and answers 404 otherwise, before the handler (or body validation) runs.
 * Values that are not id-shaped are left to the validation layer: no row can have such an id, so nothing leaks.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  private readonly logger = new Logger(TenantGuard.name);

  public constructor(
    private readonly reflector: Reflector,
    private readonly tenancy: TenancyService,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithStaff>();
    const staff = request.staff;
    if (staff === undefined) {
      throw new UnauthorizedException({ message: 'Staff authentication required', code: 'STAFF_UNAUTHORIZED' });
    }
    const refs = this.reflector.getAllAndMerge<TenantRef[]>(TENANT_REFS, [context.getHandler(), context.getClass()]);
    for (const ref of refs) {
      const ids = idsFrom(request, ref);
      try {
        if (ids.length === 1) {
          await this.tenancy.assertOwned(ref.resource, staff.organizationId, ids[0] ?? '');
        } else {
          await this.tenancy.assertAllOwned(ref.resource, staff.organizationId, ids);
        }
      } catch (error: unknown) {
        if (error instanceof NotFoundException) {
          // Probing across tenants (docs/13 R2-24): counted, and logged with the route and request id only, never the ids.
          httpMetrics.recordGuardDenial();
          this.logger.warn(
            `guard.denied guard=tenant resource=${ref.resource} route=${context.getClass().name}.${context.getHandler().name} req=${request.requestId ?? 'none'}`,
          );
        }
        throw error;
      }
    }
    return true;
  }
}

/**
 * The id-shaped strings the request carries for one declared reference (none when absent).
 */
function idsFrom(request: Request, ref: TenantRef): string[] {
  const container: unknown = ref.from === 'param' ? request.params : ref.from === 'query' ? request.query : request.body;
  if (typeof container !== 'object' || container === null) {
    return [];
  }
  const value: unknown = (container as Record<string, unknown>)[ref.key];
  const list = Array.isArray(value) ? value : [value];
  return list.filter((item): item is string => typeof item === 'string' && UUID_LIKE.test(item));
}
