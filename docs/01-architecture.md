# Architecture

This document is the source of truth for how the resort booking product is structured. Do not scaffold a second backend or mix frameworks without updating this file first.

## Product surfaces

The product is **not a CRM** and **not an Airbnb clone**. It is a **direct-booking** platform for one operator who is leaving Airbnb: many properties, many stays per property. Product rules: `docs/04-product-domain.md`.

Two applications share one API and one database.

| Surface | App | Audience | Purpose |
| --- | --- | --- | --- |
| Guest | `apps/web` | Public visitors and booked guests | Discover properties and stays, search dates, book, pay, manage a booking |
| Admin | `apps/admin` | Operator staff | Add properties and stays, calendars, rates, reservations, publish listings |
| API | `apps/api` | Both frontends | Auth, booking rules, persistence, jobs, integrations |

Guest and admin **must not** share a single SPA with role-toggled screens. Auth models, SEO needs, and UX density are different. They may share a design-system package and TypeScript types.

## Stack decision

### Chosen stack

- **Frontends:** Next.js (App Router) + React + TypeScript + MUI
- **API:** NestJS + TypeScript
- **Database:** PostgreSQL (source of truth)
- **Cache / locks / queues:** Redis
- **Monorepo:** npm workspaces (`apps/*`, `packages/*`)

### Why this stack (not Rails for this product)

Rails is an excellent booking backend and a good way to learn Ruby. It is **not** the best architecture for *this* repo.

1. **One language for product code.** Guest UI, admin UI, API, DTOs, and tests stay in TypeScript. Types can be shared in `packages/shared-types`. That matches our strict TypeScript standard.
2. **Two modern UIs are the product.** The look and feel you want lives in Next.js/React. An API-only Rails app would throw away most of Rails (views, helpers, Hotwire). You would learn a thinner slice of Ruby while paying a dual-runtime cost (rbenv, Bundler, Sidekiq, plus Node).
3. **NestJS is the Express CRM standard, upgraded.** Same feature-module idea, with modules, guards, pipes, and first-class queues (BullMQ on Redis). Express is too thin for availability, payments, and concurrent booking.
4. **Booking needs Redis regardless of language.** Holds, idempotency, rate limits, and email/webhook jobs are the same problem in Nest or Rails. PostgreSQL remains the system of record.

**Learn Ruby in `ruby-training` (or a future throwaway Rails app), not as a second backend here.** Do not run NestJS and Rails in this monorepo.

### Why Next.js instead of Vite SPA

- Guest pages (rooms, packages, location) need SEO and fast first paint.
- App Router route groups and layouts fit public site vs guest portal vs auth.
- Admin can still be a dense MUI app; it just lives in `apps/admin`.
- Vite + React remains valid for admin-only tools; we still pick Next.js so both apps share the same conventions.

### Why PostgreSQL + Redis together

- **PostgreSQL:** organizations, properties, stays, calendars, rates, reservations, guests, payments, audit. Use transactions and constraints. Never treat Redis as the booking ledger.
- **Redis:** short-lived booking holds, distributed locks **per stay**, cache of availability windows, BullMQ jobs (confirmation email, payment webhook retry), rate limiting.

## Monorepo layout

```
apps/
  web/                 # Guest Next.js app
  admin/               # Staff Next.js app
  api/                 # NestJS API
packages/
  shared-types/        # DTOs and domain types used by web, admin, and api
  ui/                  # Shared MUI wrappers used by both frontends (optional)
docs/                  # Architecture and implementation standards
```

Workspaces are npm workspaces. Do not add a second package manager.

## Frontend architecture (`apps/web/src`, `apps/admin/src`)

Feature-first. Same rules in both Next.js apps.

```
src/
  app/                      # Next.js App Router only: layouts, pages, loading, error
  features/[feature]/
    components/
    hooks/
    services/
    models/
    mocks/                  # Mock data only; never inline in components
    index.ts
  shared/
    components/
    hooks/
    services/
    utils/
```

- Route files in `app/` stay thin: import a page component from `features/[feature]`.
- Features do not import other features' internals — only `index.ts`.
- Code used by 2+ features goes in `shared/`.
- Guest features stay in `apps/web`. Admin features stay in `apps/admin`. Shared *types* go to `packages/shared-types`, not copied.

## Backend architecture (`apps/api/src`)

```
src/
  modules/[feature]/
    [feature].module.ts
    [feature].controller.ts
    [feature].service.ts
    [feature].repository.ts   # DB access only
    dto/
    entities/ or persistence models
    index.ts                  # public exports for other modules
  shared/
    guards/
    interceptors/
    filters/
    pipes/
    redis/
    database/
  migrations/                 # sequential SQL or Prisma migrations
```

- Controllers are thin. Validation happens in DTOs/pipes. Business rules live in services. SQL lives in repositories.
- **No N+1 queries.** Repositories fetch sets (by id arrays, joins, or `GROUP BY`), never one query per row in a loop. Rules and examples: `docs/02-coding-standards.md` (API / NestJS).
- Features must not reach into another feature's files except through that feature's public module/API.
- Every guest or admin screen that shows data has a matching API module, tables, and migration. No hardcoded inventory or prices.

## Domain modules (initial)

Implement in this order unless a story requires otherwise:

1. `identity` — organization, staff users, guest accounts, auth, roles
2. `property` — properties; add-property flow; address, lat/lng, phone, email, galleries
3. `houses` — stays per property (listings), amenities, photos, publish state, capacity
4. `inventory` — per-house calendars, blocked dates, holds
5. `extras` — property service catalog; instant vs on-request; reservation extra lines
6. `rates` — per-house standard rate plus an array of **date-range rate periods** (peak season etc., overlap rejected in PostgreSQL and the service, priced per night and summed), **discounts** (effect + conditions, admin-configured), bulk apply with preview, taxes, extras pricing for instant services. Quote and search call it with all stay ids at once. Product rules: `docs/04-product-domain.md` (Pricing by date range, Discounts).
7. `reservations` — search, quote, hold, confirm, cancel (tier snapshot), rebook if `rebookable`
8. `guests` — booker contact + **guest count**; check-in verifies party size on arrival
9. `payments` — intents, captures, refunds, webhook idempotency; later charge for approved extras
10. `content` — public copy/media per property and stay for `apps/web`
11. `reviews` — optional post-visit rating + text; staff publish/hide
12. `reporting` — occupancy and revenue **by property and by stay** (read models)

Do not model “one global property.” Launch with two properties in data, but the code path is always `organization → properties[] → houses[]`.

## Booking consistency

Concurrent booking is the core risk. Freeze length follows the pay method.

0. The availability endpoints return occupied dates (reservations, active holds, blocks) so guest pickers can disable them. That is a read for UX only; steps 1-2 below remain the rule.
1. Search availability in PostgreSQL (date-range overlap on the stay) and price each free stay for the requested dates from its rate periods.
2. On checkout start: persist a `holds` row. Redis TTL **900 seconds** (card) or **172800 seconds** (bank transfer).
3. Card: on successful Stripe payment, convert hold → confirmed reservation in one transaction. Instant extras settle in that payment.
4. Bank: reservation is `pending_payment` until staff verify the transfer (receipt + reference). Then convert hold → confirmed. Reject/expiry releases the stay.
5. Failed card payment or expired hold: release the stay. Do not capture a card charge without a valid hold.
6. On-request extras stay `pending` after the booking is **paid**; staff approve/decline without touching the stay calendar.
7. Never decrement inventory only in Redis.
8. Stripe webhooks are idempotent (`event_id` unique in PostgreSQL).

### Hold expiry (nobody has to be watching)

Guests close tabs, lose signal, and walk away mid-checkout. **Nothing may depend on the browser or on a Redis event to release a stay.** Expiry works in three layers, and only the first is required for correctness:

1. **The clock is the rule (required).** A hold is dead the moment `expires_at < now()`. Every read treats it that way without writing anything: the availability endpoints skip overdue holds, and quotes and new holds mark overdue holds `expired` before checking overlap. A stay is therefore bookable again exactly on time even if no job ran and no one touched that stay.
2. **Sweeper (housekeeping).** `HoldSweeperService` (`apps/api/src/modules/inventory/`) runs every minute and expires all overdue holds across all stays in **one** `UPDATE`. It keeps stored statuses honest for reports and staff views and is where expiry side effects belong (e.g. the bank-transfer "your hold expired" email). It is idempotent, never throws (a failed run is logged and retried the next minute), and skips a run that starts while the previous one is still going. Safe on several API instances: each hold is expired once.
3. **Redis TTL (ephemeral hint only).** The `hold:<id>` key mirrors the TTL for fast checks. We **do not** use Redis keyspace expiry notifications: delivery is not guaranteed, and a missed event must never leave a stay stuck.

Rules for new code that touches holds:

- Never rely on the sweeper for correctness. If a query decides availability, it filters by `expires_at` itself.
- Side effects of expiry (emails, status changes on a pending bank-transfer reservation) go in the sweeper, and must be idempotent so a repeat run cannot send twice.
- Do not loop per hold. Expire and notify in set-based statements (see the no-N+1 rule in `docs/02-coding-standards.md`).

Details: `docs/05-eu-compliance-and-payments.md`.

## Auth

- Guest auth and staff auth are separate (different cookies/issuers or distinct role namespaces). A guest token must never authorize admin routes.
- API uses NestJS guards. Frontends never trust client-only role flags.
- Admin is session- or JWT-cookie based over HTTPS. Guest checkout may be account or email-link, but reservation records always persist in PostgreSQL.

## Data and migrations

The API connects as a least-privilege role (`resort_app`: rows only, no DDL); migrations run as `resort_owner` through `MIGRATION_DATABASE_URL`; a read-only role sees PII-free `report_*` views. Roles, setup, production checklist, backups: `docs/11-database-access.md`.

- PostgreSQL is required for all durable data.
- Migrations live with the API and run in order on a fresh install.
- Redis keys are ephemeral. Document key prefixes in the owning module.

## What we will not do

- No Express API in this repo.
- No Rails/Ruby service in this repo.
- No in-memory fake hotels, and no single hardcoded property.
- Complex booking flows (request-to-book, host approval, multi-house carts). Straight-through only.
- No single frontend for both guest and admin.
- No `any` in TypeScript (`as any`, `Record<string, any>`, `any[]` included). Object shapes use `interface`.
- No feature UI without a matching API + migration.
- No N+1 queries in the API (no queries inside loops; batch by ids or join).
