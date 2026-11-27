/**
 * @file apps/api/src/shared/privacy/privacy-cli.ts
 * @shared Entry for `npm run privacy:*`: retention, guest erasure and export, staff erasure, re-applying erasures after a restore
 * @dependencies pg, dotenv, privacy modules
 *
 * Runs as the OWNER role (MIGRATION_DATABASE_URL) because the audit log and money history are append-only for everyone
 * else. It refuses the API's role (resort_app), refuses to start without a database URL, and never prints an email, a
 * name or a connection password. Dry run is the default; `--apply` acts.
 */

import { config } from 'dotenv';
import { userInfo } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import { describeUrl } from '../database/database-urls';
import { eraseGuest, reapplyErasures, type ErasureReceipt, type GuestPlanItem } from './erase-guest';
import { eraseStaff, type StaffErasureReceipt } from './erase-staff';
import { assertSafeOutputPath, collectGuestExport, countExport, writeExportFile } from './export-guest';
import { readRetentionConfig } from './privacy-config';
import { poolPrivacyDb, type PrivacyDb, type PrivacyTx } from './privacy-db';
import { parsePrivacyArgs, type PrivacyArgs } from './privacy-cli-args';
import { isPlausibleEmail, resolvePrivacySalt } from './privacy-hash';
import { recordRetentionRun, runRetention, type StepReport } from './retention';

config({ path: join(__dirname, '../../../.env') });

/** The rights the commands need. A role that lacks them (resort_app) is refused up front with a clear message. */
const PREFLIGHT_SQL = `
  SELECT current_user::text AS role,
         has_table_privilege(current_user, 'audit_log', 'DELETE') AS can_delete_audit,
         has_table_privilege(current_user, 'privacy_erasure_ledger', 'INSERT') AS can_write_ledger,
         EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inventory_blocks' AND column_name = 'anonymised_at') AS has_column
`;

/** Throws unless the connection is the owner (or equivalent) on a database that has migrations 037 and 038. */
export async function preflight(db: PrivacyDb): Promise<string> {
  const row = await db.transaction(
    async (tx: PrivacyTx) =>
      (await tx.query<{ role: string; can_delete_audit: boolean; can_write_ledger: boolean; has_column: boolean }>(PREFLIGHT_SQL)).rows[0],
    { readOnly: true },
  );
  if (row === undefined || !row.has_column) {
    throw new Error('The database has no inventory_blocks.anonymised_at: run `npm run migrate` (migrations 037 and 038) first.');
  }
  if (!row.can_delete_audit || !row.can_write_ledger) {
    throw new Error(`The role "${row.role}" is not allowed to run this: use the OWNER role (MIGRATION_DATABASE_URL), never the API's DATABASE_URL.`);
  }
  return row.role;
}

function line(text: string): void {
  process.stdout.write(`${text}\n`);
}

function printRetention(report: StepReport): void {
  const verb = report.action === 'delete' ? 'delete' : 'anonymise';
  const note = report.deferred > 0 ? `, ${String(report.deferred)} kept back (open refund)` : '';
  const more = Object.entries(report.details).map(([key, value]: [string, number]): string => `${key}=${String(value)}`).join(' ');
  line(`  ${report.id.padEnd(22)} ${verb.padEnd(9)} ${String(report.rows).padStart(7)} row(s)  [${report.table}, >${String(report.days)} d, ${String(report.batches)} batch(es)${note}]${more === '' ? '' : ` ${more}`}${report.truncated ? '  TRUNCATED: run again' : ''}`);
}

function printGuest(receipt: ErasureReceipt): void {
  const row = (item: GuestPlanItem): string => `    ${item.booking.reference}  ${item.booking.kind}/${item.booking.status}  ${item.booking.checkIn} to ${item.booking.checkOut}${item.reasons.length > 0 ? `  (${item.reasons.join(', ')})` : ''}`;
  line(`Guest erasure ${receipt.mode === 'apply' ? 'RECEIPT' : '(dry run, nothing changed)'}  subject ${receipt.subjectHashPrefix}...  operator ${receipt.operator}`);
  line(`  bookings found: ${String(receipt.found)}   already anonymised: ${String(receipt.alreadyDone)}`);
  line(`  ${receipt.mode === 'apply' ? 'anonymised' : 'would anonymise'}: ${String(receipt.erased.length)}`);
  receipt.erased.forEach((item: GuestPlanItem): void => line(row(item)));
  line(`  skipped: ${String(receipt.skipped.length)}`);
  receipt.skipped.forEach((item: GuestPlanItem): void => line(row(item)));
  if (receipt.mode === 'apply') {
    line(`  refund notes scrubbed: ${String(receipt.refundNotesScrubbed)}   date-change notes scrubbed: ${String(receipt.changeNotesScrubbed)}   staff notes scrubbed: ${String(receipt.staffNotesScrubbed)}   coupon email keys cleared: ${String(receipt.emailKeysCleared)}`);
    line('  Kept by law: dates, amounts, currency, status, payments, refunds and the booking reference (no name, email, phone or note).');
    line('  Backups made before today still hold this person until they expire; after a restore run `npm run privacy:reapply-erasures`.');
  }
  if (receipt.skipped.length > 0) {
    line('  Skipped bookings keep their data for now: re-run after the stay or refund is settled, or add --force-future if the person insists.');
  }
}

function printStaff(receipt: StaffErasureReceipt): void {
  line(`Staff erasure ${receipt.mode === 'apply' ? 'RECEIPT' : '(dry run, nothing changed)'}  subject ${receipt.subjectHashPrefix}...  operator ${receipt.operator}`);
  if (!receipt.found) {
    line('  no staff account with that email.');
  } else if (receipt.refused === 'last_admin') {
    line('  REFUSED: this is the last active admin of the organization. Invite or promote another admin first.');
  } else if (receipt.mode === 'apply') {
    line(`  account deactivated and anonymised; sessions removed: ${String(receipt.sessionsRemoved)}; invites removed: ${String(receipt.invitesRemoved)}; audit rows scrubbed: ${String(receipt.auditRowsScrubbed)}`);
  } else {
    line('  would deactivate and anonymise the account, remove its sessions, two-factor data and invites, and scrub its audit rows.');
  }
}

async function run(args: PrivacyArgs): Promise<number> {
  const url = process.env.MIGRATION_DATABASE_URL?.trim() ?? '';
  if (url === '') {
    throw new Error('MIGRATION_DATABASE_URL (the OWNER role) is required. The API role cannot run privacy commands.');
  }
  const operator = (args.operator ?? userInfo().username).slice(0, 80);
  const pool = new Pool({ connectionString: url, max: 1, application_name: 'resort-privacy' });
  try {
    const db = poolPrivacyDb(pool);
    const role = await preflight(db);
    line(`Connected as ${describeUrl(url)} (role ${role}). Mode: ${args.apply ? 'APPLY' : 'dry run'}.`);
    const salt = (): string => resolvePrivacySalt(process.env);
    const email = args.email ?? '';
    if (args.email !== null && !isPlausibleEmail(email)) {
      throw new Error('--email is not a plausible email address.');
    }
    switch (args.command) {
      case 'retention': {
        const settings = readRetentionConfig(process.env);
        const report = await runRetention(db, { apply: args.apply, config: settings, onStep: printRetention });
        line(`${args.apply ? 'Changed' : 'Due'}: ${String(report.totalRows)} row(s) in total.`);
        if (args.apply && (await recordRetentionRun(db, report, settings, operator))) {
          line('Run recorded in the audit log (privacy.retention_run).');
        }
        if (!args.apply) {
          line('Dry run: nothing was changed. Add --apply to act.');
        }
        return report.steps.some((step: StepReport): boolean => step.truncated) ? 2 : 0;
      }
      case 'erase-guest': {
        const receipt = await eraseGuest(db, { email, apply: args.apply, forceFuture: args.forceFuture, operator, salt: salt() });
        printGuest(receipt);
        return receipt.skipped.length > 0 ? 3 : 0;
      }
      case 'export-guest': {
        const path = assertSafeOutputPath(args.out ?? undefined);
        const data = await collectGuestExport(db, email);
        await writeExportFile(path, data);
        const counts = countExport(data);
        line(`Export written to ${path} (mode 0600): ${Object.entries(counts).map(([key, value]: [string, number]): string => `${key}=${String(value)}`).join(' ')}.`);
        line('The file holds personal data: send it to the person securely and delete your copy.');
        return counts.bookings === 0 ? 4 : 0;
      }
      case 'erase-staff': {
        const receipt = await eraseStaff(db, { email, apply: args.apply, operator, salt: salt() });
        printStaff(receipt);
        return receipt.refused === null && receipt.found ? 0 : 3;
      }
      case 'reapply-erasures': {
        const report = await reapplyErasures(db, { apply: args.apply, salt: salt() });
        line(`Ledger entries: ${String(report.ledgerEntries)}; emails still held that match: ${String(report.emailsMatched)}; bookings anonymised: ${String(report.bookingsAnonymised)}.`);
        return 0;
      }
    }
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  let args: PrivacyArgs;
  try {
    args = parsePrivacyArgs(process.argv.slice(2));
  } catch (error: unknown) {
    process.stderr.write(`${error instanceof Error ? error.message : 'bad arguments'}\n`);
    process.exit(64);
  }
  run(args).then(
    (code: number): void => {
      process.exit(code);
    },
    (error: unknown): void => {
      process.stderr.write(`${error instanceof Error ? error.message : 'privacy command failed'}\n`);
      process.exit(1);
    },
  );
}
