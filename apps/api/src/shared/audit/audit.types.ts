/**
 * @file apps/api/src/shared/audit/audit.types.ts
 * @shared Shapes of the audit log
 * @dependencies none
 */

/** What to record. Metadata may hold names of things and ids, never passwords, tokens, bank details or emails. */
export interface AuditEntry {
  /** Null only for a sign-in attempt that matched no account. */
  organizationId: string | null;
  staffUserId: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Readonly<Record<string, string | number | boolean | readonly string[] | null>>;
  /** Hash of the caller's IP (see fingerprint), never the address. */
  ipHash?: string | null;
  requestId?: string | null;
}

/** One row of the log as the admin list returns it. */
export interface AuditRecord {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  staffUserId: string | null;
  staffName: string | null;
  requestId: string | null;
  createdAt: string;
}

export interface AuditPage {
  items: AuditRecord[];
  /** Pass it back as `cursor` for the next (older) page; null when there is no more. */
  nextCursor: string | null;
}

export interface AuditFilters {
  /** Only actions starting with this, e.g. "team." */
  actionPrefix?: string;
  /** Inclusive start (ISO date or date-time). */
  from?: string;
  /** Exclusive end (ISO date or date-time). */
  to?: string;
  cursor?: string;
  /** 1-100, default 50. */
  limit?: number;
}

/** Who did it and from where, taken from the request. */
export interface AuditActor {
  organizationId: string;
  staffUserId: string;
  ip: string | undefined;
  requestId: string | undefined;
}
