/**
 * @file apps/api/src/shared/audit/audit.interceptor.ts
 * @shared Writes the audit row for routes marked @Audited, after they succeed
 * @dependencies AuditService
 */

import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { clientIp } from '../http/client-ip';
import type { RequestWithId } from '../http/request-id';
import type { StaffAccount } from '../roles/staff-role';
import { AuditService } from './audit.service';
import { AUDITED, type AuditedOptions } from './audited.decorator';

interface AuditedRequest extends Request {
  staff?: StaffAccount;
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  public constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  /**
   * Only routes with @Audited are touched. The row is written AFTER the handler succeeds (a refused or failed
   * action is not a change) and never blocks or fails the response.
   */
  public intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.get<AuditedOptions | undefined>(AUDITED, context.getHandler());
    if (options === undefined) {
      return next.handle();
    }
    const request = context.switchToHttp().getRequest<AuditedRequest & RequestWithId>();
    return next.handle().pipe(
      tap((result: unknown): void => {
        const staff = request.staff;
        if (staff === undefined) {
          return;
        }
        // Fire and forget: the response never waits for the log, and a rejection must not become an unhandled one.
        void this.audit
          .recordBy(
            { organizationId: staff.organizationId, staffUserId: staff.id, ip: clientIp(request), requestId: request.requestId },
            options.action,
            {
              targetType: options.targetType,
              ...targetOf(options, request, result),
              ...(options.fieldNames === true ? { metadata: { fields: bodyFieldNames(request.body) } } : {}),
            },
          )
          .catch((): void => undefined);
      }),
    );
  }
}

function targetOf(options: AuditedOptions, request: Request, result: unknown): { targetId?: string } {
  if (options.targetParam !== undefined) {
    const value: unknown = request.params[options.targetParam];
    return typeof value === 'string' ? { targetId: value.slice(0, 80) } : {};
  }
  if (options.targetFromResult !== undefined && typeof result === 'object' && result !== null && 'data' in result) {
    const data: unknown = (result as { data: unknown }).data;
    if (typeof data === 'object' && data !== null) {
      const value: unknown = (data as Record<string, unknown>)[options.targetFromResult];
      return typeof value === 'string' ? { targetId: value.slice(0, 80) } : {};
    }
  }
  return {};
}

/** The names of the fields in a request body, sorted. Values are never read. */
function bodyFieldNames(body: unknown): string[] {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return [];
  }
  return Object.keys(body).sort().slice(0, 50);
}
