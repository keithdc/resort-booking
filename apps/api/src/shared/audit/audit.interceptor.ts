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
import type { AuditChangeCarrier, AuditMetadata } from './audit.types';
import { AUDITED, type AuditDetailsInput, type AuditedOptions } from './audited.decorator';

interface AuditedRequest extends Request, AuditChangeCarrier {
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
              ...metadataOf(options, { staff, params: request.params, body: request.body, result }, request.auditChanges),
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

/** The row's metadata: the sent field names (when asked) plus whatever the route's `details` function adds. */
function metadataOf(options: AuditedOptions, input: AuditDetailsInput, changes: AuditMetadata | undefined): { metadata?: AuditMetadata } {
  // `changeSet` routes: what the handler worked out itself (names of what really changed), never the body's names.
  const fields: AuditMetadata =
    options.changeSet === true ? (changes ?? { fields: [] }) : options.fieldNames === true ? { fields: bodyFieldNames(input.body) } : {};
  let details: AuditMetadata = {};
  try {
    details = options.details === undefined ? {} : options.details(input);
  } catch {
    // A faulty detail builder must never turn a finished action into an error: the row is still written.
    details = {};
  }
  const metadata: AuditMetadata = { ...fields, ...details };
  return Object.keys(metadata).length === 0 ? {} : { metadata };
}

/** The names of the fields in a request body, sorted. Values are never read. */
function bodyFieldNames(body: unknown): string[] {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return [];
  }
  return Object.keys(body).sort().slice(0, 50);
}
