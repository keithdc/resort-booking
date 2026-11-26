/**
 * @file apps/api/src/shared/audit/audited.decorator.ts
 * @shared Marks a staff route whose success must be written to the audit log
 * @dependencies @nestjs/common
 */

import { SetMetadata } from '@nestjs/common';

/** How the audit row for a route is built. Only ids and NAMES of fields are ever taken from the request. */
export interface AuditedOptions {
  /** e.g. "discount.created". */
  action: string;
  /** e.g. "discount". */
  targetType: string;
  /** The route parameter that names the thing acted on (e.g. "discountId"). */
  targetParam?: string;
  /** Or: the key of the created row in the response's `data` (usually "id"). */
  targetFromResult?: string;
  /** Add the NAMES (never the values) of the body fields that were sent, e.g. for settings changes. */
  fieldNames?: boolean;
}

export const AUDITED = 'audit:options';

export const Audited = (options: AuditedOptions): MethodDecorator => SetMetadata(AUDITED, options);
