/**
 * @file apps/api/src/shared/audit/audit.repository.ts
 * @shared SQL for the audit log
 * @dependencies DatabaseService
 */

import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import type { AuditEntry, AuditRecord } from './audit.types';

interface AuditRow {
  id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  staff_user_id: string | null;
  staff_name: string | null;
  request_id: string | null;
  created_at_exact: string;
}

export interface AuditQuery {
  organizationId: string;
  actionPrefix: string | null;
  /** Only rows done by this staff user (the organization filter still applies, so a foreign id matches nothing). */
  staffUserId: string | null;
  from: string | null;
  to: string | null;
  /** The previous page's last row: its exact timestamp (microseconds, as text) and id. */
  after: { createdAt: string; id: string } | null;
  limit: number;
}

export interface AuditPageRows {
  records: AuditRecord[];
  /** Exact timestamps (text) and ids of the returned rows, to build the next cursor from the last one. */
  last: { createdAt: string; id: string } | null;
}

const INSERT_SQL = `
  INSERT INTO audit_log (organization_id, staff_user_id, action, target_type, target_id, metadata, ip_hash, request_id)
  VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
`;

function insertParams(entry: AuditEntry): unknown[] {
  return [
    entry.organizationId,
    entry.staffUserId,
    entry.action,
    entry.targetType ?? null,
    entry.targetId ?? null,
    JSON.stringify(entry.metadata ?? {}),
    entry.ipHash ?? null,
    entry.requestId ?? null,
  ];
}

@Injectable()
export class AuditRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async insert(entry: AuditEntry): Promise<void> {
    await this.database.query(INSERT_SQL, insertParams(entry));
  }

  /**
   * The same row, written on the caller's own transaction client: it commits or rolls back together with the action
   * (docs/13 R6-05). A failure THROWS, so the transaction is rolled back and the action does not happen.
   */
  public async insertWith(client: PoolClient, entry: AuditEntry): Promise<void> {
    await client.query(INSERT_SQL, insertParams(entry));
  }

  /**
   * One page of the organization's log, newest first. One statement; the staff name is joined, not looked up
   * per row. Asks for one row more than `limit` so the caller can tell whether another page exists.
   */
  public async page(query: AuditQuery): Promise<AuditPageRows & { hasMore: boolean }> {
    const result = await this.database.query<AuditRow>(
      `
      SELECT a.id, a.action, a.target_type, a.target_id, a.metadata, a.staff_user_id, u.full_name AS staff_name,
        a.request_id,
        to_char(a.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at_exact
      FROM audit_log a
      LEFT JOIN staff_users u ON u.id = a.staff_user_id
      WHERE a.organization_id = $1::uuid
        AND ($2::text IS NULL OR a.action LIKE $2::text || '%')
        AND ($3::timestamptz IS NULL OR a.created_at >= $3::timestamptz)
        AND ($4::timestamptz IS NULL OR a.created_at < $4::timestamptz)
        AND ($5::timestamptz IS NULL OR (a.created_at, a.id) < ($5::timestamptz, $6::uuid))
        AND ($8::uuid IS NULL OR a.staff_user_id = $8::uuid)
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT $7
      `,
      [
        query.organizationId,
        query.actionPrefix,
        query.from,
        query.to,
        query.after?.createdAt ?? null,
        query.after?.id ?? null,
        query.limit + 1,
        query.staffUserId,
      ],
    );
    const hasMore = result.rows.length > query.limit;
    const rows = hasMore ? result.rows.slice(0, query.limit) : result.rows;
    const lastRow = rows[rows.length - 1];
    return {
      records: rows.map(mapRecord),
      last: lastRow === undefined ? null : { createdAt: lastRow.created_at_exact, id: lastRow.id },
      hasMore,
    };
  }
}

function mapRecord(row: AuditRow): AuditRecord {
  return {
    id: row.id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    metadata: row.metadata,
    staffUserId: row.staff_user_id,
    staffName: row.staff_name,
    requestId: row.request_id,
    createdAt: new Date(row.created_at_exact).toISOString(),
  };
}
