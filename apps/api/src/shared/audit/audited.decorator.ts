/**
 * @file apps/api/src/shared/audit/audited.decorator.ts
 * @shared Marks a staff route whose success must be written to the audit log
 * @dependencies @nestjs/common
 */

import { SetMetadata } from '@nestjs/common';
import type { StaffAccount } from '../roles/staff-role';
import type { AuditMetadata } from './audit.types';

/** What a route's `details` function may read: who acted, the route params, the body and the handler's answer. */
export interface AuditDetailsInput {
  staff: StaffAccount;
  params: Readonly<Record<string, unknown>>;
  body: unknown;
  result: unknown;
}

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
  /**
   * The metadata is whatever the handler put on `request.auditChanges` (names of what REALLY changed, flags). Use it
   * instead of `fieldNames` when the body always carries every field, so the body's names say nothing.
   */
  changeSet?: boolean;
  /**
   * Extra metadata built from the request and the answer (for money routes: who, which booking, how much, why).
   * Must return names, ids, numbers and flags only, never passwords, tokens, bank details, emails or free text.
   */
  details?: (input: AuditDetailsInput) => AuditMetadata;
}

export const AUDITED = 'audit:options';

export const Audited = (options: AuditedOptions): MethodDecorator => SetMetadata(AUDITED, options);
