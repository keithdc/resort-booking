/**
 * @file apps/api/src/shared/database/role-probes.ts
 * @shared Statements that must work, and statements that must be refused, for each database role
 * @dependencies none (any connection with a `query(sql)` method)
 */

/** All the probes need from a connection: send a statement. A pg `Client` fits. */
export interface ProbeConnection {
  query(sql: string): Promise<unknown>;
}

export type ProbeRole = 'app' | 'readonly';

export interface RoleProbe {
  role: ProbeRole;
  name: string;
  sql: string;
  /** `allowed`, or the Postgres error code the statement must fail with. */
  expect: 'allowed' | { deniedWith: string };
  /** Takes about as long as the role's statement timeout. */
  slow?: boolean;
}

export interface ProbeOutcome {
  probe: RoleProbe;
  ok: boolean;
  /** What happened, for the report: "allowed", or the error code and message. */
  detail: string;
}

/** insufficient_privilege */
const NO_RIGHT = '42501';
/** undefined_column */
const NO_COLUMN = '42703';
/** query_canceled: the statement timeout fired */
const CANCELED = '57014';

/**
 * Every probe. They run inside a transaction that is rolled back, so even a statement that wrongly succeeds (a role
 * that is too powerful) changes nothing.
 */
export const ROLE_PROBES: readonly RoleProbe[] = [
  { role: 'app', name: 'app can read bookings', sql: 'SELECT count(*) FROM inventory_blocks', expect: 'allowed' },
  { role: 'app', name: 'app can insert rows', sql: "INSERT INTO organizations (name) VALUES ('role-probe')", expect: 'allowed' },
  { role: 'app', name: 'app can update rows', sql: "UPDATE organizations SET name = name WHERE name = 'role-probe'", expect: 'allowed' },
  { role: 'app', name: 'app can delete rows', sql: "DELETE FROM organizations WHERE name = 'role-probe'", expect: 'allowed' },
  { role: 'app', name: 'app can read the migration ledger', sql: 'SELECT id FROM schema_migrations LIMIT 1', expect: 'allowed' },
  { role: 'app', name: 'app cannot create a table', sql: 'CREATE TABLE role_probe_table (id integer)', expect: { deniedWith: NO_RIGHT } },
  { role: 'app', name: 'app cannot drop a table', sql: 'DROP TABLE house_photos', expect: { deniedWith: NO_RIGHT } },
  { role: 'app', name: 'app cannot alter a table', sql: 'ALTER TABLE houses ADD COLUMN role_probe_column integer', expect: { deniedWith: NO_RIGHT } },
  { role: 'app', name: 'app cannot truncate a table', sql: 'TRUNCATE houses CASCADE', expect: { deniedWith: NO_RIGHT } },
  { role: 'app', name: 'app cannot drop the schema', sql: 'DROP SCHEMA public CASCADE', expect: { deniedWith: NO_RIGHT } },
  { role: 'app', name: 'app cannot write the migration ledger', sql: "INSERT INTO schema_migrations (id) VALUES ('999_role_probe.sql')", expect: { deniedWith: NO_RIGHT } },
  { role: 'app', name: 'app cannot erase the migration ledger', sql: 'DELETE FROM schema_migrations', expect: { deniedWith: NO_RIGHT } },
  { role: 'app', name: 'app cannot create a role', sql: 'CREATE ROLE role_probe_role', expect: { deniedWith: NO_RIGHT } },
  // Append-only records (docs/13 R2-05): the audit log, the money tables and their history.
  { role: 'app', name: 'app can append to the audit log', sql: "INSERT INTO audit_log (action) VALUES ('role_probe')", expect: 'allowed' },
  { role: 'app', name: 'app can read the audit log', sql: 'SELECT count(*) FROM audit_log', expect: 'allowed' },
  { role: 'app', name: 'app cannot rewrite the audit log', sql: "UPDATE audit_log SET action = 'role_probe'", expect: { deniedWith: NO_RIGHT } },
  { role: 'app', name: 'app cannot delete from the audit log', sql: 'DELETE FROM audit_log', expect: { deniedWith: NO_RIGHT } },
  { role: 'app', name: 'app can settle a payment', sql: "UPDATE payments SET status = status, updated_at = now() WHERE id = '00000000-0000-0000-0000-000000000000'", expect: 'allowed' },
  { role: 'app', name: 'app cannot change a payment amount', sql: 'UPDATE payments SET amount_cents = 0', expect: { deniedWith: NO_RIGHT } },
  { role: 'app', name: 'app cannot change a payment currency', sql: "UPDATE payments SET currency_code = 'XXX'", expect: { deniedWith: NO_RIGHT } },
  { role: 'app', name: 'app cannot delete payments', sql: 'DELETE FROM payments', expect: { deniedWith: NO_RIGHT } },
  { role: 'app', name: 'app can settle a refund', sql: "UPDATE refunds SET status = status, updated_at = now() WHERE id = '00000000-0000-0000-0000-000000000000'", expect: 'allowed' },
  { role: 'app', name: 'app cannot change a refund amount', sql: 'UPDATE refunds SET amount_cents = 0', expect: { deniedWith: NO_RIGHT } },
  { role: 'app', name: 'app cannot delete refunds', sql: 'DELETE FROM refunds', expect: { deniedWith: NO_RIGHT } },
  { role: 'app', name: 'app cannot rewrite booking history', sql: 'UPDATE booking_changes SET fee_cents = 0', expect: { deniedWith: NO_RIGHT } },
  { role: 'app', name: 'app cannot delete booking history', sql: 'DELETE FROM booking_changes', expect: { deniedWith: NO_RIGHT } },
  { role: 'app', name: 'app can record a webhook event', sql: "INSERT INTO payment_webhook_events (provider, provider_event_id, type, payload_sha256) VALUES ('probe', 'evt_probe', 'probe', repeat('a', 64))", expect: 'allowed' },
  { role: 'app', name: 'app cannot delete webhook events', sql: 'DELETE FROM payment_webhook_events', expect: { deniedWith: NO_RIGHT } },
  { role: 'app', name: 'app cannot rewrite what a webhook event was', sql: "UPDATE payment_webhook_events SET provider_event_id = 'x'", expect: { deniedWith: NO_RIGHT } },
  { role: 'app', name: 'app cannot change the price of an extra on a booking', sql: 'UPDATE reservation_extras SET unit_price_cents = 0', expect: { deniedWith: NO_RIGHT } },
  { role: 'app', name: 'app cannot delete extras on a booking', sql: 'DELETE FROM reservation_extras', expect: { deniedWith: NO_RIGHT } },
  { role: 'app', name: 'app cannot delete staff notes', sql: 'DELETE FROM booking_staff_notes', expect: { deniedWith: NO_RIGHT } },
  { role: 'app', name: 'app cannot edit the text of a staff note', sql: "UPDATE booking_staff_notes SET body = 'x'", expect: { deniedWith: NO_RIGHT } },
  // Owner-only: the erasure ledger (docs/15) holds keyed hashes of erased people; the API never needs it.
  { role: 'app', name: 'app cannot read the erasure ledger', sql: 'SELECT count(*) FROM privacy_erasure_ledger', expect: { deniedWith: NO_RIGHT } },
  { role: 'app', name: 'app cannot write the erasure ledger', sql: "INSERT INTO privacy_erasure_ledger (subject_kind, subject_hash, operator) VALUES ('guest', repeat('a', 64), 'probe')", expect: { deniedWith: NO_RIGHT } },
  {
    role: 'app',
    name: 'app is stopped by the statement timeout',
    sql: 'SELECT pg_sleep(20)',
    expect: { deniedWith: CANCELED },
    slow: true,
  },
  { role: 'readonly', name: 'read-only can read the booking report', sql: 'SELECT count(*) FROM report_bookings', expect: 'allowed' },
  { role: 'readonly', name: 'read-only can read the organization report', sql: 'SELECT count(*) FROM report_organizations', expect: 'allowed' },
  { role: 'readonly', name: 'read-only cannot read guest emails in the table', sql: 'SELECT booker_email FROM inventory_blocks', expect: { deniedWith: NO_RIGHT } },
  { role: 'readonly', name: 'read-only cannot read guest emails in the report', sql: 'SELECT booker_email FROM report_bookings', expect: { deniedWith: NO_COLUMN } },
  { role: 'readonly', name: 'read-only cannot read guest phones in the report', sql: 'SELECT booker_phone FROM report_bookings', expect: { deniedWith: NO_COLUMN } },
  { role: 'readonly', name: 'read-only cannot read the bank account in the table', sql: 'SELECT iban FROM organizations', expect: { deniedWith: NO_RIGHT } },
  { role: 'readonly', name: 'read-only cannot read the bank account in the report', sql: 'SELECT iban FROM report_organizations', expect: { deniedWith: NO_COLUMN } },
  { role: 'readonly', name: 'read-only cannot read staff accounts', sql: 'SELECT password_hash FROM staff_users', expect: { deniedWith: NO_RIGHT } },
  { role: 'readonly', name: 'read-only cannot write', sql: "UPDATE organizations SET name = 'x'", expect: { deniedWith: NO_RIGHT } },
  { role: 'readonly', name: 'read-only cannot create a table', sql: 'CREATE TABLE role_probe_table (id integer)', expect: { deniedWith: NO_RIGHT } },
];

/**
 * Runs the probes of one role on an open connection. Each probe is its own transaction, always rolled back.
 */
export async function runProbes(
  client: ProbeConnection,
  role: ProbeRole,
  options: { skipSlow?: boolean } = {},
): Promise<ProbeOutcome[]> {
  const outcomes: ProbeOutcome[] = [];
  for (const probe of ROLE_PROBES.filter((item: RoleProbe): boolean => item.role === role)) {
    if (probe.slow === true && options.skipSlow === true) {
      continue;
    }
    outcomes.push(await runProbe(client, probe));
  }
  return outcomes;
}

async function runProbe(client: ProbeConnection, probe: RoleProbe): Promise<ProbeOutcome> {
  await client.query('BEGIN');
  try {
    await client.query(probe.sql);
    return {
      probe,
      ok: probe.expect === 'allowed',
      detail: probe.expect === 'allowed' ? 'allowed' : `WRONGLY ALLOWED (expected error ${probe.expect.deniedWith})`,
    };
  } catch (error: unknown) {
    const code = errorCode(error);
    const message = error instanceof Error ? error.message : 'unknown error';
    const ok = probe.expect !== 'allowed' && probe.expect.deniedWith === code;
    return { probe, ok, detail: `${code ?? 'no code'}: ${message}` };
  } finally {
    await client.query('ROLLBACK').catch((): undefined => undefined);
  }
}

function errorCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return typeof error.code === 'string' ? error.code : null;
  }
  return null;
}
