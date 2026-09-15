# Resort booking

Direct-booking replacement for Airbnb: one operator, many resorts, many houses per resort.

Repo path: `~/Developer/resort-booking`. Guest site, staff admin, one NestJS API, PostgreSQL, and Redis.

## Apps

| Path | Port | Role |
| --- | --- | --- |
| `apps/web` | 3000 | Guest Next.js |
| `apps/admin` | 3001 | Staff Next.js |
| `apps/api` | 3002 | NestJS (quotes, holds, catalog) |

Booking rules live in Nest only. The UIs call `/quotes` and `/holds`.

## Local run

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
cp apps/admin/.env.example apps/admin/.env.local
npm install
npm run db:up
npm run dev:api
npm run dev:web
npm run dev:admin
```

API applies SQL migrations on boot. Seed data is two published properties with houses.

## Docs

| File | Purpose |
| --- | --- |
| [docs/01-architecture.md](docs/01-architecture.md) | Stack, monorepo, booking consistency |
| [docs/02-coding-standards.md](docs/02-coding-standards.md) | Language, features, UX, API, tests |
| [docs/03-feature-implementation.md](docs/03-feature-implementation.md) | Checklist for every new feature |
| [docs/04-product-domain.md](docs/04-product-domain.md) | Multi-property / houses / leaving Airbnb |
| [docs/05-eu-compliance-and-payments.md](docs/05-eu-compliance-and-payments.md) | Holds, Stripe vs bank transfer, GDPR, domains |
| [docs/06-ui-theme.md](docs/06-ui-theme.md) | 8px buttons, hospitality look |
| [docs/07-cancellation-policy.md](docs/07-cancellation-policy.md) | Refund ladder, rebookable + fee |
| [docs/08-prototype-plan.md](docs/08-prototype-plan.md) | Guest then admin; logic stays in the API |
