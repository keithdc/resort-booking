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

## Stack

- Next.js App Router, React, TypeScript, MUI
- NestJS, PostgreSQL, Redis
- npm workspaces
