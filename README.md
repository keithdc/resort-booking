# Resort booking

Direct-booking replacement for Airbnb: one operator, many destinations, many bookable stays per destination.

Guest site, staff admin, and one NestJS API share PostgreSQL (source of truth) and Redis (holds and cache). Booking rules live in Nest only.

## What you get locally

| App | Path | URL | Role |
| --- | --- | --- | --- |
| Guest | `apps/web` | http://localhost:3000 | Public listings, search, hold dates |
| Admin | `apps/admin` | http://localhost:3001 | Calendar, properties, account, reports |
| API | `apps/api` | http://localhost:3002 | Quotes, holds, catalog, staff reports |

Docker Postgres is on **5433** and Redis on **6380** so they do not collide with other local apps on 5432/6379. Both are published on `127.0.0.1` only (not on your network). The API can run as a least-privilege database role instead of the Docker admin role: see `docs/11-database-access.md`.

## Prerequisites

- Node.js **20+**
- npm (workspaces; do not add Yarn or pnpm)
- Docker Desktop (for Postgres + Redis)

## First-time setup

From the repo root:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/admin/.env.example apps/admin/.env.local
npm install
npm run db:up
```

Wait until `docker compose ps` shows Postgres and Redis healthy.

The API applies SQL migrations on boot (catalog, seed properties, staff owner). You can also run them explicitly:

```bash
npm run db:migrate
```

## Run all three apps

Use **three terminals** from the repo root:

```bash
npm run dev:api
```

```bash
npm run dev:web
```

```bash
npm run dev:admin
```

Optional health check: http://localhost:3002/health

After changing Nest code, restart `dev:api` (`start:dev` compiles then runs `dist/`).

## Sign in (staff)

Admin is at http://localhost:3001/login

Default owner (from `apps/api/.env.example`, created on API boot if no staff row exists):

- Email: `owner@atlantic.example`
- Password: `AtlanticOwner1!`

The login page does not prefill them: type the email. Change these in `apps/api/.env` before any shared or production use.

Registration is open by default on a development run only (`NODE_ENV=development` or `test`; set `ALLOW_REGISTRATION=false` to close it; on any other run it must be `true` to open): while open, the login page shows "Create an account" (http://localhost:3001/register) to create a new workspace through the UI. An admin invites teammates from **Team** (a one-time link to hand over); employees see no Team, Audit log or Properties.

## Seed catalog

Migrations publish two destinations (Alpine Lake and Pine Coast) with stays, photos, extras, and sample confirmed bookings so calendar and reports have data.

## Typical workflow

1. Guest: pick dates on http://localhost:3000, search, open a property, optionally apply a promo code (try `WELCOME15`), hold dates, then pay in **test mode** (no real money moves). A paid hold becomes a confirmed reservation with a booking reference.
2. Admin: calendar (click a guest for the full booking), properties, account, reports (filter by property; click a tile or bar for the bookings behind it).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run db:up` | Start Postgres + Redis |
| `npm run db:migrate` | Apply API SQL migrations |
| `npm run dev:api` | Nest on port 3002 |
| `npm run dev:web` | Guest Next.js on 3000 |
| `npm run dev:admin` | Staff Next.js on 3001 |
| `npm test` | Workspace tests |
| `npm run lint:web` / `lint:admin` / `lint:api` | Lint one app |

## Environment

Do not commit filled `.env` files. Examples:

- `apps/api/.env.example` — **copy it to `apps/api/.env`: the API reads only `.env`.** `DATABASE_URL`, `REDIS_URL`, `PORT`, `CORS_ORIGINS`, staff owner email/password (first start only), `TRUST_PROXY`, `IP_HASH_SALT`, the abuse-limit settings, `PAYMENT_PROVIDER` (`mock` until the client picks a provider; the mock also needs `ALLOW_MOCK_PAYMENTS=true` and is refused on any production-like run), and optional email for team invitations (`RESEND_API_KEY`, `MAIL_FROM`, `ADMIN_APP_URL`; without them the admin copies the link; see `docs/12-email.md`)
- **Environment modes (strict by default).** Only an explicit `NODE_ENV=development` or `NODE_ENV=test` turns development conveniences on (mock payments with `ALLOW_MOCK_PAYMENTS=true`, open registration, the development two-factor key, unsalted hashes, localhost CORS). Anything else (unset, `staging`, `prod`, a typo) behaves like production, and the API **refuses to start** with a list of what is missing: `NODE_ENV` set to `production`, real `CORS_ORIGINS`, a real payment provider, `TWO_FACTOR_ENCRYPTION_KEY`, `IP_HASH_SALT` (32+ characters) and the database settings. `npm run start:dev` sets `NODE_ENV=development` itself, and your `apps/api/.env` needs `ALLOW_MOCK_PAYMENTS=true` while `PAYMENT_PROVIDER=mock`. On a server set `NODE_ENV=production` and never set `ALLOW_MOCK_PAYMENTS` (the API refuses to start if it is). Rotating `IP_HASH_SALT` changes every stored IP and email hash, so older audit rows no longer match newer ones. `next dev`, `next start` and `vitest` set `NODE_ENV` themselves for the two web apps.
- `apps/web/.env.example` — `NEXT_PUBLIC_API_URL=http://localhost:3002`
- `apps/admin/.env.example` — `NEXT_PUBLIC_API_URL` (never put a secret in a `NEXT_PUBLIC_` variable: it is published in the browser)

## Docs (product rules)

| File | Purpose |
| --- | --- |
| [docs/01-architecture.md](docs/01-architecture.md) | Stack, monorepo, booking consistency |
| [docs/02-coding-standards.md](docs/02-coding-standards.md) | TypeScript, Nest, Next.js, UX |
| [docs/03-feature-implementation.md](docs/03-feature-implementation.md) | Checklist for every new feature |
| [docs/04-product-domain.md](docs/04-product-domain.md) | Organization → properties → stays |
| [docs/05-eu-compliance-and-payments.md](docs/05-eu-compliance-and-payments.md) | Holds, Stripe vs bank transfer, GDPR |
| [docs/06-ui-theme.md](docs/06-ui-theme.md) | 8px buttons, hospitality look |
| [docs/07-cancellation-policy.md](docs/07-cancellation-policy.md) | Refund ladder, rebookable + fee |
| [docs/08-prototype-plan.md](docs/08-prototype-plan.md) | Guest then admin; logic stays in the API |
| [docs/09-client-proposal.md](docs/09-client-proposal.md) | Printable proposal, June 2027 plan, brand checklist, draft NDA |

The Operator-facing PDF (print on A4) is
[docs/client/Humphreys-Direct-Booking-Proposal-Architecture-NDA.pdf](docs/client/Humphreys-Direct-Booking-Proposal-Architecture-NDA.pdf).

