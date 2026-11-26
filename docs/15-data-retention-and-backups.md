# Data retention, erasure, backups and disaster recovery

For the person who runs the deployment and for the owner's lawyer. Closes `docs/10-security-review.md` S-24 and `docs/13-security-review-round-2.md` R2-23. This is an engineering document, **not legal advice**: every period below is a **PROPOSED default** that the owner, their lawyer and their accountant must confirm for the operator's country (list of open decisions at the end). Related: `docs/05-eu-compliance-and-payments.md` (GDPR promises), `docs/11-database-access.md` (roles, append-only records, maintenance switch), `docs/14-payments-operations.md`.

## 1. Data map

Legend for the proposed retention: **P** = proposed, to confirm. "Anonymise" means the personal fields are replaced and the row stays; "delete" removes the row.

### 1.1 Guests (people booking on `apps/web`)

| Table.column | What | Purpose | Legal basis (suggestion) | Proposed retention (P) |
| --- | --- | --- | --- | --- |
| `inventory_blocks.booker_name`, `booker_email`, `booker_phone` | The booker's contact data (kind `reservation`, `hold`, staff `block`) | Run the stay, contact the guest, `/manage` lookup, refunds | Art. 6(1)(b) contract | **3 years after check-out**, then anonymised (name -> "Anonymised guest", email and phone -> NULL). Disputes and claims are usually time-barred by then; the owner's lawyer decides the exact period. |
| `inventory_blocks.guest_note`, `cancel_note` | Free text the guest or staff typed (may name people, health, allergies) | Serve the stay | Art. 6(1)(b); health-type content is special-category data: encourage staff not to type it | With the contact data (3 years after check-out) |
| `inventory_blocks.creator_ip_hash` | Salted hash of the IP that opened a hold | Abuse limits (docs/10 S-06) | Art. 6(1)(f) legitimate interest (fraud and abuse) | With the contact data; for an abandoned checkout **30 days** |
| `inventory_blocks` (abandoned checkout: `kind = 'hold'`, status `expired`/`released`/overdue) | Same fields, for a checkout that never became a booking | Finish the checkout, abuse limits | Art. 6(1)(b) pre-contract steps | **30 days after creation**, then anonymised (docs/13 had proposed 90) |
| `inventory_blocks.price_snapshot`, `policy_snapshot` | Amounts, discount lines, cancellation ladder | Financial record, dispute evidence | Art. 6(1)(c) legal obligation | Not personal data. Kept with the financial record |
| `payments` (`provider_ref`, `payload`, `failure_reason`) | Provider payment id, rebook terms, failure code. **No card data is ever stored.** | Accounting, refunds, reconciliation | Art. 6(1)(c) | Financial record: **10 years** (P; commonly 6-10 years by country: accountant decides). Not changed by anonymisation |
| `refunds` (`reason`, `provider_ref`, `resolution_note`) | Refund amounts and status (financial). `resolution_note` is staff free text. | Accounting, refund handling | Art. 6(1)(c) | Amounts and status: **10 years** (P). `resolution_note` is replaced with `[removed]` when the booking is anonymised |
| `booking_staff_notes.body` | Internal notes staff wrote on a booking (can name people, health, requests, deposits) | Run the stay, hand over between staff | Art. 6(1)(f) | Replaced with `[removed]` when the booking is anonymised (author and time stay); included in the guest export; hidden notes are still stored until then |
| `booking_changes.note` | Staff note on a date change | Audit of changes | Art. 6(1)(b)/(f) | Replaced with `[removed]` when the booking is anonymised; the row (dates, amounts) stays |
| `inventory_block_requests` | Which on-request extras were asked for | Serve the stay | Art. 6(1)(b) | Not identifying on its own. Stays with the booking row |
| `discount_redemptions` | Discount id and amount per booking | Accounting, promo limits | Art. 6(1)(c)/(f) | Financial record. Not personal on its own |
| Booking reference (`BK-` + 10 hex of the id) | Derived from the booking id | Lookup | - | Stays (it is the link between the booking and its refunds). With the email gone it identifies nobody |

### 1.2 Staff and operator

| Table.column | What | Purpose | Legal basis (suggestion) | Proposed retention (P) |
| --- | --- | --- | --- | --- |
| `staff_users.full_name`, `email`, `password_hash`, `last_login_at`, `role` | Staff account | Access control | Art. 6(1)(b) employment/contract or (f) | While the person works there; on leaving: `privacy:erase-staff` (deactivate + anonymise; the row stays for audit linkage) |
| `staff_sessions` | Hashed session token, expiry (migration 039 may add a device label: treat as personal) | Sign-in | Art. 6(1)(f) | **Deleted on expiry** (hourly sweeper; the retention job is the backstop) |
| `staff_two_factor`, `staff_two_factor_challenges` | Encrypted TOTP secret, hashed recovery codes, short challenges | Two-factor | Art. 6(1)(f) | Secret: while enabled. Challenges: deleted on expiry |
| `staff_invites.email`, `full_name` | Invitation or access-reset link | Onboarding | Art. 6(1)(b)/(f) | **30 days after the invitation was accepted, revoked or expired** |
| `audit_log.staff_user_id`, `metadata.actorName`, `ip_hash` | Who did what (id, name in money actions, salted IP hash) | Security, accountability, fraud investigation | Art. 6(1)(f); Art. 32 | **IP hash and staff name removed after 12 months; the row deleted after 24 months** (P: 12-24) |
| `audit_log` rows with no organization (`auth.login_failed`, hash of the typed email, IP hash) | Failed sign-ins for unknown emails; no admin can see them | Brute-force detection | Art. 6(1)(f) | **90 days** |
| `organizations.legal_name`, `legal_address`, `vat_number`, `iban`, `bic`, `bank_account_name`, `contact_email`, `contact_phone`, `owner_name`, `booking_email`, `guest_reply_email` | The operator's own business data (personal data if a sole trader) | Invoices, bank-transfer instructions, mail routing | Art. 6(1)(b)/(c) | While the account exists; the IBAN is not visible to the read-only role |

### 1.3 Technical data

| Where | What | Proposed retention (P) |
| --- | --- | --- |
| `payment_webhook_events` | Provider event id, type, SHA-256 of the body, status. **No personal data** (no body, no signature) | Finished rows (`processed`, `ignored`) **90 days**; `received`/`failed` rows are kept for the retry logic |
| `privacy_erasure_ledger` (migration 038) | Keyed hash of each erased email, count, operator, time. No address | Kept (evidence that requests were handled, and the input for re-applying erasures after a restore). Review every 5 years |
| `schema_migrations`, catalogue tables (properties, houses, rates, discounts, extras, cancellation tiers, photos) | Product data | Not personal data |
| Redis (`REDIS_URL`) | Rate-limit counters keyed by hashed IP, hashed email and booking reference; hold TTL mirrors | Seconds to hours (TTL). **Not a record**: a flush loses only counters (see 4.4) |
| API logs (stdout) | Request id, path (no query string), status, short email hash on auth events. No names, emails, phones or tokens | Platform setting: **30 days** proposed |
| Reverse proxy / CDN / host logs | IP addresses, user agents | Platform setting: **30 days** proposed; the owner configures it at the host |
| Database backups | Everything above, as it was at dump time | See section 4: dumps expire on a schedule (up to 12 months with the monthly tier) |

### 1.4 What is NOT personal data

Rates, discounts, extras, cancellation tiers, stay and property catalogue data, photos of the property, amounts and currency on their own, booking dates and status without a name or email, the `report_*` views (they leave out names, emails, phones, notes and bank data; docs/11), webhook event rows (ids and a body hash), and bookings **after** anonymisation. The booking reference and ids become non-identifying once the email, name and phone are gone.

### 1.5 Lawful exceptions to erasure (GDPR Art. 17(3))

- **Accounting and tax:** invoices, payments, refunds and the booking amounts must be kept (commonly 6-10 years; **confirm with the accountant**). The tools keep the financial record and remove only the person.
- **Legal claims and disputes:** a booking with a refund still being settled, or a stay still to come, is not anonymised until it is settled (retention skips it; `privacy:erase-guest` refuses unless `--force-future`). A lawyer can ask to extend the guest period for a specific dispute: do not run the job until it is closed (or exclude the booking).
- **Security:** audit rows are kept in reduced form (no IP hash, no staff name) for 24 months.

## 2. The retention job: `npm run privacy:retention`

```bash
npm run privacy:retention -w @resort-booking/api              # dry run: counts what is due, changes nothing
npm run privacy:retention -w @resort-booking/api -- --apply   # does it
```

- **Role:** it connects with `MIGRATION_DATABASE_URL`, the **owner** role. The audit log, refunds and booking history are append-only for everyone else, and the job needs the documented maintenance switch. It refuses to start without that variable, **refuses the API's role** (`resort_app`, whose `DATABASE_URL` it never reads), and tells you to run `npm run migrate` first if migrations 037/038 are missing. The owner's switch (`SET LOCAL resort.record_maintenance = 'on'`) is set **inside each batch's transaction**, only for steps that touch an append-only table (docs/11).
- **Dry run is the default.** It runs in read-only transactions: it cannot change anything.
- **Per batch, one transaction** (`PRIVACY_BATCH_SIZE` rows). A step runs at most `PRIVACY_MAX_BATCHES` batches per invocation; if it stops early it prints `TRUNCATED: run again` and exits 2. Rows locked by someone else are skipped (`FOR UPDATE SKIP LOCKED`), so it never stalls a booking.
- **Idempotent and safe to run often.** Anonymised bookings carry `anonymised_at` and are never picked again; deleted rows are gone. Two overlapping runs do not process the same row twice. Run it weekly (or daily: a day with nothing due is a handful of index reads).
- **A real run writes one audit row** (`privacy.retention_run`, counts and periods, no personal data) when it changed something. Per docs/11, also keep the printed output with the run's logs: the audit log cannot record the deletion of its own old rows.
- **What it never touches:** amounts, totals, paid amounts, currency, booking status, dates, reference, payments, the status and amount of refunds. The tests compare every financial column before and after.

Steps, in order (period variable, **proposed default**):

| Step | Action | Selection | Variable (default) |
| --- | --- | --- | --- |
| `guest_stays` | anonymise `inventory_blocks` | `reservation`/`block` rows with check-out older than the period, not anonymised, no refund `pending`/`failed` (those are reported as "kept back") | `PRIVACY_GUEST_RETENTION_DAYS` (**1095**) |
| `abandoned_holds` | anonymise | `hold` rows created before the period and not a live checkout, no open refund | `PRIVACY_HOLD_RETENTION_DAYS` (**30**) |
| `staff_invites` | delete | closed (accepted, revoked or expired) longer than the period | `PRIVACY_INVITE_RETENTION_DAYS` (**30**) |
| `staff_sessions`, `two_factor_challenges` | delete | expired longer than the grace | `PRIVACY_SESSION_GRACE_DAYS` (**0**) |
| `webhook_events` | delete | `processed`/`ignored`, received before the period | `PRIVACY_WEBHOOK_RETENTION_DAYS` (**90**) |
| `audit_prune` | delete | any audit row older than the period | `PRIVACY_AUDIT_RETENTION_DAYS` (**730**) |
| `audit_orphans` | delete | rows with no organization (failed sign-ins), except `privacy.*` actions | `PRIVACY_AUDIT_ORPHAN_DAYS` (**90**) |
| `audit_anonymise` | anonymise `audit_log` | `ip_hash` -> NULL and `metadata.actorName` -> `[removed]` after the period | `PRIVACY_AUDIT_ANONYMISE_DAYS` (**365**) |

Anonymising a booking sets: `booker_name = 'Anonymised guest'`, `booker_email = NULL`, `booker_phone = NULL`, `guest_note = ''`, `cancel_note = '[removed]'` (if there was one), `creator_ip_hash = NULL`, `anonymised_at = now()`, and replaces staff free text on its refunds (`resolution_note`), its date changes (`note`) and the staff notes on it (`booking_staff_notes.body`) with `[removed]`. Email and phone are NULL rather than a placeholder so nobody can find the booking by typing a placeholder address into `/manage`. A bad value in any variable (for example `3y`, or `PRIVACY_GUEST_RETENTION_DAYS=1`) stops the whole run with a message: the job deletes data, so it never falls back silently. Ranges: guest 30-3650 days, hold 1-365, invite 1-365, session grace 0-90, webhook 30-3650, audit 30-3650 (anonymise must not exceed delete), batch 1-5000.

Exit codes: 0 done, 1 error, 2 a step was truncated (run again), 64 bad arguments.

### 2.1 Scheduling (owner decision: who runs it)

Run it **weekly** (monthly is acceptable for the purge/anonymise steps: none is time-critical). It needs the API environment (`MIGRATION_DATABASE_URL`, and `PRIVACY_HASH_SALT` or `IP_HASH_SALT` for erasure commands) and network access to Postgres, so run it where the API runs.

```cron
# cron (server user that owns the deployment), Sundays 03:15, log kept with the other job logs
15 3 * * 0  cd /srv/resort-booking && /usr/bin/npm run -s privacy:retention -w @resort-booking/api -- --apply --operator cron >> /var/log/resort/privacy-retention.log 2>&1
```

```ini
# /etc/systemd/system/resort-privacy.service
[Service]
Type=oneshot
WorkingDirectory=/srv/resort-booking
EnvironmentFile=/etc/resort/api.env
ExecStart=/usr/bin/npm run -s privacy:retention -w @resort-booking/api -- --apply --operator systemd
# /etc/systemd/system/resort-privacy.timer
[Timer]
OnCalendar=Sun *-*-* 03:15:00
Persistent=true
[Install]
WantedBy=timers.target
```

A GitHub Action can run it only if the database is reachable from GitHub and the owner URL is a repository secret, which puts the owner credential in a third party: **not recommended**. If the owner insists, restrict the database to the runner's addresses, use an environment with required reviewers, and keep `--apply` behind a manual `workflow_dispatch`; schedule the **dry run** only.

Alert on a non-zero exit code and on a job that did not run for more than 10 days.

## 3. Erasure, export and re-applying erasures

All run as the owner (`MIGRATION_DATABASE_URL`), dry run by default, and never print an email address back except what you typed.

### 3.1 Erase a guest (Art. 17)

```bash
npm run privacy:erase-guest -w @resort-booking/api -- --email ada@example.com            # show what would change
npm run privacy:erase-guest -w @resort-booking/api -- --email ada@example.com --apply    # do it, print the receipt
```

Finds every booking, hold and block with that email (case-insensitive, trimmed), anonymises them exactly like the retention job, and writes, in **one transaction**: the bookings, the scrubbed refund and change notes, one `privacy_erasure_ledger` row and one `privacy.guest_erased` audit entry per organization. Both hold only an **HMAC-SHA-256 of the email** (`PRIVACY_HASH_SALT`, else `IP_HASH_SALT`; required, 32+ characters, outside development), never the address. A booking is **skipped** (and listed with the reason) when the stay is not over (check-out today or later, not cancelled), a refund is `pending`/`failed`, a payment attempt opened in the last 2 days can still settle, or it is a live checkout. `--force-future` overrides all of these (warn the guest: their confirmation emails stop). Exit code 3 means "some bookings were skipped"; re-run when they are settled. A repeat run finds nothing (the email is gone) and changes nothing.

The receipt lists the booking references anonymised and skipped, the notes scrubbed, and reminds you what survives: the financial record, and **backups made before today** (section 4.6).

### 3.2 Export a guest's data (Art. 15 and 20)

```bash
npm run privacy:export-guest -w @resort-booking/api -- --email ada@example.com --out /secure/ada.json
```

Writes JSON with bookings (with reference, stay and property names), payments (provider reference, amount, status), refunds, on-request extras, date changes and discount redemptions. `--out` is required: the command **refuses to print personal data to the terminal**, refuses an existing file, a device or `-`, and creates the file with mode `0600`. Only counts are printed. Send it to the person over a secure channel and delete your copy. It runs six queries whatever the number of bookings. Staff activity (audit log) holds no guest contact data and is not exported.

### 3.3 Erase a staff member

```bash
npm run privacy:erase-staff -w @resort-booking/api -- --email former.staff@example.com --apply
```

Deactivates the account, replaces the name with "Former staff member" and the email with `erased-<id>@erased.invalid`, invalidates the password, deletes their sessions, two-factor data and invitations, removes the IP hash and staff name from their audit rows, and writes a ledger row and a `privacy.staff_erased` audit entry. **The row is kept** so the audit log and bookings still point to a stable id ("who did what" survives without saying who). Refused for the **last active admin** of an organization.

### 3.4 After restoring a backup: `npm run privacy:reapply-erasures`

A backup taken before an erasure still contains the person. Restoring it brings them back. The ledger remembers erased people as hashes, so after any restore (including the drill's real equivalent) run:

```bash
npm run privacy:reapply-erasures -w @resort-booking/api -- --apply
```

It hashes the distinct emails still held, anonymises the bookings whose hash is in the ledger, and prints the counts. Do this **before the restored database serves traffic**. If the ledger itself was lost with the database, re-run the erasure requests from your request register.

## 4. Backups and disaster recovery

### 4.1 Decisions (owner; PROPOSED)

| Item | Proposal | Options |
| --- | --- | --- |
| Backup cadence | **Nightly** `pg_dump` | Hourly dumps are possible but costly; PITR is the better tool for a tighter RPO |
| Retention | **14 daily + 8 weekly + 12 monthly** (grandfather-father-son) | Shorter if the lawyer wants guest data gone sooner: a backup holds a person for as long as it exists (4.6) |
| Production | **Managed Postgres with point-in-time recovery (PITR)** in addition to the nightly dump (the dump is your provider-independent copy) | Nightly dumps only: acceptable for a launch with two properties |
| RPO (acceptable data loss) | **<= 15 minutes with PITR; <= 24 hours with nightly dumps only** | Owner decision: how many bookings can be re-entered by hand? |
| RTO (time to be back) | **<= 4 hours** | Measure it: the drill prints the elapsed restore time |
| Restore drill | **Monthly**, and after any migration that changes privileges or roles | The drill cadence is monthly; the backup cadence is nightly |
| Who restores | Named person plus a deputy, both with access to the backup key and the admin database credential; runbook in section 4.5 | - |
| Backup target | Owner decision: provider's managed backups + an encrypted object store in **another account and region** (EU) | - |

### 4.2 `scripts/backup-db.sh`

```bash
BACKUP_DATABASE_URL=postgres://resort_owner@db.internal/resort_booking \
BACKUP_DIR=/var/backups/resort BACKUP_AGE_RECIPIENT=age1... BACKUP_REQUIRE_ENCRYPTION=true \
  bash scripts/backup-db.sh
```

- `pg_dump --format=custom --no-owner` as the **owner** role, written to `resort-<UTC timestamp>.dump[.age|.gpg]` with mode `0600` inside a `0700` directory, plus a `.sha256`.
- **Encryption:** detects `age` (needs `BACKUP_AGE_RECIPIENT`) or `gpg` (needs `BACKUP_GPG_RECIPIENT`); with neither it writes a plain dump and warns loudly. `BACKUP_REQUIRE_ENCRYPTION=true` makes that an error (use it in production). With encryption the plaintext never touches disk: the dump is piped straight into `age`/`gpg`. Keep the **private key** away from the backup location (password manager plus a printed copy in a safe).
- It never prints a password (only `user@host/db`). A password in the URL shows in the process list: prefer a URL without it plus `PGPASSFILE`.
- **Pruning of local dumps** (GFS): keeps the newest dump of each of the last 14 days, 8 weeks and 12 months (`BACKUP_KEEP_DAILY/WEEKLY/MONTHLY`), always the newest file, and only touches names that look like our dumps. `bash scripts/backup-db.sh --prune-only` prunes alone; `BACKUP_PRUNE_DRY_RUN=1` shows what would go.
- Schedule nightly (cron `30 2 * * *` or a systemd timer, like 2.1) and alert on failure or on a newest dump older than 26 hours.
- A dump is **per database**: roles are cluster-wide and are not in it (4.5).

### 4.3 `scripts/restore-drill.sh`

```bash
RESTORE_ADMIN_URL=postgres://admin@db.internal/postgres BACKUP_DIR=/var/backups/resort \
BACKUP_AGE_IDENTITY=/secure/age.key RESTORE_SOURCE_URL=postgres://resort_readonly@db.internal/resort_booking \
  bash scripts/restore-drill.sh
```

Restores the newest dump (or the file you pass) into a throwaway database named `resort_restore_drill_<timestamp>` (it refuses to drop any name that does not match `^resort_(restore|check)_...`), then checks: checksum, restore without errors, key tables present, organizations not empty, migration ledger against the repository (a warning when behind), the **five append-only triggers present and a DELETE on `audit_log` really refused**, no unvalidated constraints, row counts against the live database when `RESTORE_SOURCE_URL` is given (a restored table must not be larger than the source). It drops the database in all cases, prints `PASS`/`FAIL` per check, the elapsed seconds (your measured RTO for the database part) and exits 1 on any failure. The drill runs with `--no-privileges`, so it proves the data and the guards, not the role grants: after a real restore run `db:setup-roles` and `db:verify-roles`.

`bash scripts/backup-smoke-test.sh` tests both scripts (retention rule offline; with `SMOKE_DATABASE_URL` and `SMOKE_ADMIN_URL` also a real dump, a drill, a corrupted dump that must fail, and cleanup).

### 4.4 Redis

Redis holds **ephemeral, rebuildable** data only: rate-limit counters (sign-in, holds, lookups, invitations), the `hold:<id>` TTL mirrors, and locks. **Sessions are in PostgreSQL**, and so are holds and bookings (`docs/01-architecture.md`). If Redis is flushed or lost: limits start from zero (a short window of weaker abuse protection), in-flight checkout timers fall back to the clock rule in PostgreSQL, and sign-in **fails closed** with 503 only while Redis is *unreachable* (docs/10 S-07), not after a flush. So Redis needs no backup; set `REDIS_PASSWORD`, keep it off the internet, and use a managed instance with persistence off or on, either is fine.

### 4.5 Disaster recovery runbook

1. Declare the incident, name the restorer, note the time (this starts the RTO clock).
2. Provision a Postgres of the **same major version**; create the database; create the three roles with `npm run db:setup-roles` after the data is in (needs `DATABASE_ADMIN_URL`, docs/11).
3. Restore: for PITR use the provider's console to the chosen minute. From a dump: `pg_restore --no-owner --dbname=<new db> <file>` (decrypt first with `age -d -i <key>`); or run `scripts/restore-drill.sh` with `RESTORE_KEEP_DATABASE=1` as a rehearsal.
4. `npm run migrate -w @resort-booking/api` (owner) to apply anything newer than the backup, then `npm run db:setup-roles` and `npm run db:verify-roles`.
5. **`npm run privacy:reapply-erasures -- --apply`** (section 3.4) before any traffic.
6. Point `DATABASE_URL`/`MIGRATION_DATABASE_URL` at the new database, start the API, check `/health`, make a test booking in a non-production property.
7. Reconcile payments: compare the provider's dashboard with `payments` and `refunds` for the gap between the backup and the incident (docs/14); bank-transfer holds that expired during the outage need a manual look.
8. Write down what happened and the measured RPO/RTO.

### 4.6 Backups and erasure

Erasing a person from the live database **does not** remove them from existing backups. The accepted position (to confirm with the lawyer): backups are not accessed for any purpose except disaster recovery, they expire on the schedule above (at most about 12 months with the monthly tier), and **every restore is followed by `privacy:reapply-erasures`**. If the lawyer wants a shorter exposure, shorten the monthly tier. Say this in the privacy notice (section 6).

### 4.7 Encryption and access checklist

- [ ] TLS on every database connection (`DATABASE_SSL=true`; managed Postgres enforces it), on the API, web and admin.
- [ ] Encryption at rest: provider disk/volume encryption for Postgres, its snapshots, and the backup bucket (KMS or provider-managed keys).
- [ ] Dumps encrypted with `age`/`gpg` before they leave the server (`BACKUP_REQUIRE_ENCRYPTION=true`); private key stored separately and tested by the drill.
- [ ] **Backup of the backups:** a second copy in another account/region, write-only credentials for the writer (it cannot delete), object lock or versioning for at least 30 days against ransomware.
- [ ] The backup writer holds the owner URL only for dumping; nobody else can read the bucket; access list reviewed quarterly.
- [ ] Postgres and Redis not reachable from the internet; the admin (superuser) credential is not on the app server (docs/11).
- [ ] The `IP_HASH_SALT`/`PRIVACY_HASH_SALT` is stored with the secrets and backed up separately: if it is lost, the ledger can no longer match emails.
- [ ] Restore drill monthly with the result recorded (date, dump used, RESULT, elapsed seconds, who).

## 5. Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `MIGRATION_DATABASE_URL` | none (required) | Owner role URL used by all `privacy:*` commands |
| `PRIVACY_HASH_SALT` | falls back to `IP_HASH_SALT` | Key for the erasure hashes; 32+ characters outside development |
| `PRIVACY_GUEST_RETENTION_DAYS` | 1095 | Days after check-out before guest personal data is anonymised |
| `PRIVACY_HOLD_RETENTION_DAYS` | 30 | Abandoned or expired checkouts |
| `PRIVACY_INVITE_RETENTION_DAYS` | 30 | After an invitation closed |
| `PRIVACY_SESSION_GRACE_DAYS` | 0 | After a session or challenge expired |
| `PRIVACY_WEBHOOK_RETENTION_DAYS` | 90 | Finished webhook event rows |
| `PRIVACY_AUDIT_ANONYMISE_DAYS` | 365 | Audit IP hash and staff name removed |
| `PRIVACY_AUDIT_ORPHAN_DAYS` | 90 | Audit rows no admin can see |
| `PRIVACY_AUDIT_RETENTION_DAYS` | 730 | Audit rows deleted |
| `PRIVACY_BATCH_SIZE` / `PRIVACY_MAX_BATCHES` | 500 / 200 | Rows per transaction / batches per step per run |
| Backup scripts | see the headers of `scripts/backup-db.sh` and `scripts/restore-drill.sh` | `BACKUP_*`, `RESTORE_*` |

Not stored by this system: card numbers, ID or passport images, guest name lists (checkout asks for the booker only).

## 6. What to tell guests (draft inputs for the owner's lawyer)

This is **input for the privacy notice**, not the notice. Adapt to the operator's legal entity and country. Do not add it to the web app until the lawyer approved it.

- **Who we are:** legal name, address, contact email of the operator (the controller), and the data-protection contact if one is required.
- **What we collect when you book:** name, email, phone number, number of guests, your booking dates, the optional note you type, your payment method choice and payment status (we never see or store your card number: the payment provider handles it), your acceptance of the terms, and a one-way hash of your IP address to stop abuse. Also anything you send us when you write to us.
- **Why, and on what basis:** to take and manage your booking and payment, and to contact you about it (contract); to keep accounting and tax records (legal obligation); to prevent fraud and abuse and keep the service secure (legitimate interest). We do not use your data for marketing unless you agree separately, and we do not sell it.
- **Who receives it:** our payment provider, our email provider, our hosting and database providers, and our accountant, each only as needed (list them by name; the operator has contracts with them). Data stays in the EU/EEA unless the lawyer documents safeguards.
- **How long:** unfinished checkouts, 30 days. Your name, email, phone and notes: 3 years after your check-out date, then removed. Amounts, dates and payment records without your personal details: 10 years for accounting. Server and security records: 30 days to 24 months as listed in section 1. (All periods are proposals until confirmed.)
- **Your rights:** access to your data and a copy (a file we send you), correction, erasure, restriction, objection, and portability; we answer within one month. Erasure leaves the accounting record without your personal details. Existing backups keep your data until they expire (at most about 12 months) and are not used for anything else.
- **How to exercise them:** the contact email; we verify it is you (for example by replying from the booking email) before sending or erasing anything.
- **Complaints:** you can complain to your national data-protection authority.
- **Cookies and maps:** only strictly necessary cookies (session, checkout) without consent; the map uses OpenStreetMap-based tiles without a Google cookie (docs/05).

Operator procedure for a request: identify the person, run the dry run (`privacy:erase-guest` or `privacy:export-guest`), review, `--apply`, send the receipt or file, and record date, request type and operator in the request register (the ledger and audit entry are the system's own record).

## 7. Open owner decisions

1. **Retention periods** (all of section 1 and 5): confirm or change each with a **lawyer/accountant for the operator's country**, especially the 3-year guest period, the 10-year financial period, 30 days for abandoned checkouts, 24 months for the audit log, 90 days for webhook rows.
2. **Who runs the retention job and where** (cron/systemd on the API server is recommended; a GitHub Action is not), and who receives the failure alert.
3. **Backup target and key custody:** provider (managed Postgres with PITR, and which other-region EU bucket), who holds the age/gpg key and its deputy.
4. **RPO and RTO** (proposed 15 minutes with PITR or 24 hours without; 4 hours), and whether PITR is bought at launch.
5. **Backups and erasure:** accept the "expire on schedule + re-apply after restore" position, or shorten the monthly tier.
6. Whether hosting and proxy logs are kept 30 days and who configures that at the host.
7. A request register and the named person who answers guest requests within one month.
