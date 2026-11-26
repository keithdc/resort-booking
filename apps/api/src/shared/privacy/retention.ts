/**
 * @file apps/api/src/shared/privacy/retention.ts
 * @shared The retention job: the ordered list of steps, a dry run that only counts, and an apply that works in batches
 * @dependencies privacy-db, privacy-config, anonymise-sql
 *
 * Each batch is ONE transaction. Steps that touch an append-only table (audit_log, refunds, booking_changes) set the
 * maintenance switch inside that transaction (docs/11); the others run without it. The job is idempotent (the selection
 * excludes what is already done) and safe to run daily: a batch only picks rows nobody else has locked.
 */

import { ANONYMISED_NAME, anonymiseBookingsSql, OPEN_REFUND_SQL, REMOVED_TEXT } from './anonymise-sql';
import type { RetentionConfig } from './privacy-config';
import type { PrivacyDb, PrivacyTx } from './privacy-db';

/** A statement with its parameters. */
export interface BoundSql {
  text: string;
  params: readonly unknown[];
}

/** One thing the job does. */
export interface RetentionStep {
  id: string;
  label: string;
  action: 'anonymise' | 'delete';
  table: string;
  /** The retention period this step enforces, in days, for the report. */
  days: number;
  /** Touches audit_log, refunds or booking_changes: needs the maintenance switch. */
  maintenance: boolean;
  /** How many rows are due (read-only). */
  count: BoundSql;
  /** One batch (`batchSize` rows at most): returns one row with `n` and optional extra counters. */
  batch: (batchSize: number) => BoundSql;
  /** Extra read-only counts shown with the step (for example rows kept back by an open refund). */
  deferred?: BoundSql;
}

export interface StepReport {
  id: string;
  label: string;
  action: 'anonymise' | 'delete';
  table: string;
  days: number;
  /** Rows due (dry run) or rows changed (apply). */
  rows: number;
  /** Rows kept back for a reason, not counted in `rows`. */
  deferred: number;
  batches: number;
  /** Extra counters from the statement, for example scrubbed refund notes. */
  details: Record<string, number>;
  /** True when `maxBatches` stopped the step: the next run continues. */
  truncated: boolean;
}

export interface RetentionReport {
  mode: 'dry-run' | 'apply';
  steps: StepReport[];
  totalRows: number;
}

const DAYS = 'make_interval(days => $1::int)';

/** A step that deletes the rows matched by `where` (over `table`, parameter `$1` = days). */
function deleteStep(spec: {
  id: string;
  label: string;
  table: string;
  days: number;
  where: string;
  orderBy: string;
  maintenance: boolean;
}): RetentionStep {
  return {
    id: spec.id,
    label: spec.label,
    action: 'delete',
    table: spec.table,
    days: spec.days,
    maintenance: spec.maintenance,
    count: { text: `SELECT count(*)::int AS n FROM ${spec.table} WHERE ${spec.where}`, params: [spec.days] },
    batch: (batchSize: number): BoundSql => ({
      text: `
        WITH gone AS (
          DELETE FROM ${spec.table}
          WHERE id IN (SELECT id FROM ${spec.table} WHERE ${spec.where} ORDER BY ${spec.orderBy} LIMIT $2 FOR UPDATE SKIP LOCKED)
          RETURNING 1
        )
        SELECT count(*)::int AS n FROM gone
      `,
      params: [spec.days, batchSize],
    }),
  };
}

/** The booking steps pick ids with `ib` as the alias; the bound days are `$3`, the batch size `$4`. */
function bookingStep(spec: {
  id: string;
  label: string;
  days: number;
  where: string;
  orderBy: string;
}): RetentionStep {
  const eligible = `ib.anonymised_at IS NULL AND ${spec.where}`;
  const replaceDays = (text: string): string => text.replace(/\$3::int/g, '$1::int');
  return {
    id: spec.id,
    label: spec.label,
    action: 'anonymise',
    table: 'inventory_blocks',
    days: spec.days,
    maintenance: true,
    count: {
      text: `SELECT count(*)::int AS n FROM inventory_blocks ib WHERE ${replaceDays(eligible)} AND NOT ${OPEN_REFUND_SQL}`,
      params: [spec.days],
    },
    deferred: {
      text: `SELECT count(*)::int AS n FROM inventory_blocks ib WHERE ${replaceDays(eligible)} AND ${OPEN_REFUND_SQL}`,
      params: [spec.days],
    },
    batch: (batchSize: number): BoundSql => ({
      text: anonymiseBookingsSql(
        `SELECT ib.id FROM inventory_blocks ib WHERE ${eligible} AND NOT ${OPEN_REFUND_SQL} ORDER BY ${spec.orderBy} LIMIT $4 FOR UPDATE OF ib SKIP LOCKED`,
      ),
      params: [ANONYMISED_NAME, REMOVED_TEXT, spec.days, batchSize],
    }),
  };
}

/**
 * The steps, in the order they run. The audit log is pruned BEFORE it is anonymised, so rows about to be deleted are
 * not rewritten first.
 */
export function buildRetentionSteps(config: RetentionConfig): RetentionStep[] {
  return [
    bookingStep({
      id: 'guest_stays',
      label: 'Guest personal data on stays and staff blocks after check-out',
      days: config.guestDays,
      where: `ib.kind IN ('reservation', 'block') AND ib.check_out < current_date - $3::int`,
      orderBy: 'ib.check_out, ib.id',
    }),
    bookingStep({
      id: 'abandoned_holds',
      label: 'Personal data on abandoned or expired checkouts',
      days: config.holdDays,
      where: `ib.kind = 'hold' AND ib.created_at < now() - make_interval(days => $3::int) AND NOT (ib.status = 'active' AND ib.expires_at IS NOT NULL AND ib.expires_at >= now())`,
      orderBy: 'ib.created_at, ib.id',
    }),
    deleteStep({
      id: 'staff_invites',
      label: 'Closed staff invitations (name and email)',
      table: 'staff_invites',
      days: config.inviteDays,
      where: `COALESCE(accepted_at, revoked_at, expires_at) < now() - ${DAYS}`,
      orderBy: 'created_at, id',
      maintenance: false,
    }),
    deleteStep({
      id: 'staff_sessions',
      label: 'Expired staff sessions',
      table: 'staff_sessions',
      days: config.sessionGraceDays,
      where: `expires_at < now() - ${DAYS}`,
      orderBy: 'expires_at, id',
      maintenance: false,
    }),
    deleteStep({
      id: 'two_factor_challenges',
      label: 'Expired two-factor challenges',
      table: 'staff_two_factor_challenges',
      days: config.sessionGraceDays,
      where: `expires_at < now() - ${DAYS}`,
      orderBy: 'expires_at, id',
      maintenance: false,
    }),
    deleteStep({
      id: 'webhook_events',
      label: 'Finished payment webhook event rows',
      table: 'payment_webhook_events',
      days: config.webhookDays,
      where: `status IN ('processed', 'ignored') AND received_at < now() - ${DAYS}`,
      orderBy: 'received_at, id',
      maintenance: false,
    }),
    deleteStep({
      id: 'audit_prune',
      label: 'Audit rows past the retention period',
      table: 'audit_log',
      days: config.auditRetentionDays,
      where: `created_at < now() - ${DAYS}`,
      orderBy: 'created_at, id',
      maintenance: true,
    }),
    deleteStep({
      id: 'audit_orphans',
      label: 'Audit rows no admin can see (failed sign-ins), past their short period',
      table: 'audit_log',
      days: config.auditOrphanDays,
      where: `organization_id IS NULL AND action NOT LIKE 'privacy.%' AND created_at < now() - ${DAYS}`,
      orderBy: 'created_at, id',
      maintenance: true,
    }),
    auditAnonymiseStep(config.auditAnonymiseDays),
  ];
}

/** Audit rows keep their action, time and target but lose the IP hash and the staff name in their details. */
function auditAnonymiseStep(days: number): RetentionStep {
  const where = `created_at < now() - ${DAYS}
    AND (ip_hash IS NOT NULL OR (metadata->>'actorName' IS NOT NULL AND metadata->>'actorName' <> $2::text))`;
  return {
    id: 'audit_anonymise',
    label: 'Audit rows: remove IP hash and staff name after the first period',
    action: 'anonymise',
    table: 'audit_log',
    days,
    maintenance: true,
    count: { text: `SELECT count(*)::int AS n FROM audit_log WHERE ${where}`, params: [days, REMOVED_TEXT] },
    batch: (batchSize: number): BoundSql => ({
      text: `
        WITH done AS (
          UPDATE audit_log SET ip_hash = NULL,
            metadata = CASE WHEN metadata->>'actorName' IS NOT NULL THEN jsonb_set(metadata, '{actorName}', to_jsonb($2::text)) ELSE metadata END
          WHERE id IN (SELECT id FROM audit_log WHERE ${where} ORDER BY created_at, id LIMIT $3 FOR UPDATE SKIP LOCKED)
          RETURNING 1
        )
        SELECT count(*)::int AS n FROM done
      `,
      params: [days, REMOVED_TEXT, batchSize],
    }),
  };
}

async function count(tx: PrivacyTx, sql: BoundSql): Promise<number> {
  const result = await tx.query<{ n: number }>(sql.text, sql.params);
  return result.rows[0]?.n ?? 0;
}

/** The extra counters of a batch row (everything but `n`). */
function detailsOf(row: Record<string, unknown> | undefined): Record<string, number> {
  const details: Record<string, number> = {};
  for (const [key, value] of Object.entries(row ?? {})) {
    if (key !== 'n' && typeof value === 'number') {
      details[key] = value;
    }
  }
  return details;
}

export interface RunRetentionOptions {
  apply: boolean;
  config: RetentionConfig;
  /** Called after each step, so a long run prints as it goes. */
  onStep?: (report: StepReport) => void;
}

/**
 * Runs the steps. A dry run counts the rows due in a read-only transaction and changes nothing. An apply works in
 * batches of `config.batchSize`, one transaction each, until a batch comes back short or `maxBatches` is reached.
 */
export async function runRetention(db: PrivacyDb, options: RunRetentionOptions): Promise<RetentionReport> {
  const { config } = options;
  const steps: StepReport[] = [];
  for (const step of buildRetentionSteps(config)) {
    const report: StepReport = {
      id: step.id,
      label: step.label,
      action: step.action,
      table: step.table,
      days: step.days,
      rows: 0,
      deferred: 0,
      batches: 0,
      details: {},
      truncated: false,
    };
    if (!options.apply) {
      await db.transaction(
        async (tx: PrivacyTx): Promise<void> => {
          report.rows = await count(tx, step.count);
          report.deferred = step.deferred === undefined ? 0 : await count(tx, step.deferred);
        },
        { readOnly: true },
      );
    } else {
      for (;;) {
        if (report.batches >= config.maxBatches) {
          report.truncated = true;
          break;
        }
        const row = await db.transaction(
          async (tx: PrivacyTx): Promise<Record<string, unknown> | undefined> => {
            const bound = step.batch(config.batchSize);
            return (await tx.query<Record<string, unknown>>(bound.text, bound.params)).rows[0];
          },
          { maintenance: step.maintenance },
        );
        const changed = typeof row?.n === 'number' ? row.n : 0;
        report.batches += 1;
        report.rows += changed;
        for (const [key, value] of Object.entries(detailsOf(row))) {
          report.details[key] = (report.details[key] ?? 0) + value;
        }
        if (changed < config.batchSize) {
          break;
        }
      }
      if (step.deferred !== undefined) {
        const deferred = step.deferred;
        report.deferred = await db.transaction((tx: PrivacyTx): Promise<number> => count(tx, deferred), { readOnly: true });
      }
    }
    steps.push(report);
    options.onStep?.(report);
  }
  return { mode: options.apply ? 'apply' : 'dry-run', steps, totalRows: steps.reduce((sum: number, item: StepReport): number => sum + item.rows, 0) };
}

/** The audit entry a real run leaves behind (counts and periods only, no personal data). Skipped when nothing changed. */
export async function recordRetentionRun(db: PrivacyDb, report: RetentionReport, config: RetentionConfig, operator: string): Promise<boolean> {
  if (report.mode !== 'apply' || report.totalRows === 0) {
    return false;
  }
  const counts: Record<string, number> = {};
  for (const step of report.steps) {
    counts[step.id] = step.rows;
  }
  await db.transaction(async (tx: PrivacyTx): Promise<void> => {
    await tx.query(
      `INSERT INTO audit_log (organization_id, staff_user_id, action, target_type, metadata) VALUES (NULL, NULL, 'privacy.retention_run', 'system', $1::jsonb)`,
      [JSON.stringify({ operator, counts, config })],
    );
  });
  return true;
}
