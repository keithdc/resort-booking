# Database access levels

Why: the API used to connect as the Postgres superuser and also changed the schema at start-up. One SQL injection or one
bug would have been full control of the server (`docs/10-security-review.md`, S-05). The database now has three roles, and
the running API can only read and write rows.

## The three roles

| Role | Used by | Can | Cannot |
| --- | --- | --- | --- |
| `resort_owner` | `npm run migrate` only (and start-up migrations if you switch them on) | owns every table, view and sequence; changes the schema | be a superuser, create roles or databases |
| `resort_app` | the API, at run time (`DATABASE_URL`) | `SELECT/INSERT/UPDATE/DELETE` on the tables (except the append-only ones below), use sequences, read `schema_migrations` | `CREATE`, `DROP`, `ALTER`, `TRUNCATE`, write to `schema_migrations`, `UPDATE` or `DELETE` the audit log, `DELETE` payments or refunds, change what a payment or refund IS, create roles, run a statement longer than 15 s |
| `resort_readonly` | reports, BI, an accountant (`READONLY_DATABASE_URL`) | read the `report_*` views and a few catalogue tables | read any guest or bank data, write anything |

All three: `NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`, `search_path = public`, a connection limit.
The schema `public` belongs to `resort_owner`; `PUBLIC` has no rights on it and nobody can connect to the database except
these roles.

Role limits (`ALTER ROLE ... SET`), so a slow query or a forgotten transaction cannot hold locks and stall bookings:

| Setting | `resort_app` | `resort_readonly` | `resort_owner` |
| --- | --- | --- | --- |
| `statement_timeout` | 15 s | 30 s | none (migrations can be long) |
| `lock_timeout` | 3 s | none | 30 s |
| `idle_in_transaction_session_timeout` | 20 s | none | none |

### Append-only records (docs/13 R2-05, migrations 032 to 034)

The audit log and the money tables can only grow and move forward. Two layers, so a bug, an injection or a mistake by the owner cannot rewrite history:

| Table | `resort_app` privileges | Trigger (any role, the owner included) |
| --- | --- | --- |
| `audit_log` | `SELECT`, `INSERT` | no `UPDATE`, `DELETE`, `TRUNCATE`; the one exception is `staff_user_id ON DELETE SET NULL` of an erased staff account |
| `booking_changes` | `SELECT`, `INSERT` | no `UPDATE`, `DELETE`, `TRUNCATE` |
| `payments` | `SELECT`, `INSERT`, `UPDATE (status, failure_reason, inventory_block_id, updated_at)` | no `DELETE`, `TRUNCATE`; amount, currency, provider, provider reference, organization, property, purpose and payload never change; `inventory_block_id` moves only on a succeeded payment (a date change); status `requires_payment -> succeeded \| failed \| cancelled`, `failed \| cancelled -> succeeded` (a late success, docs/14), a succeeded payment never changes |
| `refunds` | `SELECT`, `INSERT`, `UPDATE` of `status, provider, provider_ref, failure_reason, resolution_note, resolved_by_staff_id, resolved_at, updated_at, processing_started_at, attempts, key_generation` | no `DELETE`, `TRUNCATE`; amount, percent, currency, links, kind, reason and who created it never change; status `pending -> succeeded \| failed`, `failed -> pending \| succeeded`, a succeeded refund never changes; the provider can only change to `manual` |
| `privacy_erasure_ledger` (migration 038) | **no access** (owner-only, `OWNER_ONLY_TABLES` in `roles.ts`) | no `UPDATE`, `DELETE`, `TRUNCATE` for any role (the maintenance switch lifts it) |
| `payment_webhook_events` | `SELECT`, `INSERT`, `UPDATE (status, attempts, error, updated_at, processed_at)` | none (the unique key and the column grant are the guard) |

The privileges live in `RESTRICTED_TABLES` (`shared/database/roles.ts`) and are applied by `db:setup-roles` and again **after every migration run** (`restrictFinancialTables` in `applyPendingMigrations`), because a table the owner creates would otherwise carry the blanket default grant. The triggers need no role name and are in `032_financial_record_guards.sql`.

**Escape hatch** (a retention or erasure job, run as the owner, never by the API): inside one transaction run `SET LOCAL resort.record_maintenance = 'on';` before the statement. The setting is transaction-local, so it cannot stay on. Since migration 044 the guards honour it only for the OWNER of the table (a member of the role that owns it, or a superuser; `resort_maintenance_allowed`): `resort_app` and `resort_readonly` can set it and nothing changes (docs/13 R6-01). Any use should be written down (who, when, why, how many rows) outside the database; the audit log cannot record the deletion of its own rows.

**The one sanctioned user of the switch is the privacy tooling** (`docs/15-data-retention-and-backups.md`): `npm run privacy:retention`, `privacy:erase-guest`, `privacy:erase-staff` and `privacy:reapply-erasures`, in `apps/api/src/shared/privacy/`. They connect with `MIGRATION_DATABASE_URL` (the owner), refuse any role that cannot delete from `audit_log` (so `resort_app` is refused up front), and set the switch inside the transaction of each batch, only for steps that touch an append-only table. They change personal data and delete old audit rows; they never change an amount, a currency or a status, and they print counts and write `privacy.*` audit entries. Do not copy the switch into other code.

`db:verify-roles` proves the privilege side (it connects as `resort_app` and must be refused an `UPDATE` of `audit_log`, an amount change, a `DELETE` of payments or refunds, and must still be allowed to append and settle); `database-roles.integration.spec.ts` proves the triggers and the replay of the migrations on a throwaway database.

### What the read-only role sees

Views created by migration 027 (they run with the owner's rights, so the role needs no right on the tables behind them):

| View | Leaves out |
| --- | --- |
| `report_bookings` | guest name, email, phone, notes, price and policy snapshots, the abuse-limit hash, who cancelled |
| `report_organizations` | legal name and address, VAT number, IBAN, BIC, bank account name, contact emails and phone, owner name |
| `report_refunds` | free-text reasons and notes, provider references, who created or resolved it |
| `report_payments` | provider reference, failure reason, payload |

Plus `properties`, `houses`, `cancellation_tiers`, `rate_periods` (public catalogue data). Anything else: permission denied.

## Set it up in development

The old single-URL setup keeps working (the API warns that it connects as a superuser). To move to the roles:

1. Start the database containers (the compose file now publishes Postgres and Redis on `127.0.0.1` only; recreate them once
   with `docker compose up -d --force-recreate postgres redis` for the new binding to apply).
2. Put the admin connection and three new passwords in `apps/api/.env` (use `openssl rand -base64 24` for each):

   ```
   DATABASE_ADMIN_URL=postgres://resort:resort@localhost:5433/resort_booking
   DB_OWNER_PASSWORD=...
   DB_APP_PASSWORD=...
   DB_READONLY_PASSWORD=...
   ```

3. `npm run migrate` (as before, applies anything pending), then `npm run db:setup-roles -w @resort-booking/api`.
   It runs in one transaction and prints every statement with passwords hidden. Safe to run again.
4. Point the API at the roles in `apps/api/.env`:

   ```
   DATABASE_URL=postgres://resort_app:<DB_APP_PASSWORD>@localhost:5433/resort_booking
   MIGRATION_DATABASE_URL=postgres://resort_owner:<DB_OWNER_PASSWORD>@localhost:5433/resort_booking
   READONLY_DATABASE_URL=postgres://resort_readonly:<DB_READONLY_PASSWORD>@localhost:5433/resort_booking
   ```

   Remove `DATABASE_ADMIN_URL` and the three `DB_*_PASSWORD` lines again once the roles exist (the API never needs them).
5. `npm run db:verify-roles -w @resort-booking/api` proves it: it connects as `resort_app` and `resort_readonly` and runs
   statements that must work and statements that must be refused (create, drop, alter, truncate a table, write the
   migration ledger, create a role, read guest emails or the IBAN, exceed the statement timeout). Every probe runs inside a
   transaction that is rolled back, so it is safe on a real database. Add `--skip-timeout` to skip the 15 s timeout probe.
   Run against a superuser URL it FAILS, which is how you notice a wrong `DATABASE_URL`.

After a migration that adds a table: nothing to do for `resort_app` (default privileges cover tables the owner creates; the append-only tables above are narrowed again by the migration runner).
After a migration that adds a `report_*` view: run `db:setup-roles` again so the read-only role gets `SELECT` on it.

## What the API does at start-up

- `MIGRATION_DATABASE_URL` is used only for applying migrations. If it is not set, migrations use `DATABASE_URL` and the API
  logs a warning (fine in development).
- `RUN_MIGRATIONS_ON_START`: default `true` in development and tests, **`false` in production**. When it is on, the API first
  only *reads* which migrations are pending, so an app-role API starts fine when nothing is pending; it connects as the owner
  only when something is.
- Whatever the setting, the API still refuses to start when the database has migrations this build does not know (a stale
  build), and checks again every minute.
- After connecting it asks Postgres who it is. **Production refuses to start** if the role is a superuser, can create roles
  or databases, or owns tables. Development prints the same findings as warnings.
- Production also refuses to start if `MIGRATION_DATABASE_URL` is missing, equals the API login, the API login looks like a
  superuser name (`postgres`, `root`, `admin`), a database on another machine is reached without TLS, or start-up
  migrations are on without the owner URL.
- Pool: `DATABASE_POOL_MAX` (10), `DATABASE_CONNECTION_TIMEOUT_MS` (5000), `DATABASE_IDLE_TIMEOUT_MS` (30000),
  `DATABASE_SSL` (`true` verifies the certificate, `no-verify` encrypts only; `sslmode=require` in the URL also works).
  Connections are named `resort-api` in `pg_stat_activity`.

## Production checklist

- [ ] Postgres and Redis are **not** reachable from the internet (private network or localhost only). Compose binds to
      `127.0.0.1`; on a server use a firewall or a private network.
- [ ] TLS on the database connection (`DATABASE_SSL=true`) unless the database is on the same machine.
- [ ] `db:setup-roles` run as the Postgres admin; strong, unique passwords for the three roles (a secrets manager, not a file
      in the repository).
- [ ] `NODE_ENV=production` (exactly: unset or any other value makes the API refuse to start), no `ALLOW_MOCK_PAYMENTS`, `IP_HASH_SALT` set (32+ chars), `DATABASE_URL` = `resort_app`, `MIGRATION_DATABASE_URL` = `resort_owner`,
      `RUN_MIGRATIONS_ON_START` unset (or `false`).
- [ ] Deploy order: `npm run migrate` (owner) first, then `db:setup-roles` if the release adds `report_*` views, then start the
      API.
- [ ] `db:verify-roles` is part of the release check.
- [ ] The Redis password is set (`REDIS_PASSWORD`, and `REDIS_URL=redis://:<password>@host:port`).
- [ ] The admin (superuser) credentials are not on the app server at all.

## Backups

Dump with the **owner** role (it can read everything and owns the objects), never with the read-only or app role:
`pg_dump "$MIGRATION_DATABASE_URL" --format=custom --file=resort-$(date +%F).dump`. Restore into an empty database, then run
`db:setup-roles` once (roles are cluster-wide and are not in a single-database dump). A dump contains guest personal data and the
IBAN: store it encrypted, restrict who can read it, and apply the retention rules in `docs/05-eu-compliance-and-payments.md`.
Test a restore regularly: `scripts/backup-db.sh` and `scripts/restore-drill.sh` do the dump (encrypted, 0600, pruned) and the monthly drill; schedule, retention, RPO/RTO and the restore runbook are in `docs/15-data-retention-and-backups.md`. After restoring an older backup run `npm run privacy:reapply-erasures -- --apply`.

## Rotating a password

1. Generate the new password.
2. `ALTER ROLE resort_app PASSWORD '...'` as the admin (or put the new value in `DB_APP_PASSWORD` and run `db:setup-roles`).
3. Update `DATABASE_URL` where the API runs and restart it. Same for `resort_owner` / `MIGRATION_DATABASE_URL` and
   `resort_readonly`.

## How migrations are applied (docs/13 R2-22)

`applyPendingMigrations` (`shared/database/migration-files.ts`, used by `npm run migrate` and by start-up migrations):

- **One runner at a time.** A session advisory lock is held from the first file to the last; a second runner waits (up to 60 s,
  then a clear error) and then finds nothing pending.
- **History cannot be edited quietly.** `schema_migrations.checksum` holds the SHA-256 of each file (line endings normalised),
  written in the same transaction as the file. Before anything runs, every applied file is compared with its checksum. A
  mismatch stops `npm run migrate` and every non-development start, naming the file: put the change in a NEW migration (for a
  reviewed, harmless edit such as a comment: `UPDATE schema_migrations SET checksum = '<new sha>' WHERE id = '<file>'`). A
  development start only logs it. Rows applied before checksums existed get the checksum of the file as it is at the first run.
- **One transaction per file.** A failing file is rolled back completely and named in the error; later files are not run and
  the lock is released.
- **Constraints on existing data** (035 and 036): added `NOT VALID` and validated only when no existing row breaks them,
  otherwise a WARNING says which and how many, and the constraint stays enforced for new rows (`ALTER TABLE ... VALIDATE
  CONSTRAINT` after correcting the rows). Helper functions are created and dropped inside the migration, never `pg_temp` (the
  roles have no `TEMP` right).

## How a new table gets its privileges

Migrations run as `resort_owner`. `db:setup-roles` sets `ALTER DEFAULT PRIVILEGES FOR ROLE resort_owner`, so every table the owner
creates later is readable and writable by `resort_app` straight away, and its sequences are usable. Two exceptions are handled
in code: `schema_migrations` is locked down after every migration run (`lockdownMigrationTable`), and the read-only role gets only
the `report_*` views listed above (re-run `db:setup-roles` after adding one).

## Not done yet: row-level security

Almost every table carries `organization_id`, so Postgres row-level security would be a second wall between organizations
(`docs/10-security-review.md`, S-04). It needs `SET LOCAL app.organization_id` inside a transaction on every request, and the
shared pool (`DatabaseService.query`) does not run requests in a transaction today. The organization checks in the API
(`TenantGuard` and the tenant isolation suite) are the wall for now; RLS is defence in depth to add later.

## Tests

- Unit tests (no database): role statements (`roles.spec.ts`, including the append-only privileges), settings and TLS rules (`database-settings.spec.ts`), the role
  safety check (`role-safety.spec.ts`, `database-safety.service.spec.ts`), the environment rules
  (`database-environment.spec.ts`), the migration connection rules (`migration-runner.spec.ts`, `migration-files.spec.ts`, `migration-apply.spec.ts`, `migrations/tenant-constraints.spec.ts`), the
  probes (`role-probes.spec.ts`).
- Integration test against a real Postgres, skipped unless `DATABASE_ADMIN_URL` is set:
  `DATABASE_ADMIN_URL=postgres://resort:resort@localhost:5433/postgres npm run test:db -w @resort-booking/api`. It creates a
  throwaway database and test roles, proves every probe, the default privileges, the idempotent re-run and the production
  role check, then drops them.
- A second integration test, `migration-tooling.integration.spec.ts` (same `DATABASE_ADMIN_URL`, `npx jest migration-tooling.integration`
  in `apps/api`): two runners at once, an edited migration, a failing file rolled back, the replay of 035 and 036, and the
  composite keys and checks as the API role.
