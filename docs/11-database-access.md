# Database access levels

Why: the API used to connect as the Postgres superuser and also changed the schema at start-up. One SQL injection or one
bug would have been full control of the server (`docs/10-security-review.md`, S-05). The database now has three roles, and
the running API can only read and write rows.

## The three roles

| Role | Used by | Can | Cannot |
| --- | --- | --- | --- |
| `resort_owner` | `npm run migrate` only (and start-up migrations if you switch them on) | owns every table, view and sequence; changes the schema | be a superuser, create roles or databases |
| `resort_app` | the API, at run time (`DATABASE_URL`) | `SELECT/INSERT/UPDATE/DELETE` on the tables, use sequences, read `schema_migrations` | `CREATE`, `DROP`, `ALTER`, `TRUNCATE`, write to `schema_migrations`, create roles, run a statement longer than 15 s |
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

After a migration that adds a table: nothing to do for `resort_app` (default privileges cover tables the owner creates).
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
- [ ] `NODE_ENV=production`, `DATABASE_URL` = `resort_app`, `MIGRATION_DATABASE_URL` = `resort_owner`,
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
Test a restore regularly.

## Rotating a password

1. Generate the new password.
2. `ALTER ROLE resort_app PASSWORD '...'` as the admin (or put the new value in `DB_APP_PASSWORD` and run `db:setup-roles`).
3. Update `DATABASE_URL` where the API runs and restart it. Same for `resort_owner` / `MIGRATION_DATABASE_URL` and
   `resort_readonly`.

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

- Unit tests (no database): role statements (`roles.spec.ts`), settings and TLS rules (`database-settings.spec.ts`), the role
  safety check (`role-safety.spec.ts`, `database-safety.service.spec.ts`), the environment rules
  (`database-environment.spec.ts`), the migration connection rules (`migration-runner.spec.ts`, `migration-files.spec.ts`), the
  probes (`role-probes.spec.ts`).
- Integration test against a real Postgres, skipped unless `DATABASE_ADMIN_URL` is set:
  `DATABASE_ADMIN_URL=postgres://resort:resort@localhost:5433/postgres npm run test:db -w @resort-booking/api`. It creates a
  throwaway database and test roles, proves every probe, the default privileges, the idempotent re-run and the production
  role check, then drops them.
