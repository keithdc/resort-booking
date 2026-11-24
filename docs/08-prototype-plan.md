# Prototype plan

Ready to build a **clickable prototype** after docs. Order: guest UI, then admin UI, with a **real API from day one** so booking rules never live in React.

## Frontend has no business logic

`apps/web` and `apps/admin` only:

- Render what the API returns
- Collect form fields and send DTOs
- Disable past days on **guest** date pickers (UX only). Admin pickers stay fully enabled.
- Show loading, empty, errors, toasts

**Not in the frontend:** availability overlap, hold TTL, refund %, rebook fee, payment capture, “is this stay free.” Those run in NestJS. If the UI needs a number, it **asks the API** (`GET quote`, `POST hold`, `POST cancel`).

Guest `minDate = today` is allowed as a picker constraint. The API still **rejects** a past check-in from `apps/web`. Admin APIs may write past dates.

Do not “prototype” refunds with hardcoded `0.75` in a component. That becomes the product.

## Build order

1. **Monorepo skeleton** — npm workspaces, `apps/web`, `apps/admin`, `apps/api`, `packages/shared-types` (interfaces, no `any`).
2. **API first slice** — even if the screens are empty: health, identity stub, property/stay read, availability + hold. PostgreSQL + Redis as soon as holds exist (no in-memory hotels).
3. **Guest (`apps/web`)** — browse properties/stays, map, photos, contact, short checkout (name, email, phone, guest count, pay UI), freeze countdown. Pages call services only.
4. **Admin (`apps/admin`)** — properties, stays, calendars (past dates allowed), extras, cancellation/rebook config, reservations, check-in count, reviews publish/hide.
5. **Harden** — Stripe + bank transfer, emails, cookie banner.

Skipping Nest “until later” will push holds and quotes into Next.js. That violates this file. A thin Nest app with a few endpoints is the prototype backend, not a delay.

## Git

Remote (create the empty GitHub repo first, then):

```bash
cd ~/Developer/resort-booking
git remote add origin git@github.com:keithdc/resort-booking.git
git add -A
git commit -m "docs: resort booking standards and domain"
git push -u origin main
```

Repo lives at `~/Developer/resort-booking`, next to other apps in `Developer`.
