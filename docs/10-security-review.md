# Security and guardrail review

Read-only audit of the repository (API, admin app, guest app, database migrations, compose file, env examples).
Method: reading code and SQL, `npm audit --omit=dev`, searches for secrets and risky patterns. No servers were
started and nothing was exploited; "confirmed" means the code path was read end to end, not that an attack was run.
Values of secrets are redacted on purpose.

Confidence: **confirmed** (code proves it), **likely** (depends on a deployment detail we expect), **theoretical**
(needs a future change or an unusual setup).

## 1. Executive summary: top 10 risks (likelihood x impact)

1. **S-01 Master staff token.** A static `STAFF_TOKEN` value is accepted as the owner, and `.env.example` (which ships a dev value) is loaded as a fallback config file. A deploy with no `.env` gives anyone owner access.
2. **S-03 Next.js 15.5.25 is inside a critical advisory range** (unauthenticated RCE in the image optimizer with SVG, plus DoS and cache-poisoning advisories). Upgrade before any public deploy.
3. **S-02 Known default owner credentials.** First boot creates the owner with a hard-coded fallback password if `STAFF_OWNER_PASSWORD` is unset; the example password is also in the README.
4. **S-05 The API connects to Postgres as a superuser and the same pool runs migrations (DDL).** Any SQL injection or code bug becomes full database takeover. The compose file also publishes Postgres and Redis on all interfaces with trivial credentials.
5. **S-04 Staff endpoints for properties, stays, rates, discounts, extras, calendar, reports and configuration are not scoped to the staff user's organisation.** Harmless with one organisation, a cross-tenant breach the day a second one exists.
6. **S-06 Inventory denial.** `POST /holds` has no rate limit and no email verification; bank-transfer holds last 48 hours. One script can block every stay.
7. **S-07 No brute-force protection or logging on `/staff/login`**; each attempt runs scrypt on the shared thread pool, so a flood also slows the whole API.
8. **S-08 Rate limits key on `request.ip` with no proxy setting.** Behind a reverse proxy all guests share one bucket (11 lookups a minute lock everyone out of cancel/rebook); trusting forwarded headers blindly would let attackers rotate IPs.
9. **S-10 No security headers** (CSP, frame-ancestors, nosniff, referrer policy) on the API or either Next app: the admin and checkout can be framed.
10. **S-20 Privacy:** Google Fonts, map tiles and stock photos are fetched from third parties on every page with no consent step (EU exposure).

## 2. What is already solid

- **Double booking is impossible at the database level**: a Postgres exclusion constraint on `(house, daterange)` (`001_init.sql:92`), plus lazy expiry and a sweeper (`hold-sweeper.service.ts`). Holds are authoritative in Postgres; Redis only mirrors timers, so Redis eviction or loss cannot free or double-sell dates.
- **Prices and amounts are always recomputed on the server.** The quote is recomputed in `createHold`, the hold carries a price snapshot, and `startPayment` charges `hold.totalCents` (`payments.service.ts:80-100`). The mock-complete endpoint only accepts an outcome, never an amount.
- **Mock payments cannot run in production** (`payment-provider.factory.ts:25`) and the endpoint returns 404 for a real provider (`payments.service.ts:166`). Idempotent payment start (unique indexes `payments_one_open_per_stay`, `payments_one_success_per_stay`).
- **Session tokens are random 32 bytes, stored only as SHA-256 hashes**, with expiry (`identity.password.ts`, `010_staff_accounts.sql`). Passwords use scrypt with per-user salt and `timingSafeEqual`.
- **Strict validation by default**: global `ValidationPipe` with `whitelist` and `forbidNonWhitelisted`; legal acceptance and confirmations cannot be coerced from strings (`KeepRawValue`); photo URLs use `IsUrl({ require_protocol })` (no `javascript:`).
- **Every SQL statement is parameterised.** All template literals in SQL splice constants only (`COLUMNS`, `*_SELECT` fragments, one numeric constant), never request data (grep over `apps/api/src`).
- **Booking self-service does not leak existence**: a wrong reference and a wrong email give the same 404; lookup/cancel/rebook share a per-IP budget; promo attempts are limited per IP.
- **Staff booking and refund actions check the organisation** (`staff-bookings.service.ts:63,160,195`, `staff-refunds.service.ts:37,104`), and refunds, cancellations and date changes are written to audit tables with the staff id.
- **No XSS sinks** (`dangerouslySetInnerHTML`, `innerHTML`, `eval`) in either Next app; external links use `rel="noreferrer"`. Logout deletes the server session. Error bodies are generic for unexpected failures. Logs contain no emails, phones or tokens.
- **Outbound geocoding calls go to fixed hosts** with a generic user agent: no SSRF and no personal data sent (`geocode.service.ts`).
- **Double-submit protection**: checkout buttons are disabled while pending, and the server returns the same open payment.
- `package-lock.json` is present; no secrets or keys were found in tracked files or git history by pattern search.

## 3. Findings table

| ID | Sev | Area | Evidence | Fix | Effort | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| S-01 | Critical | Auth | `identity.service.ts:90-100`, `app.module.ts:25`, `apps/api/.env.example:5` | Remove the master token path (or refuse it when `NODE_ENV=production`); stop loading `.env.example` | S | confirmed |
| S-02 | High | Auth | `identity.service.ts:130-142`, `README.md:70`, `apps/api/.env.example:6-7` | No fallback password; require env on first boot; force change at first login | S | confirmed |
| S-03 | High | Dependencies | `next@15.5.25` (web, admin); `npm audit` | Upgrade Next to the latest patched 15.5.x (>= fixed version in advisory) | S | likely |
| S-04 | High (latent) | Authorization | `property.service.ts:43`, `reservations.service.ts:81,115`, `property.controller.ts:46-140`, `rates`, `discounts`, `extras` controllers | Pass `staff.organizationId` everywhere and filter by it; add tests | M | confirmed |
| S-05 | High | Database | `docker-compose.yml:5-7`, `migration-runner.ts:41-80`, `apps/api/.env.example:1` | Two roles (migrator, runtime); runtime without DDL or superuser | M | confirmed |
| S-06 | High | Abuse | `inventory.controller.ts:79-84`, `inventory.service.ts:197-260` | Limit holds per IP and per email, cap active holds per caller, verify bank-transfer holds, shorter unverified TTL | M | confirmed |
| S-07 | High | Auth | `identity.controller.ts:52-57`, `identity.service.ts:71-75`, `identity.password.ts:19,39` | Rate limit and lock out login, uniform timing, auth event logging | S | confirmed |
| S-08 | Medium | Abuse | `bookings.controller.ts:34-74`, `rate-limit.ts:28-40`, `main.ts:14` | Set `trust proxy` to the real hop count; key on a trusted client IP; add per-reference limits | S | likely |
| S-09 | Medium | Dependencies | `npm audit` (body-parser, multer, qs, postcss, sharp) | `npm audit fix`; upgrade Nest platform-express | S | confirmed |
| S-10 | Medium | Headers | no `headers()` in `apps/*/next.config.ts`; no helmet in `main.ts` | Add CSP, frame-ancestors, nosniff, referrer policy, HSTS at the edge | S | confirmed |
| S-11 | Medium | Frontend auth | `api-client.ts:22-31`, `app/api/session/route.ts:15-33` | One storage place (httpOnly cookie), verify token on set, `Secure`, Origin check | M | confirmed |
| S-12 | Low | Frontend | `staff-login-page.tsx:36-37` | Accept only a single leading slash (reject `//`, `/\`) | S | likely |
| S-13 | Medium | Sessions | `identity.service.ts:115-128`, `identity.repository.ts` | Delete other sessions on password change; sliding/shorter expiry; purge expired; re-auth to change email | S | confirmed |
| S-14 | Medium | Authorization | `identity.controller.ts:125-133`, no role column in `010_staff_accounts.sql` | Add roles (owner/staff); owner-only bank details; audit log; notify on IBAN change | M | confirmed |
| S-15 | Medium | Observability | `api-exception.filter.ts:46-52` | Log unexpected errors (with request id); log auth failures; no PII | S | confirmed |
| S-16 | Low | Validation | only `staff-bookings.controller.ts` uses `ParseUuidLikePipe`; `rate-limit`/`redis.service.ts:46-52` | Apply the UUID pipe app-wide; make incr+expire atomic | S | confirmed |
| S-17 | Low | Privacy | `inventory.controller.ts:88-91`, `Hold` type has name, email, phone | Keep, but never log or expose the hold id in URLs sent to third parties; consider masking | S | confirmed |
| S-18 | Low | Validation | `create-hold.dto.ts:78-81`, `upsert-house.dto.ts`, `update-organization.dto.ts`, `geocode.query.dto.ts` | `ArrayMaxSize`, `MaxLength`, `Max` on money, IBAN/BIC validators | S | confirmed |
| S-19 | Low | Outbound | `geocode.service.ts` (no timeout, unbounded `json()`) | `AbortSignal.timeout`, size cap | S | confirmed |
| S-20 | Medium | Privacy | `web/src/app/layout.tsx:30-33`, `map-config.ts`, 27 seeded Unsplash URLs | Self-host fonts and images, consent step or accept the exposure knowingly | M | confirmed |
| S-21 | Low | Info leak | `health.service.ts`, `health.controller.ts` | Public `/health` returns only `ok`; details for staff or internal network | S | confirmed |
| S-22 | Medium | Database | `database.service.ts:16-19` | `statement_timeout`, `lock_timeout`, `idle_in_transaction_session_timeout`, pool max, TLS | S | confirmed |
| S-23 | Low | Database | `001_init.sql:77`, `021_rebooking.sql:9`, `010_staff_accounts.sql:22` | CHECKs for guest_count, total/paid cents; unique on `lower(email)`; index on `staff_sessions.expires_at` | S | confirmed |
| S-24 | Medium | Compliance | `docs/05` promises export/delete; no code or doc for it | Erasure/anonymise job, retention for expired holds, backup and restore runbook | L | confirmed |
| S-25 | Medium | Config | `002_seed.sql`, `006`, `011`, `012` (sample data, fixed UUIDs, sample IBAN) | Seed only in dev (separate seed step); never in production migrations | M | confirmed |
| S-26 | Medium | Config | `payment-provider.factory.ts:25`, `apps/api/package.json` (`start` sets no `NODE_ENV`) | Startup config validation; fail fast on missing/unsafe values | S | likely |
| S-27 | Medium | Payments | `payment-provider.ts` (`createIntent` has no idempotency key), no webhook, default body parser | Design before Stripe: raw body webhook, signature check, idempotency keys, auto-refund on late success | M | theoretical |

## 3b. Status: Phase 1 API fixes

Fixed in `apps/api` (not yet deployed anywhere). Frontend, dependency and header items (S-03, S-09, S-10, S-11, S-12) are
handled separately; S-04, S-14 and S-05/S-22/S-23 have their own status sections below; S-24, S-25 and S-27 are Phase 2 or later and are NOT done.

| ID | Status | What changed | Tests |
| --- | --- | --- | --- |
| S-01 | Fixed | The `STAFF_TOKEN` master token is gone from the service, guard, env example and tests. A session token from `/staff/login` is the only way in. `.env.example` is no longer read as configuration (`envFilePath: ['.env']`). | `identity.service.spec.ts` "has no master token: a STAFF_TOKEN setting opens nothing"; `staff.guard.spec.ts`; `environment.spec.ts` "warns ... the retired STAFF_TOKEN is set" |
| S-02 | Fixed | No fallback owner password: first start needs `STAFF_OWNER_EMAIL` and `STAFF_OWNER_PASSWORD` (and the password must pass the policy) or the API stops with a clear message. In production the API refuses to start while the documented development login still works; in development it logs a warning. | `identity.service.spec.ts` "first start" and "the documented development login" groups |
| S-06 | Fixed (limits and cap) | `POST /holds` is limited per IP (10 / 10 min) and per email (6 / 10 min, keyed by a hash), and a caller may keep at most 3 unpaid holds per email and 5 per IP open at once (migration 026 stores a hash of the IP on the hold). **Not done:** the bank-transfer hold TTL (48 h) and email verification are an owner decision (section 6, item 1). | `hold-rate-limiter.spec.ts`; `inventory.service.spec.ts` "hold guardrails"; `inventory.repository.spec.ts` countActiveHolds; `inventory.controller.spec.ts` "creating a hold"; `migrations/hold-creator.spec.ts` |
| S-07 | Fixed | Failed sign-ins are counted per email (hash) and per IP in Redis (5 / 20 per 15 min by default); a locked account or network gets 429 with `Retry-After` before any password work. An unknown email costs the same time as a wrong password (dummy hash), both give the same message, password hashing runs through a bounded queue (3 at once, 50 waiting, then 503) so a flood cannot starve the thread pool, and every success, failure and block is logged with the request id and a short hash of the email (never the password or token). **Redis down: login fails closed** (503 `LOGIN_UNAVAILABLE`). The 12-character minimum is NOT changed (owner decision, section 6 item 4). | `login-limiter.spec.ts`; `identity.service.spec.ts` "login" group; `semaphore.spec.ts`; `identity.password.spec.ts` dummyPasswordHash |
| S-08 | Fixed | One atomic Lua script counts and starts the window; all limiters use the real client IP; `TRUST_PROXY=<hops>` (default off) controls Express `trust proxy` and anything but a small number is ignored; lookup, cancel and the date-change calls also limit per booking reference across all callers; search, quote and availability have a generous per-IP limit. Limits are tunable by environment variable (`.env.example`). | `rate-limit.spec.ts`; `booking-rate-limiter.spec.ts`; `client-ip.spec.ts`; `bookings.controller.spec.ts` |
| S-13 | Fixed | Changing the password signs every other session out (the current one stays); `POST /staff/logout-all` signs out everywhere; expired sessions are purged hourly. Not done: sliding or shorter expiry, re-authentication to change the email. | `identity.service.spec.ts` "changePassword"; `identity.repository.spec.ts`; `identity.controller.spec.ts`; `session-sweeper.service.spec.ts` |
| S-15 | Fixed | Every unexpected error is logged once, server side, with its stack and request id (path only, no query string); the client gets a generic 500 carrying just the request id. A request id middleware accepts a safe `x-request-id` or makes one. Auth events are logged (S-07). | `api-exception.filter.spec.ts`; `request-id.spec.ts` |
| S-16 | Fixed | A global pipe makes any route parameter named `id` or `*Id` a clean 400 `INVALID_ID` when it is not an id; the atomic limiter script removes the INCR/EXPIRE gap; JSON bodies are limited to 100 kB and URLs to 2048 characters. | `id-param.pipe.spec.ts`; `url-length.middleware.spec.ts` |
| S-17 | Fixed | The hold response (reachable by anyone holding the hold link) masks the email (`a**@example.com`) and phone (`+••••• 678`). | `inventory.rules.spec.ts` masking; `inventory.service.spec.ts` "returns a masked email and phone" |
| S-18 | Fixed | Maximum lengths on every free-text DTO field, caps on lists (photos, amenities, tiers, conditions, house ids, request options), money and capacity maxima, https-only photo URLs (rejects `javascript:`, `data:`, `file:`, plain `http:`), IBAN and BIC character checks, password length capped at 200, stays limited to 120 nights and guest check-in to 800 days ahead. | `dto-bounds.spec.ts`; `inventory.service.spec.ts` getQuote (STAY_TOO_LONG, CHECK_IN_TOO_FAR) |
| S-21 | Fixed | Public `GET /health` returns only `{ "ok": boolean }`. The detail (Postgres, Redis, schema ahead of this build) moved to `GET /staff/system/health` behind the staff guard. | `health.controller.spec.ts` |
| S-26 | Fixed (startup check) | `assertEnvironment` runs first on boot: in production it refuses a missing `DATABASE_URL`/`REDIS_URL`, a missing, wildcard, localhost or non-https `CORS_ORIGINS`, and the mock payment provider; it warns about a missing `TRUST_PROXY`. Development prints warnings instead. No secret value is ever printed. | `environment.spec.ts` |

Environment variables added: `NODE_ENV`, `TRUST_PROXY`, `IP_HASH_SALT`, `LOGIN_MAX_FAILURES_PER_EMAIL`,
`LOGIN_MAX_FAILURES_PER_IP`, `LOGIN_LOCK_WINDOW_SECONDS`, `HOLD_IP_LIMIT`/`_WINDOW_SECONDS`, `HOLD_EMAIL_LIMIT`/`_WINDOW_SECONDS`,
`MAX_ACTIVE_HOLDS_PER_EMAIL`, `MAX_ACTIVE_HOLDS_PER_IP`, `BOOKING_LOOKUP_LIMIT`/`_WINDOW_SECONDS`,
`BOOKING_REFERENCE_LIMIT`/`_WINDOW_SECONDS`, `PROMO_LIMIT`/`_WINDOW_SECONDS`, `BROWSE_LIMIT`/`_WINDOW_SECONDS`
(all documented in `apps/api/.env.example`). New migration: `026_hold_creator.sql` (additive, replayable).

### Password policy

A staff password must have **10 to 200 characters, a capital letter, a small letter and a number** (symbols and spaces are allowed
but not required), must not be only spaces, must not contain the first part (3+ characters) of the account's sign-in email, and
must not be one of ~130 very common passwords (also with trailing digits/symbols, e.g. `Password123!`, `Welcome1234`).
It applies only when a password is SET (change password; the owner seed on first boot; the registration and invitation flows
must call `IdentityService.assertPasswordAcceptable`). Existing accounts and the login form are never judged, so nobody is locked out.
Failure is `400 PASSWORD_TOO_WEAK` with a `problems` list in plain language. One rule file, two copies that cannot drift:
`packages/ui/src/password/password-policy.ts` (admin) and `apps/api/src/shared/validation/password-policy.ts` (the API cannot import
workspace packages at run time; `password-policy.spec.ts` fails if the two differ). Tests: `password-policy.test.ts` (ui),
`password-policy.spec.ts`, `password-validation-pipe.spec.ts`, `identity.service.spec.ts` (changePassword, first start,
`assertPasswordAcceptable`), `api-exception.filter.spec.ts`, admin `configuration.test.tsx` and `password-checklist.test.tsx`.
Exception: the documented development login `AtlanticOwner1!` for `owner@atlantic.example` meets every rule except "no email name"
(it contains `owner`), so with `NODE_ENV=development` the first-boot seed only logs a warning; with any other `NODE_ENV`
(tests, CI, production) the API refuses to create that account. Also fixed: a wrong CURRENT password (`401 STAFF_PASSWORD_MISMATCH`)
no longer signs the person out of the admin app.

### Staff accounts, roles, team and audit (S-14)

| ID | Status | What changed | Tests |
| --- | --- | --- | --- |
| S-14 | Fixed (API) | Two roles, `admin` and `employee`, stored on `staff_users.role` (migration 028; every existing account became an admin, a new one defaults to `employee`). `RoleGuard` runs last on every staff route and FAILS CLOSED: a route with no `@RequireRole` / `@AllowRoles` is refused for everyone. Employees may use the calendar, the booking list, check-in, cancel and change dates, the refund list (read only) and reports with every money figure withheld (`redactReportForEmployee`). Everything that moves money out or sets the business up is admin only: refund retry and mark-paid, properties, stays, extras, rates, discounts, cancellation configuration, organization (bank and legal) settings, the team, the audit log, system health. Bank details are admin only. Not done: an email notice to the owner when the IBAN changes (no email system yet); the admin screens (next step). | `tenant-isolation.spec.ts` (every route declares roles, runs RoleGuard last, matches the reviewed ROLE_MATRIX; no money-out or setup route is open to employees), `role.guard.spec.ts`, `redact-report.spec.ts`, `reservations.controller.spec.ts` |
| Registration | New, closed in production | `POST /staff/register` creates a workspace (organization) and its first admin in ONE transaction and signs them in. `ALLOW_REGISTRATION` decides; unset it is open in development and CLOSED in production (only the word `true` opens it). Rate limited per IP (5/hour) and per email (3/hour). The duplicate-email answer (`409 EMAIL_TAKEN`) tells a caller an address has an account: the usual trade-off for a sign-up form, mitigated by those limits and by registration being shut in production. The password goes through the shared policy with the email. | `team.service.spec.ts`, `team-limiter.spec.ts`, `team.rules.spec.ts`, `team.repository.spec.ts`, `registration.controller.spec.ts`, `team-dto.spec.ts` |
| Team and invitations | New | Admins add people with a ONE-TIME LINK (no email system yet): the token is returned once, only its SHA-256 hash is stored, it expires after `INVITE_TTL_HOURS` (72), works once, and a new link for the same email revokes the old one. The accept step locks the invitation row, so two clicks at once cannot both win. Unknown, used, revoked and expired links all answer the same `404 INVITE_INVALID`. An access reset signs the person out everywhere and issues a link that sets a new password for THAT account. The workspace always keeps at least one ACTIVE admin (`409 LAST_ADMIN`, members are locked while the change is checked), nobody switches themselves off, switching someone off ends their sessions in the same transaction, and a switched-off account cannot sign in (it fails exactly like a wrong password). Team routes are tenant scoped (`staffUser`, `staffInvite`). | `team.service.spec.ts`, `team.repository.spec.ts`, `team.rules.spec.ts`, `team.controller.spec.ts`, `identity.service.spec.ts`, `tenant-isolation.spec.ts` |
| Audit log | New | One `AuditService.record` (never throws into the request path; a failure is logged without the entry) writes `audit_log` rows: who, what, target id, request id and a HASH of the IP. Metadata holds ids and NAMES only: never passwords, tokens, plain emails, bank values (a settings change records the names of the fields sent, not the values). Routes are marked `@Audited` and the row is written after they succeed; the isolation suite fails when a write route is neither audited nor in the reviewed list of exceptions. `GET /staff/audit` (admin only, organization scoped, cursor paging on the exact microsecond timestamp, `action` prefix, `from`, `to`). | `audit.service.spec.ts`, `audit.repository.spec.ts`, `audit.interceptor.spec.ts`, `audit.controller.spec.ts`, `tenant-isolation.spec.ts`, `staff-roles-invites-audit.spec.ts` (migration) |

Audit actions: `auth.login`, `auth.login_failed` (hashed email, organization when the account exists), `auth.register`,
`auth.password_changed`, `auth.profile_changed`, `auth.logout_all`, `auth.access_reset_completed`, `team.invite_created`,
`team.invite_revoked`, `team.invite_accepted`, `team.role_changed`, `team.deactivated`, `team.reactivated`, `team.access_reset`,
`org.settings_changed`, `refund.retried`, `refund.marked_paid`, `booking.cancelled_by_staff`, `booking.dates_changed_by_staff`,
`booking.arrival_changed`, `property.*`, `house.*`, `discount.*`, `rate.*`, `extra.*`.

New environment variables (documented at the end of `apps/api/.env.example`): `ALLOW_REGISTRATION`, `INVITE_TTL_HOURS`,
`REGISTRATION_LIMIT`/`_WINDOW_SECONDS`, `REGISTRATION_EMAIL_LIMIT`/`_WINDOW_SECONDS`, `INVITE_ACCEPT_LIMIT`/`_WINDOW_SECONDS`,
`INVITE_PREVIEW_LIMIT`/`_WINDOW_SECONDS`. New migration: `028_staff_roles_invites_audit.sql` (additive, safe to replay).
Known limits: `GET /identity/organization` (the public site) still reads the FIRST organization, which is right for one branded
guest site and needs rethinking if one deployment serves several; two-factor sign-in and the admin screens come next.

### Database access (S-05, S-22, S-23)

Full guide: `docs/11-database-access.md`.

| ID | Status | What changed | Tests |
| --- | --- | --- | --- |
| S-05 | Fixed in code, switch-over is a step for the owner | Three roles (`npm run db:setup-roles`): `resort_owner` (owns the schema, migrations only), `resort_app` (rows only: no DDL, no `TRUNCATE`, no writes to `schema_migrations`, no role or database creation) and `resort_readonly` (PII-free `report_*` views only). `MIGRATION_DATABASE_URL` (owner) is the only connection that changes the schema; `RUN_MIGRATIONS_ON_START` defaults to off in production; with nothing pending the API starts as the app role. At boot the API asks Postgres who it is: production refuses a superuser, a role that can create roles or databases, or one that owns tables; development warns. Production also refuses a missing or identical migration URL, a superuser-looking login, a remote database without TLS. `docker-compose.yml` now publishes Postgres and Redis on `127.0.0.1` only and supports an optional Redis password. Existing single-URL development setups keep working (with warnings). | `roles.spec.ts`, `role-safety.spec.ts`, `database-safety.service.spec.ts`, `database-environment.spec.ts`, `migration-runner.spec.ts`, `migration-files.spec.ts`, `role-probes.spec.ts`; real-Postgres `database-roles.integration.spec.ts` (11 tests) and `npm run db:verify-roles` |
| S-22 | Fixed | `resort_app`: `statement_timeout` 15 s, `lock_timeout` 3 s, `idle_in_transaction_session_timeout` 20 s, `search_path = public`, connection limit; pool size, connect and idle timeouts, TLS (`DATABASE_SSL`) and an `application_name` come from the environment; an idle-connection error is logged instead of crashing the process. | `database-settings.spec.ts`; integration test checks the role settings and that a 20 s sleep is cancelled |
| S-23 | Fixed | Migration 027: `CHECK`s for `guest_count >= 1`, `total_cents >= 0`, `paid_cents >= 0`, `booking_changes` totals and bulk-rate cents (added `NOT VALID`, validated only if the existing rows pass; otherwise a notice and new rows are still checked), unique index on `lower(staff_users.email)` (skipped with a notice if two accounts differ only by case), index on `staff_sessions.expires_at`. Not touched: discount and priority columns. | migration applied and replayed on a throwaway database, including a violating row |

Not done: row-level security (kept as defence in depth after the organization checks of S-04, see `docs/11-database-access.md`),
Redis eviction policy review, database encryption at rest (hosting decision), and the owner's one-time switch of their development
database to the roles.

## 4. Detailed findings

### S-01 Master staff token (Critical, confirmed)
`IdentityService.staffFromToken` returns the owner for any request whose `x-staff-token` header equals `STAFF_TOKEN`
(`identity.service.ts:90-100`), bypassing sessions, expiry, logout and password changes. The comparison is `===`
(not constant time). `ConfigModule.forRoot({ envFilePath: ['.env', '.env.example'] })` (`app.module.ts:25`) reads
`.env.example` when `.env` is missing, and that file ships a dev `STAFF_TOKEN` (`apps/api/.env.example:5`).
Exploit: deploy without a `.env`, then any request with that header (the example value is public in the repo) can read
`GET /staff/organization` (IBAN, VAT) and change prices, discounts and bookings. `apps/admin/.env.example:2` also defines a
`NEXT_PUBLIC_STAFF_TOKEN` with the same value; nothing in `src` reads it today, but a `NEXT_PUBLIC_` variable is
embedded in the client bundle, so using it would publish the master token.
Fix: delete the env-token branch (sessions are enough); if kept for dev, enable only when `NODE_ENV !== 'production'`
and compare with `timingSafeEqual`; remove `.env.example` from `envFilePath`; remove `NEXT_PUBLIC_STAFF_TOKEN`.

### S-02 Default owner credentials (High, confirmed)
`ensureOwnerAccount` creates the owner when no staff exists, using `STAFF_OWNER_PASSWORD` or a hard-coded fallback
(`identity.service.ts:130-142`); the example password is also written in `README.md:70`. On a fresh production database
with the variable unset, the account has a publicly known password and email.
Fix: no fallback; throw at startup unless both values are provided; add "must change password" on first login.

### S-03 Next.js advisories (High, likely)
**Status: done (Phase 1).** `next` is pinned to `15.5.29` in both apps (the latest 15.x; every advisory listed here is fixed in it). `images.dangerouslyAllowSVG` is explicitly `false` and `contentDispositionType` is `attachment`. The only remaining production advisory was a `postcss` copy that Next 15 pins to 8.4.31; a root `overrides` entry (`next` -> `postcss 8.5.33`) fixes it without a major upgrade, so `npm run audit:prod` reports 0 vulnerabilities. Next 16 is not needed for this.

Installed `next@15.5.25` in both apps. `npm audit --omit=dev` lists, for this range: unauthenticated remote code
execution in the image optimization API when SVG files are used (advisory severity critical), a Server Actions DoS,
SVG filter bypass, HttpOnly cookie exposure on Edge routes, and SSG/ISR cache poisoning (self-hosted). The web app
enables the optimizer with `remotePatterns` for one host (`apps/web/next.config.ts`); exploitability depends on
whether SVG sources are reachable, so treat as likely, not proven. Fix: upgrade `next` to the first patched release
(`npm audit fix`, then rerun tests and a build), restrict image sources, disable `dangerouslyAllowSVG`.

### S-04 Cross-tenant authorization missing (High, latent, confirmed)
Only the booking and refund services compare `staff.organizationId` with the row. Everything else loads by ID or lists
everything: `listStaffProperties()` takes no staff (`property.service.ts:43`), `getCalendar(query)` and
`getReport(query)` take no staff (`reservations.service.ts:81,115`), and property/house/extras/rates/discounts services
use `existing.organizationId` of the target row to write children, which is correct data hygiene but not an access
check. Exploit with a second organisation: staff of org A calls `PATCH /staff/houses/:houseId` or
`GET /staff/reports` and reads or edits org B. Today there is a single organisation (`getSettings` returns the first
row: `identity.repository.ts:43-52`), so there is no live leak. Fix: one `requireSameOrganization` helper used by every
staff service; scope all list queries by `organization_id`; add a test per endpoint that a foreign-org ID returns 404.
Longer term see RLS in section 5.

**Status: done (Phase 2, item 1).** Every staff route is now scoped to the signed-in staff member's organization, and the rule is enforced in one place instead of in each service.
- **`TenantGuard`** (`apps/api/src/shared/tenancy/`) runs after `StaffGuard`. Routes declare the ids they name with `@TenantScoped({ resource, from, key })` (route params, query filters, and body id lists). The guard checks each against the caller's `organization_id` with one fixed statement per resource (lists of ids as a set in ONE statement) and answers **404, never 403**, before the handler or body validation runs. Resources: property, house, ratePeriod, discount, extra, requestOption, booking (reservation), refund.
- **Routes that name no id** carry `@TenantExempt('how it is scoped')`: the staff property list, property creation, the configuration list, calendar/day list/report (all now filter by `organization_id` in SQL, in both periods and every summary statement), and the organization settings (`GET/PATCH /staff/organization` read the caller's organization, no longer "the first row"). `CurrentStaff` hands handlers the signed-in staff member and fails with 401 if a route forgot `StaffGuard`.
- **The isolation suite** (`shared/tenancy/tenant-isolation.spec.ts`) reads every controller's metadata, so nothing is registered by hand: a staff route that declares neither `@TenantScoped` nor `@TenantExempt` (and a reviewed line in its exempt table) fails CI; every declared id is run through the real guard with an id of another organization (404) and with the caller's own (passes), in both directions (A to B and B to A); a `/staff` route without `StaffGuard` fails. Removing a decorator from a route was verified to fail the suite.
- Public guest endpoints were reviewed only for staff data: they return published properties and a booking found by reference plus email; the public `/identity/organization` still reads the first organization, which is correct for the one-site guest app and must be revisited if one deployment ever serves several branded sites.
- The roles split and the admin-only bank details (S-14) are now done: see the S-14 section.

### S-05 Database roles and exposure (High, confirmed)
`POSTGRES_USER` is a superuser and the API uses it (`DATABASE_URL` in `apps/api/.env.example:1`). The migration
runner executes DDL at application start with the same pool (`migration-runner.ts:41-80`). Consequences: an injection
or a compromised container can `DROP`, read other databases, or use superuser features. Compose publishes
`5433:5432` and `6380:6379` on all interfaces (`docker-compose.yml:5-7,19-20`) with user = password credentials and
Redis without a password: on a shared network both are reachable. There are no Dockerfiles in the repo, so image
hardening (non-root user, read-only filesystem) is not yet applicable.
Fix: bind to `127.0.0.1` in compose; two database roles (section 5); a Redis password.

### S-06 Hold flooding (High, confirmed)
`POST /holds` is unauthenticated and not rate limited (the promo limiter only counts requests that carry a code,
`promo-rate-limiter.ts:31-33`). Each call inserts an active hold (`inventory.service.ts:223-260`); bank-transfer holds
last 48 hours and the email is never verified. A script creating holds for every stay and date range blocks the
calendar for two days with no payment, and nothing alerts the operator. Fix: per-IP and per-email hold limits, a cap
on active unpaid holds per email/IP, short TTL until the email is confirmed (or until a bank transfer is acknowledged),
CAPTCHA/proof-of-work behind a feature flag if abuse appears, and an admin alert on hold spikes.

### S-07 Login brute force and thread-pool DoS (High, confirmed)
`POST /staff/login` has no limiter, lockout or logging (`identity.controller.ts:52-57`). The password policy is eight
characters with a letter and a number (`identity.password.ts`). `login` returns early without hashing when the email is
unknown (`identity.service.ts:72-73`), so response time reveals which emails exist; when the email exists scrypt runs
on libuv's four-thread pool, so a flood of attempts also delays unrelated work. Fix: limit per IP and per email (Redis,
fail closed for login), lock for increasing periods, always run one scrypt (dummy hash for unknown emails), log failures
and successes, raise the minimum length to 12, optionally add TOTP for staff.

### S-08 IP-based limits and proxies (Medium, likely)
Limits use `request.ip` (`bookings.controller.ts:34-74`, `inventory.controller.ts:41,81`) and `trust proxy` is never set
(`main.ts`). Behind a load balancer or CDN, `request.ip` is the proxy for every visitor: eleven lookup attempts in a
minute block cancel/rebook for all guests (self-inflicted denial of service). If someone later enables `trust proxy`
as `true` without a hop count, any visitor can spoof `X-Forwarded-For` and bypass the limit. The limiter also fails open
when Redis is down (`rate-limit.ts:32-39`), and `incr` followed by `expire` is not atomic (`redis.service.ts:46-52`):
a crash between them leaves a key with no expiry and blocks that IP forever. Per-reference limits are absent (the
reference is only 40 bits of the UUID, but an attacker also needs the email).
Fix: `app.set('trust proxy', <hops>)`, a Lua/`SET NX EX` atomic limiter, per-reference and per-email buckets, IPv6 /64 grouping.

### S-09 Dependency advisories (Medium, confirmed)
**Status: done (Phase 1).** `npm audit fix` (no `--force`): `body-parser`, `multer`, `qs`, `sharp` and `@nestjs/platform-express` are patched; `@nestjs/common`, `@nestjs/core` and `@nestjs/platform-express` are `^11.2.12`. `npm run audit:prod` gates high and critical; CI runs it on every pull request and weekly (`.github/workflows/security.yml`); Dependabot is configured (`.github/dependabot.yml`, majors excluded on purpose). Dev-only advisories (for example `tinypool`/`vite` through Vitest) are not in production and need a Vitest 4 major upgrade: tracked, not done.

`npm audit --omit=dev`: 7 findings (1 critical, 5 high, 1 moderate). Besides Next (S-03): `body-parser` 2.3.0
(DoS via trailing bytes after a compressed request body: reachable on every JSON endpoint), `multer` and
`@nestjs/platform-express` <= 11.2.5 (DoS; no multipart endpoint exists, so lower real risk), `qs` (DoS via
`stringify`, not used server side), `postcss` (stringify XSS, build time) and `sharp`. Fix: `npm audit fix`, upgrade
`@nestjs/*` to the current 11.x patch, keep Dependabot/Renovate on.

### S-10 Security headers (Medium, confirmed)
**Status: web and admin done (Phase 1); API not yet (helmet is the API owner's change).** Both Next apps send `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` and (production) HSTS from `next.config.ts`, plus a Content-Security-Policy with a per-request nonce from `src/middleware.ts`. Scripts use `'nonce-...' 'strict-dynamic'`, never `'unsafe-inline'` or (in production) `'unsafe-eval'`. Every page renders per request (the root layout reads `headers()`), which a nonce needs. Builders are pure and tested: `packages/ui/src/security/security-headers.ts`. Unavoidable relaxations: `style-src 'unsafe-inline'` (MUI/emotion inject style tags), `img-src https:` (staff paste photo URLs from any host; tighten when photos are self-hosted), Google Fonts hosts until fonts are self-hosted (S-20), `ws:`/`'unsafe-eval'` in development only. Set `CSP_REPORT_ONLY=true` to trial a change without blocking; `CSP_EXTRA_CONNECT_ORIGINS` adds hosts for a self-hosted map style. Checked in a production build with headless Chrome: pages hydrate and the map worker loads with the policy enforced and no violation reported.

Neither Next config defines `headers()` and the API has no helmet. Missing: `Content-Security-Policy`,
`frame-ancestors`/`X-Frame-Options` (clickjacking on admin actions and checkout), `X-Content-Type-Options`,
`Referrer-Policy` (booking references and hold ids can appear in URLs), `Permissions-Policy`, `Strict-Transport-Security`.
Express also sends `X-Powered-By`. CORS is correctly an allow-list from `CORS_ORIGINS` (`main.ts:15-19`).
Fix: set headers in `next.config.ts` (CSP allowing only self, the map style host, tiles, fonts if not self-hosted),
`helmet()` on Nest, HSTS at the proxy.

### S-11 Admin token handling (Medium, confirmed)
**Status: partial (quick part done).** The token is now read and written in one module (`shared/services/staff-session.ts`); storage failures never throw; the token is sent only in the `x-staff-token` header (tested: never in a URL); a 401 from the API clears it and sends the user to `/login?reason=expired`; logout clears it; staff are signed out after 30 minutes without activity in any tab (`useIdleLogout`, `shared/utils/idle.ts`) with a notice on the login page. The CSP above now limits the damage of an XSS bug. Still open (Phase 2): keep the token only in an httpOnly, `Secure`, `SameSite=Strict` cookie behind Next route handlers (BFF) so the browser never holds it; verify the token before setting the cookie; check `Origin` on `/api/session`; make middleware verify the session, not just the cookie's existence.

The same token is stored in `localStorage` (`api-client.ts:22-31`) and in an httpOnly cookie (`api/session/route.ts`).
The cookie's protection is moot because any XSS can read `localStorage`. `POST /api/session` is unauthenticated, does
not check the token and does not set `Secure` (`route.ts:23-31`), and parses JSON regardless of content type, so a
cross-site form can set a cookie to an attacker's token (login CSRF; theoretical impact). `middleware.ts` only checks
that the cookie exists, so the admin shell renders for any value (data is still protected by the API). Fix: keep the
token only in the httpOnly, `Secure`, `SameSite=Strict` cookie and call the API through a Next route handler (BFF) so the
browser never holds it; verify the token with `/staff/me` in middleware or in the first server component; check `Origin`.

### S-12 Open redirect after login (Low, likely)
**Status: done (Phase 1).** `safeRedirectTarget` (`apps/admin/src/shared/utils/safe-redirect.ts`) accepts only a path with a single leading `/`; it rejects `//host`, `/\\host`, absolute and `javascript:` URLs, control characters (tabs and newlines that browsers strip) and `:` or `\\` before the query. The login page uses it; tested with the attack strings.

`next !== null && next.startsWith('/') ? next : '/'` (`staff-login-page.tsx:36-37`) accepts `//evil.example` and
`/\evil.example`, which the browser treats as another origin. A phishing link `…/login?next=//evil.example` sends the
staff member there after a real login. Fix: parse with `new URL(next, origin)` and require the same origin, or
whitelist known paths.

### S-13 Session lifecycle (Medium, confirmed)
Changing the password keeps every other session alive (`identity.service.ts:115-128`); expiry is a fixed seven days with
no sliding window; expired rows are never deleted; the email (the login) can be changed without the current password
(`updateProfile`), and a duplicate email raises an unhandled unique violation (500).
Fix: delete all sessions of the user on password change, store `last_seen`, purge expired rows in the sweeper, require
the password to change email.

### S-14 Any staff member can change bank details (Medium, confirmed)
There is no role column; `PATCH /staff/organization` lets every staff user change IBAN/BIC/account name that guests
see for bank transfers (`identity.controller.ts:125-133`), with no audit entry. One compromised or malicious staff
account can redirect guest payments. Today only one staff user exists (no create endpoint), so this is about design.
Fix: roles, owner-only for bank and legal fields, an audit table, an email notice to the owner on change, IBAN validation.

**Status: done in the API (see the S-14 row above).** Roles, admin-only bank and legal settings and the audit log exist; the email notice waits for an email system.

### S-15 Blind spots (Medium, confirmed)
`ApiExceptionFilter` catches everything and returns a generic 500 without logging (`api-exception.filter.ts:46-52`), so
real failures (and attacks) leave no trace; this already cost debugging time during the stale-server incident. There is
no access log, no auth-failure log, no request id. Good news: existing logs carry no personal data.
Fix: log unexpected errors with a request id (no body, no PII), add structured logs for login, cancel, refund, discount
and rate changes, alert on 5xx rate and 429 rate.

### S-16 Robustness (Low, confirmed)
Path parameters are passed to Postgres uuid comparisons without validation everywhere except the staff booking routes
(`ParseUuidLikePipe` is used six times, all in `staff-bookings.controller.ts`). `GET /holds/not-a-uuid` or any
`/staff/.../:id` with junk produces a database error that surfaces as an (unlogged) 500. Fix: apply the pipe
(or a global param pipe) to every `:id`.

### S-17 Hold endpoint returns personal data (Low, confirmed)
`GET /holds/:id` returns the booker's name, email and phone to anyone holding the hold UUID (needed so the form stays
filled). The UUID is unguessable, so exposure needs the id to leak (browser history, referrer, logs). Keep, add the
referrer policy (S-10) and avoid putting the hold id in any URL shared with third parties.

### S-18 Input bounds (Low, confirmed)
Arrays without `ArrayMaxSize` (`requestOptionIds` in `create-hold.dto.ts`, photos and amenities in `upsert-house.dto.ts`),
unbounded strings on staff forms (`legalName`, `legalAddress`, `iban`, house `description`, geocode `q`), money fields with
no upper bound (`nightlyRateCents`), IBAN and BIC not validated. The 100 kB body limit of Express caps the worst case.
Guest quote/hold inputs are well bounded (guests 1-50, nights capped by `MAX_PRICED_NIGHTS`).

### S-19 Outbound calls (Low, confirmed)
Photon and Nominatim calls have no timeout and read the whole body (`geocode.service.ts`); a slow or hostile upstream can
pin staff requests. Hosts are fixed (no SSRF) and the user agent contains no personal data. Fix: `AbortSignal.timeout(5000)`
and a response size check. Nominatim's usage policy also asks for low volume and caching.

### S-20 Third-party requests and consent (Medium, confirmed)
**Status: partial.** External map links now use `rel="noopener noreferrer"` (tested). Self-hosting fonts, tiles and photos is still open. The browser contacts these third-party hosts today: `fonts.googleapis.com` and `fonts.gstatic.com` (fonts, both apps), `tiles.openfreemap.org` (map style, glyphs, sprites, vector tiles), `images.unsplash.com` (seeded listing photos, plus any host a staff member pastes as a photo URL), `*.tile.openstreetmap.org` (only if the vector style fails and the raster fallback runs) and `api.maptiler.com` (only if `NEXT_PUBLIC_MAPTILER_KEY` is set: that key is public by design, restrict it to our domains in the MapTiler dashboard). All of them see the visitor's IP address; decide on self-hosting or a privacy-policy disclosure (owner decision 6).

Every guest page loads CSS from Google Fonts (`apps/web/src/app/layout.tsx:30-33`), the maps load tiles from the style
host, and seeded listings use Unsplash photos (27 URLs in the seed migrations); staff-entered photo URLs can point anywhere
and are rendered as plain `<img>` (tracking pixel risk). These requests disclose the visitor's IP to third parties before
any consent step, which is the exposure the EU rulings on Google Fonts concern. Fix: self-host the font files (`next/font`),
proxy or self-host images and tiles (or accept and disclose in the privacy policy), restrict photo URL hosts, add a
consent banner only if non-essential cookies/trackers are introduced (the app sets only functional storage today).

### S-21 `/health` discloses internals (Low, confirmed)
`GET /health` is public and returns Postgres and Redis state plus `schemaAheadOf` migration file names. Useful to attackers
for fingerprinting. Fix: public liveness returns `{ ok }`; detailed readiness only on an internal port or behind staff auth.

### S-22 Database session settings (Medium, confirmed)
The pool is created from the URL only (`database.service.ts:16-19`): no `statement_timeout`, `lock_timeout`,
`idle_in_transaction_session_timeout`, no pool `max`/`connectionTimeoutMillis`, no TLS option. A slow query or a leaked
transaction holds locks (cancel uses `FOR UPDATE`, `bookings.repository.ts:192`) and can stall bookings.
Fix: set the three timeouts on the runtime role (`ALTER ROLE … SET`), pool max 10-20, `ssl` in production.

### S-23 Missing constraints (Low, confirmed)
`inventory_blocks.guest_count` is nullable with no CHECK (`001_init.sql:77`), and `total_cents`/`paid_cents`
(`021_rebooking.sql:9`) have no `>= 0` check (other money columns do). `staff_users.email` is unique case-sensitively
(`010_staff_accounts.sql:22`; the code lowercases, a manual insert would not). `staff_sessions` has no index on
`expires_at`. Strengths: exclusion constraints on stays and rate periods, status CHECKs, refunds and payments amount
CHECKs, foreign keys, one-open-payment unique indexes.

### S-24 GDPR operations (Medium, confirmed)
`docs/05` commits to export and delete of guest data, but there is no endpoint, job or runbook; guest names, emails,
phones and notes live in plain columns of `inventory_blocks` (and are copied into price/policy snapshots only as
amounts), expired holds keep personal data indefinitely, and there is no documented backup, restore or retention plan.
IBAN/BIC and the owner's contact data sit in `organizations` unencrypted. Fix: anonymise-by-booking-reference tool
with a 90-day purge of expired holds, encrypted managed Postgres with tested restores, a data map in `docs`.

### S-25 Seed data in migrations (Medium, confirmed)
`002_seed.sql`, `006`, `011`, `012`, `013`, `016`, `017` insert a sample organisation with well-known UUIDs, sample
bookings and a sample IBAN into every database that runs migrations, including production. Fix: move samples to a
`seed` command that refuses to run when `NODE_ENV=production`.

### S-26 Startup configuration (Medium, likely)
The only startup validation is `getOrThrow` for `DATABASE_URL` and `REDIS_URL`. The mock-payment guard works only when
`NODE_ENV=production` is set, and `npm start` does not set it (`apps/api/package.json`). Fix: a schema (zod/joi) that, in
production, requires `NODE_ENV`, a real payment provider, explicit owner credentials, `CORS_ORIGINS` without localhost,
and refuses `STAFF_TOKEN`.

### S-27 Payment readiness (Medium, theoretical)
Before a real provider: there is no webhook route, the default JSON body parser would break signature verification
(needs `rawBody`), `createIntent` takes no idempotency key, and the late-success case (card charged after the hold
expired) needs an automatic refund. The refund path already records status and supports retry.

## 5. Recommended implementation plan

### Phase 1: quick wins (days)
1. S-01/S-02/S-26: remove the master token and default password, drop `.env.example` from `envFilePath`, add a startup config validator.
   Tests: unit tests for the validator (production without owner password fails; `STAFF_TOKEN` in production fails); a guard test that the env token is rejected.
2. S-03/S-09: upgrade Next and Nest patches. CI: `npm audit --omit=dev --audit-level=high` as a required job.
3. S-07: login limiter (per IP and per email), dummy-hash timing, auth logging. Tests: limiter spec (11th attempt returns 429), timing-uniform spec, log spec (no password in logs).
4. S-06/S-08: hold and lookup limiters, `trust proxy` configuration, atomic limiter script. Tests: limiter specs including proxy hop and Redis failure behaviour per route.
5. S-15/S-16: log unexpected errors with a request id; global UUID param pipe. Tests: filter logs once per 500; an e2e style test that junk ids return 400.
6. S-10/S-12/S-21: security headers, redirect fix, trimmed `/health`. Tests: a headers test per app (supertest or Next config unit test), redirect helper unit tests (`//x`, `/\x`, `https://x`).
7. S-13: revoke other sessions on password change, purge expired sessions. Tests: service specs.

### Phase 2: structural (weeks)
1. S-04: organisation scoping in every staff service. Test strategy: a table-driven spec that, for each staff route, calls it with an ID from another organisation and expects 404 (add to CI as the "tenant isolation suite").
2. S-05/S-22/S-23: database roles and settings.
   - `resort_owner`: owns the schema, used only by `npm run migrate` (split `MigrationRunner` out of API startup, or run it with the owner URL).
   - `resort_app`: `LOGIN`, `NOSUPERUSER NOCREATEDB NOCREATEROLE`, default privileges `SELECT, INSERT, UPDATE, DELETE` on tables and `USAGE` on sequences, no DDL, no write on `schema_migrations`; `REVOKE ALL ON SCHEMA public FROM PUBLIC`; role-level `statement_timeout=5s`, `lock_timeout=2s`, `idle_in_transaction_session_timeout=15s`.
   - `resort_readonly`: `SELECT` only, for reporting/BI, with the PII columns of `inventory_blocks` and the bank columns of `organizations` excluded through a view.
   - Bind Postgres and Redis to localhost or a private network; TLS (`sslmode=require`); Redis password.
   - Row-level security is feasible (nearly every table carries `organization_id`) but needs a per-request `SET LOCAL app.organization_id` inside a transaction, which `DatabaseService.query` (pool, no transaction) does not do today. Treat RLS as defence in depth after S-04, not instead of it.
   Tests: a migration test that connects as `resort_app` and asserts `CREATE TABLE` and `DROP TABLE` fail; a CI step that runs the whole API test suite against the restricted role.
3. S-11/S-14: BFF session handling, roles, owner-only bank details, audit table. Tests: route-handler tests, role matrix tests, audit row on each sensitive change.
4. S-25: seed separation. S-27: payment-provider contract (idempotency, webhook, late success refund) written and tested against the mock first.

### Phase 3: operational (ongoing)
1. Monitoring: 5xx, 429, login failures, hold spikes, refund failures, sweeper failures; uptime check on a minimal `/health`.
2. Backups and restore drills, retention job and anonymisation tool (S-24), data map in `docs`.
3. Secrets in a manager (not env files), rotation notes, separate values per environment.
4. CI security checks: `npm audit` gate, secret scanning (gitleaks), a lint rule banning `NEXT_PUBLIC_*SECRET|TOKEN|PASSWORD`, SQL lint for string interpolation of non-constants, Dependabot or Renovate, a weekly OWASP ZAP baseline against a staging deploy, a header scan.
5. Self-host fonts and images (S-20) and decide on the consent approach with the owner's lawyer.

## 6. Decisions the owner must make

1. **Hold policy:** how long may an unpaid, unverified bank-transfer hold block dates (48 hours today)? Verify by email link, shorten, or require a deposit?
2. **Staff roles:** will there ever be more than one staff account? If yes, which actions are owner-only (bank details, discounts, rates, refunds above an amount)?
3. **Multi-tenant ambition:** one operator forever, or several organisations on one deployment? This decides how far to go with row-level security (S-04/S-05).
4. **Staff login strength:** accept a TOTP second factor (recommended) and a 12-character minimum?
5. **Hosting and network:** where will Postgres, Redis, the API and the apps run, and is there a reverse proxy or CDN (needed for S-08 and the headers)?
6. **Third-party content:** self-host fonts, tiles and photos (more setup, no consent exposure) or keep OpenFreeMap, Google Fonts and Unsplash and cover them in the privacy policy?
7. **Data retention:** how long to keep guest data after check-out (tax rules usually require invoices, not contact details) and who runs erasure requests?
8. **Backups:** acceptable data-loss window (RPO) and recovery time (RTO), and who owns restore drills?
9. **Monitoring ownership:** who receives alerts (login floods, hold spikes, failed refunds)?

## 7. Status: optional two-factor sign-in (TOTP)

Decision 4 above (a TOTP second factor) is built as an **opt-in** feature for every staff account. Accounts that do not turn it on sign in exactly as before.

- **Where:** `apps/api/src/modules/identity/two-factor.*`, migration `029_staff_two_factor.sql`, admin `features/account` and the second step of `features/identity` sign-in.
- **Secret at rest:** AES-256-GCM, bound to the staff id, key in `TWO_FACTOR_ENCRYPTION_KEY` (32 random bytes, 64 hex characters). Required in production (the API refuses to start without it); development falls back to a fixed key with a warning. Losing or changing the key makes enrolled secrets unreadable: an admin then uses Team > reset two-factor.
- **Login:** a correct password for an account with two-factor returns `{ twoFactorRequired, challengeToken, expiresAt }` instead of a session. The challenge is stored hashed, lasts 5 minutes, is single use, and dies after 5 wrong codes. `POST /staff/login/two-factor` takes the token plus a code (or a recovery code) and returns the normal session.
- **Codes:** RFC 6238 (SHA-1, 6 digits, 30 s, +-1 step), constant-time compare, a used time step is never accepted again, 10 single-use recovery codes stored as hashes. Wrong codes are limited per person and per IP in Redis (fail closed, `ratelimit:2fa:*`).
- **Audit:** `auth.two_factor_enabled`, `auth.two_factor_disabled`, `auth.recovery_codes_regenerated`, `auth.recovery_code_used`, `auth.two_factor_failed`, `team.two_factor_reset`. Secrets, codes and tokens are never logged.
- **Lost phone:** an admin calls `POST /staff/team/:staffId/reset-two-factor` (same organization only, audited, ends that person's sessions).
