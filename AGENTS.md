# AGENTS.md — Resort booking

You are working on a **direct-booking** monorepo (Airbnb replacement), not a CRM and not a marketplace. Guest UI is `apps/web`, staff UI is `apps/admin`, API is `apps/api` (NestJS, PostgreSQL, Redis). Follow `docs/` strictly.

## Read first

1. `docs/04-product-domain.md` — organization → many properties → many houses
2. `docs/01-architecture.md` — stack, layout, booking consistency
3. `docs/05-eu-compliance-and-payments.md` — holds, Stripe vs bank transfer, EU
4. `docs/02-coding-standards.md` — TypeScript, Nest, Next.js, UX
5. `docs/03-feature-implementation.md` — how to add a feature
6. `docs/06-ui-theme.md` — 8px buttons, theme
7. `docs/07-cancellation-policy.md` — refund ladder, rebookable + fee
8. `docs/08-prototype-plan.md` — guest then admin; logic in API only

## Non-negotiables

- TypeScript **strict**. **No `any`** (`any[]`, `as any`, `Record<string, any>` included). Object shapes: **`interface`**. Unions: `type`. Unknown JSON: `unknown` + narrow. Explicit return types. `import type`.
- Feature folders. Import other features only through their public barrel/module.
- Every UI feature has API + PostgreSQL migration. No in-memory hotels, rooms, or prices.
- Redis is for holds, locks, cache, and queues — not the reservation ledger.
- Two frontends: never merge guest and admin into one role-toggled app.
- Multi-property: never hardcode one resort. Staff can add properties and houses in admin.
- Straight-through booking. Card + Apple Pay + Google Pay: 15-minute hold + Stripe (same fee as card). Bank transfer: 48-hour hold, receipt, staff verify. No PayPal/Klarna in v1. Cookie consent before ad pixels. Extra services: instant or on-request after the stay is paid.
- No Ruby/Rails and no Express in this repo.
- MUI + theme tokens. Buttons **8px radius**. No hardcoded palette colors.
- Property listings: photos, OSM map + directions, phone (`tel:`) and email. No in-app chat.
- Booking UX: name/email/phone + guest count + pay. No ID storage. 5 min freeze warning; expired hold keeps the form. Optional review after the stay. Arrival: staff verify headcount. Guest calendars disable past days; **admin calendars do not**.
- **No business logic in React.** Holds, availability, refunds, payments: NestJS only.
- **Holds expire by the clock, not by events.** A hold past `expires_at` is dead on every read; the minute sweeper only tidies status and sends expiry side effects. Never rely on the browser or Redis expiry events to release a house (`docs/01-architecture.md`, Hold expiry).
- **Payments go through the `PaymentProvider` interface** (mock now, Stripe later). A paid hold becomes a reservation in one transaction; nobody is charged for an expired hold; the app refuses `PAYMENT_PROVIDER=mock` in production (`docs/05-eu-compliance-and-payments.md`).
- **Discounts are admin-configured and calculated in the API only** (effect + conditions, best single or combinable stack, promo codes rate-limited), shown as lines on the quote and counted only when a stay is paid (`docs/04-product-domain.md`).
- **Phones and emails use the shared fields.** `PhoneField` (flag + country code, stores E.164) and `EmailField` from `@resort-booking/ui` in web and admin; the API validates with `@IsPhoneNumber()` / `@IsEmail()`. No plain text boxes for contact details (`docs/02-coding-standards.md`).
- **All code has tests.** Every new or changed function, service, repository method, controller route, hook, and component ships with test cases in the same change: the happy path, edge cases, error paths, and the bugs you can foresee (date boundaries, overlaps, empty input, unauthorized access). Pure rules go in `*.rules.ts` with a `*.spec.ts` beside them. No feature is done until its tests pass and `lint` and `test` are green. A bug fix starts with a failing test that reproduces it. Tests are the record of how the system is meant to behave (`docs/02-coding-standards.md`, Testing).
- **Booked dates come from the API.** Availability endpoints return unavailable date ranges (dates only, no guest data) and guest pickers disable them. The API still rejects overlaps with `DATES_UNAVAILABLE`. Admin pickers do not disable booked or past days.
- **Pricing is by date range, not flat.** Each house has a base nightly rate plus rate periods (peak season, etc.). A stay is priced per night and summed in NestJS, then snapshotted on the reservation. Periods on one house must never overlap (DB constraint + `RATE_PERIOD_OVERLAP`). "Apply to all houses" needs a preview and a warning dialog. Discounts are admin-configured (effect + conditions) and calculated in the API. No flat `nights × rate` and no price math in React (`docs/04-product-domain.md`).
- **No N+1 queries in the API.** Never query inside a loop; batch by id arrays, joins, or `GROUP BY` in the repository (`docs/02-coding-standards.md`).

## Stack

- Next.js App Router, React, TypeScript, MUI
- NestJS, PostgreSQL, Redis
- npm workspaces
