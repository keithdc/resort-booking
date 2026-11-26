/**
 * @file apps/api/src/shared/privacy/retention.spec.ts
 * The retention job with a fake database: dry run reads only, apply batches, maintenance switch only where needed.
 */

import { DEFAULT_RETENTION } from './privacy-config';
import { fakePrivacyDb, type RecordedStatement } from './privacy-fake-db';
import { buildRetentionSteps, recordRetentionRun, runRetention } from './retention';

const config = { ...DEFAULT_RETENTION, batchSize: 2, maxBatches: 5 };

describe('buildRetentionSteps', () => {
  const steps = buildRetentionSteps(config);

  it('lists every step in order, pruning the audit log before anonymising it', () => {
    expect(steps.map((step) => step.id)).toEqual([
      'guest_stays',
      'abandoned_holds',
      'staff_invites',
      'staff_sessions',
      'two_factor_challenges',
      'webhook_events',
      'audit_prune',
      'audit_orphans',
      'audit_anonymise',
    ]);
  });

  it('needs the maintenance switch exactly for the steps that touch guarded tables', () => {
    const needing = steps.filter((step) => step.maintenance).map((step) => step.id);

    expect(needing).toEqual(['guest_stays', 'abandoned_holds', 'audit_prune', 'audit_orphans', 'audit_anonymise']);
  });

  it('never touches an amount, a status or a currency', () => {
    for (const step of steps) {
      const sql = step.batch(10).text;
      expect(sql).not.toMatch(/amount_cents\s*=|total_cents\s*=|paid_cents\s*=|currency_code\s*=|\bstatus\s*=\s*\$/);
    }
  });

  it('keeps bookings with an open refund out of the booking steps and reports them', () => {
    for (const id of ['guest_stays', 'abandoned_holds']) {
      const step = steps.find((item) => item.id === id);
      expect(step?.count.text).toContain('NOT EXISTS');
      expect(step?.deferred?.text).toContain("r.status IN ('pending', 'failed')");
    }
  });

  it('uses the configured period as a bound parameter, never in the SQL text', () => {
    const guest = steps.find((item) => item.id === 'guest_stays');

    expect(guest?.count.params).toEqual([1095]);
    expect(guest?.batch(7).params.slice(2)).toEqual([1095, 7]);
    expect(guest?.batch(7).text).not.toContain('1095');
  });

  it('never deletes audit rows that record a privacy action in the orphan step', () => {
    expect(steps.find((item) => item.id === 'audit_orphans')?.count.text).toContain("NOT LIKE 'privacy.%'");
  });

  it('leaves payment webhook rows that still need attention', () => {
    expect(steps.find((item) => item.id === 'webhook_events')?.count.text).toContain("status IN ('processed', 'ignored')");
  });
});

describe('runRetention', () => {
  it('a dry run counts in read-only transactions and sends no change', async () => {
    const db = fakePrivacyDb(() => [{ n: 4 }]);

    const report = await runRetention(db, { apply: false, config });

    expect(report.mode).toBe('dry-run');
    expect(report.totalRows).toBe(4 * 9);
    expect(db.transactions.every((tx) => tx.options.readOnly === true && tx.options.maintenance !== true)).toBe(true);
    const sql = db.transactions.flatMap((tx) => tx.statements.map((statement: RecordedStatement) => statement.text)).join('\n');
    expect(sql).not.toMatch(/\b(UPDATE|DELETE)\b/);
  });

  it('apply runs one transaction per batch and stops on a short batch', async () => {
    const answers = [2, 2, 1];
    let index = 0;
    const scripted = fakePrivacyDb((statement) => {
      if (statement.text.includes('UPDATE inventory_blocks ib') && statement.params[2] === 1095) {
        const n = answers[index] ?? 0;
        index += 1;
        return [{ n, refund_notes: 1, change_notes: 0 }];
      }
      return [{ n: 0 }];
    });

    const report = await runRetention(scripted, { apply: true, config });

    const guest = report.steps[0];
    expect(guest?.rows).toBe(5);
    expect(guest?.batches).toBe(3);
    expect(guest?.details).toEqual({ refund_notes: 3, change_notes: 0 });
  });

  it('sets the maintenance switch inside every batch of a guarded step, and not for the others', async () => {
    const db = fakePrivacyDb(() => [{ n: 0 }]);

    await runRetention(db, { apply: true, config });

    const batchTransactions = db.transactions.filter((tx) => tx.options.readOnly !== true);
    expect(batchTransactions).toHaveLength(9);
    expect(batchTransactions.filter((tx) => tx.options.maintenance === true)).toHaveLength(5);
    expect(db.transactions.every((tx) => tx.committed)).toBe(true);
  });

  it('stops a step at maxBatches and says so, so the next run continues', async () => {
    const db = fakePrivacyDb(() => [{ n: config.batchSize }]);

    const report = await runRetention(db, { apply: true, config: { ...config, maxBatches: 2 } });

    expect(report.steps.every((step) => step.batches === 2 && step.truncated)).toBe(true);
  });

  it('is idempotent: a second run that finds nothing changes nothing', async () => {
    const db = fakePrivacyDb(() => [{ n: 0 }]);

    const report = await runRetention(db, { apply: true, config });

    expect(report.totalRows).toBe(0);
    expect(report.steps.every((step) => step.batches === 1)).toBe(true);
  });

  it('records the run in the audit log only when something changed, with counts and no personal data', async () => {
    const db = fakePrivacyDb();
    const none = { mode: 'apply' as const, steps: [], totalRows: 0 };
    const some = { mode: 'apply' as const, steps: [{ id: 'guest_stays', label: '', action: 'anonymise' as const, table: 't', days: 1, rows: 3, deferred: 0, batches: 1, details: {}, truncated: false }], totalRows: 3 };

    expect(await recordRetentionRun(db, none, config, 'cron')).toBe(false);
    expect(await recordRetentionRun(db, { ...some, mode: 'apply' }, config, 'cron')).toBe(true);

    const insert = db.transactions[0]?.statements[0];
    expect(insert?.text).toContain("'privacy.retention_run'");
    expect(String(insert?.params[0])).toContain('"guest_stays":3');
  });
});
