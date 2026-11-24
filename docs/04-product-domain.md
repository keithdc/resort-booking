# Product domain — Airbnb replacement

The client currently lists on Airbnb. That contract expires next year and will **not** be renewed. This product is their **direct-booking** replacement: they own the listings, calendar, payments, and guest relationship.

This is **not** an Airbnb marketplace (many hosts, commissions, Superhost). It is one operator account that can own **many properties**, each with **many stays**.

## Launch facts

- **Now:** 2 properties.
- **Each property:** multiple stays (bookable units), not a single hotel room pool.
- **Later:** the same owner adds more properties under the same account with no schema rewrite.

Build **multi-property from day one**. Never hardcode “the property” as one row or one set of env vars.

## Core model

```
Organization (the client / operator)
  └── Property (the whole site, e.g. Alpine Lake)  ← 2 at launch, N later
        ├── ExtraService (catalog: breakfast, transfer, …)
        └── Stay (one bookable unit)                 ← many per property
              ├── Standard rate + RatePeriod[] (peak season, holidays, …)
              └── Calendar / rates / photos / amenities
                    └── Reservation (a guest's booking)
                          └── ReservationExtra (instant paid, or on-request pending)
```

| Term | Meaning |
| --- | --- |
| Organization | The owner account. Staff belong here. All properties hang off this. |
| Property | The whole site, e.g. Alpine Lake. Name, slug, address, lat/lng, phone, email, photo gallery, public content. |
| Stay | One bookable unit with its **own** availability calendar (Airbnb listing equivalent). Usually the whole unit, not a shared hotel room type. |
| RatePeriod | A date range with its own nightly rate on one stay (e.g. peak season). Nights outside any period use the stay standard rate. See **Pricing by date range**. |
| Discount | Admin-configured effect (percent or fixed) plus conditions (long booking, early bird, promo code, …). See **Discounts**. |
| Guest | Person booking on `apps/web`. |
| Staff | People in `apps/admin` who manage properties, stays, extras, calendars, and reservations. |
| ExtraService | Admin-defined add-on for a property (breakfast, airport transfer, late checkout). `instant` (priced, paid at checkout) or `on_request` (staff approve later). |
| ReservationExtra | A guest’s choice of an extra on one reservation. Instant extras are confirmed with payment. On-request extras start as `pending`. |

### Naming: words vs code

People read **Property** and **Stay**. The code keeps its original names, so the same two ideas have two spellings. Do not rename the code to match the words, and do not mix the words up in text.

| Word in text and UI | What it is | Code name | Database table | Web address |
| --- | --- | --- | --- | --- |
| **Property** | The whole site, e.g. Alpine Lake | `property` | `properties` | `/properties/:slug` |
| **Stay** | One bookable unit inside a property, e.g. Lake Chalet | `house` | `houses` | `/properties/:slug/houses/:houseSlug` |

Rules for writing:

- In user-facing text and docs prose use **Property** and **Stay**. In code keep `property` and `house`.
- **"Stay" never means a booking.** A guest's booking is a **booking** or **reservation** ("your booking is confirmed", "confirmed bookings"). Use "stay" only for the bookable unit. The plain verb ("stay on this page", "guests stay for three nights") is fine.
- Error `code` values (`HOUSE_NOT_FOUND`, `PROPERTY_NOT_FOUND`) are code, not text. They do not change.

Every durable row that is property-scoped stores `organization_id` and `property_id`. Stay-scoped rows also store `house_id`. Queries always filter by these ids so a third property cannot leak into the first.

## What guests see (`apps/web`)

- Browse **all published properties**, or land on one property by URL (`/properties/[slug]`).
- Property page: **photo gallery**, short description, **map + address**, **phone** (`tel:`) and email, list of stays.
- Inside a property, list **stays** with photos, capacity, amenities, and price for selected dates (the **booking total**, which can differ by season; "from €X / night" only when no dates are picked).
- Stay page: gallery, amenities, map (same pin as the property unless the stay has its own coordinates), contact, book CTA.
- Search: check-in, check-out, guest count — across one property or all properties. **Past days and already-booked dates are disabled** on guest calendars (booked dates come from the availability API, see **Availability: booked dates in the API response**).
- **Search map (built):** the results page shows a map beside the list (behind a "Show map" toggle on phones). **Every stay is on the map with its own price**: stays that share a place (usually every stay of one property) appear as a small stack of chips ("Lake Chalet 960,00 €"), cheapest first, one chip per stay, pointing at the place. A chip opens its stay with the guest's dates kept. Hovering a chip lights up its card and hovering a card lights up its chip. More than four stays at one place collapse into "+N more", which opens the full list. Each stay summary carries `mapLatitude`/`mapLongitude` (its own coordinates if it has a complete pair, otherwise its property's, never half and half). Stays without usable coordinates stay in the list but not on the map. The map loads on demand (MapLibre + OpenStreetMap tiles, no Google SDK).
- **Properties page (built):** `/properties` lists every published property as cards (photo, name, address, link to its stays). The header and footer "Properties" links go there, and the home page shows the same cards.
- **Manage a booking (built):** `/manage` lets a guest with no account look up a booking by reference and email, see what cancelling would refund, and cancel after a confirmation that states the exact amount. Backend and rules: `docs/07-cancellation-policy.md`.
- Stay page is the SEO/ads landing URL (`/properties/[slug]/houses/[slug]`).
- Book: **short checkout** — booker name, email, phone, **number of guests**, pay. No ID, no guest name list.
- Instant extras: optional checkboxes on the same page — not required to finish.
- On-request extras: guest can ask; the **booking is still confirmed**. Staff approve or decline after.

Unpublished properties and stays must not appear on the guest site.

## What staff see (`apps/admin`)

- Organization home: list of properties, **Add property**.
- Property context switcher (required once there are 2+ properties).
- Per stay: **standard rate** and **rate periods** (date range + nightly rate, no overlaps), editable without a deploy. "Apply to all stays" shows a warning first.
- Per property: **discounts** (long booking, early bird, promo code, …) with conditions and stacking rules.
- Per property: stays, calendars (**past dates stay enabled** — staff are not blocked), extras, cancellation/rebook config, reservations, **check-in (verify guest count)**, reviews (publish/hide), photos, map, phone, email.
- Bank transfer queue: verify receipt / mark paid / reject. Do not treat this as guest-approval of the booking.
- On-request extras: approve or decline (with an optional note). If approved and priced, charge via Stripe or a follow-up bank transfer — do not reopen the stay hold.
- Adding a stay never requires a deploy or a code change.

## Availability: booked dates in the API response

Guests must **see which dates are taken before they pick**, not discover it after a failed search. The API returns the unavailable dates and the guest date pickers **disable** them. Booking rules still live in NestJS; the UI only disables what the API says is taken.

**Endpoints (guest, public, published listings only):**

- `GET /properties/:slug/houses/:houseSlug/availability?from=YYYY-MM-DD&to=YYYY-MM-DD` returns the unavailable dates for one stay over a bounded window (default: today through 12 months, max 24 months).
- `GET /properties/:slug/availability?from&to` returns the dates when **no stay** at the property is free (`fullyBookedNights`), so a property-level picker only disables days that truly cannot be booked. A day is **not** disabled while any stay is still free.
- Optional `checkIn=YYYY-MM-DD` (stay endpoint only): once the guest picks a check-in, the response also includes `maxCheckOutDate`, the latest valid check-out (the day the next booking starts, or the window end `to` when nothing follows). The UI disables later days on the check-out picker. The UI never works this out itself. A check-in that is in the past or outside the window returns `400 INVALID_DATES`; one that falls on an occupied night returns `409 CHECK_IN_UNAVAILABLE`.
- Other errors: `404 HOUSE_NOT_FOUND` / `PROPERTY_NOT_FOUND` (also for unpublished listings), `400 INVALID_DATES` (malformed or inverted), `400 WINDOW_TOO_LARGE` (over 24 months). A `from` in the past is raised to today.

**What counts as unavailable (computed in the API):**

- Confirmed reservations, including `pending_payment` bank transfers.
- **Active holds** (card 15 minutes, bank 48 hours). They free up again if the hold expires, so the UI refetches when the picker opens and after any `DATES_UNAVAILABLE` error. A hold past `expires_at` is excluded by clock even if its row has not been marked `expired` yet; the GET never writes.
- Staff blocks (`inventory_blocks`).
- Hotel-style edges: a check-out day is **free as a check-in** for the next guest. Only occupied **nights** disable a day as a check-in.

**Response shape (interface in `packages/shared-types`):**

```ts
interface DateRange {
  startDate: string;   // first occupied night, YYYY-MM-DD
  endDate: string;     // check-out day (exclusive), same [start, end) rule as reservations
}

interface HouseAvailability {
  houseId: string;
  from: string;
  to: string;
  unavailable: DateRange[];       // merged, sorted, non-overlapping
  maxCheckOutDate: string | null; // null unless checkIn was sent
}

interface PropertyAvailability {
  propertyId: string;
  from: string;
  to: string;
  fullyBookedNights: DateRange[]; // nights when every published house is taken
}
```

**Privacy:** guests get **dates only**. Never a guest name, reservation id, hold id, or the reason (booked vs held vs blocked). Staff see details through the staff calendar, not this endpoint.

**Rules:**

1. **The picker is UX, the API is the rule.** Disabled dates are a convenience. `GET quotes` and `POST holds` still validate overlap and return `DATES_UNAVAILABLE` if two guests race for the same dates. See `docs/01-architecture.md`.
2. **Past days** stay disabled on guest calendars too (property timezone). **Admin calendars do not disable booked or past days:** staff keep full rights, and the admin calendar shows the stays with their details.
3. **PostgreSQL is the source.** The response is built from PostgreSQL on every request today. A short Redis cache per stay is allowed later, invalidated on hold, confirm, cancel, expire, and block. Never build the list from Redis alone.
4. **No N+1.** The property-level response and search load occupied nights for all stays in one query and merge ranges in memory.
5. **Bounded window.** `from`/`to` are required or defaulted, and a window over the maximum is rejected, so a request cannot load unbounded rows.
6. **Merged ranges.** Back-to-back bookings are returned as separate ranges only when there is a free check-in day between them; otherwise they are merged into one range so the UI stays simple.
7. **Empty and error states.** If the request fails the picker stays usable and the API quote check is the fallback. A fully booked window shows a clear "no availability, try other dates" message, never a blank calendar.

## Pricing by date range

The nightly price is **not flat**. The operator has peak season, shoulder season, holidays, and so on, so the same stay costs a different amount depending on which nights the guest books. This replaces the single `houses.nightly_rate_cents` quote.

### Model (per stay)

- **Standard rate** (`houses.nightly_rate_cents`): the default nightly price for any night not covered by a rate period. Always set. The column name is historical; in the UI and docs it is the "standard rate".
- **Rate periods**: an **array** of date ranges, each with its own nightly rate and a label. Many per stay, any kind of range (peak season, holidays, a local festival, low season).
- Money is integer minor units plus a currency code. Never floats.

```ts
interface RatePeriod {
  id: string;
  houseId: string;
  label: string;          // "Peak 2027", "Christmas"
  startDate: string;      // inclusive night, YYYY-MM-DD
  endDate: string;        // inclusive night, >= startDate
  nightlyRateCents: number;
}
```

### Rules (all enforced in NestJS, none in React)

1. **Priced per night.** The nights of a booking are check-in through the night before check-out. Each night takes the rate of the period that contains it, otherwise the standard rate. The booking subtotal is the **sum of the nightly rates**.
2. **Bookings can cross seasons.** A booking that starts in standard rate and ends in peak is priced night by night, not at one rate for the whole booking.
3. **Conflict guardrail: no overlapping periods on one stay.** Enforced in two places: PostgreSQL (exclusion constraint on `house_id` + date range, so no code path can bypass it) and the service (so the error is readable). Two periods that touch on the same night conflict. Back-to-back ranges (one ends the 14th, the next starts the 15th) are fine. Gaps are fine and fall back to the standard rate.
4. **Conflict errors are specific.** The API rejects an add or edit with `409` and `code: "RATE_PERIOD_OVERLAP"`, and the body names the conflicting period (label + dates) so staff can fix it. The admin form shows that message inline and keeps the form filled. It never saves a conflicting period and never silently shrinks or deletes another one.
5. **Other validation:** `endDate >= startDate`, rate is a non-negative integer, label required. Admin may use past dates (staff are never blocked); editing a period changes future quotes only.
6. **Quote shows the breakdown.** `GET quotes` returns the subtotal **and** the per-night lines (or grouped by rate), then any discount lines, then the total. The stay page and checkout show "3 nights × €180 + 2 nights × €260 − 10% long booking". The UI renders what the API returns and never recomputes it.
7. **Price is snapshotted at booking.** The reservation stores the nightly breakdown, the discount lines applied, and the total. Editing a period or discount later never changes an existing reservation. Refunds use the amount actually paid (`docs/07-cancellation-policy.md`).
8. **Rebooking re-quotes.** A rebook prices the **new** nights with the periods and discounts in force at that time.
9. **No N+1.** Quote and search load all periods and discounts for all candidate stays in **one** query each and price in memory (`docs/02-coding-standards.md`). Search shows the booking total per stay, so this path is hot.
10. **Property timezone** decides which calendar date a night belongs to.

### Implemented (seasonal rates)

Built and tested. Discounts are built too (see **Implemented (discounts)** below).

- **Tables:** `rate_periods` (inclusive `start_date`/`end_date`, `nightly_rate_cents`, PostgreSQL exclusion constraint `rate_periods_no_overlap`) and `rate_period_bulk_applications` (audit log). `inventory_blocks.price_snapshot` stores the quoted lines on the hold.
- **Guest API:** `GET /quotes` and `GET /search` return `lines` (priced nights grouped by rate: label, nights, rate, subtotal) and `totalCents`. Search loads every candidate stay's periods in **one** query. `POST /holds` stores the quote (`total_cents`, `price_snapshot`).
- **Staff API** (`StaffGuard`): `GET|POST /staff/houses/:houseId/rate-periods`, `PATCH|DELETE /staff/rate-periods/:periodId`, `POST /staff/properties/:propertyId/rate-periods/bulk/preview`, `POST /staff/properties/:propertyId/rate-periods/bulk` (needs `confirmed: true`, else `400 CONFIRMATION_REQUIRED`).
- **Errors:** `409 RATE_PERIOD_OVERLAP` (names the clashing period), `400 INVALID_RATE_PERIOD`, `400 UNKNOWN_HOUSE`, `404 RATE_PERIOD_NOT_FOUND`.
- **Admin:** Stays tab, "Seasonal rates" per stay: list, add, edit, delete (with confirmation), and "Apply to all stays at this property" with the preview and warning dialog. Stays with a clash are skipped, never overwritten.
- **Guest UI:** the checkout shows the per-rate breakdown from the API. Cards and the stay header say "Standard rate", because individual nights can cost more.
- **Known gap:** the staff calendar falls back to `nights x standard rate` for a booking that has no stored `total_cents` (seeded demo bookings have one; every new hold and paid reservation does). `GET /holds/:id` now shows the price saved with the hold; only holds made before snapshots existed fall back to a live quote.

### Apply to all stays (warning required)

A property has many stays, so admin offers **"Apply to all stays"** (or a chosen subset) when adding a rate period, so peak season is not typed stay by stay. This touches many stays at once, so it is guarded:

1. **Preview first.** Before saving, the API runs a dry run (`POST .../rate-periods/bulk/preview`) and returns, per stay: will be added, or conflicts with period X.
2. **Warning dialog.** Admin must confirm a dialog that states how many stays will change, names the period (label, dates, rate), and lists every stay that has a conflict. The primary action is not the default focus. This is a destructive-class action under `docs/02-coding-standards.md`.
3. **Conflicts are never overwritten silently.** For stays with a conflict, staff choose explicitly: **skip those stays** (default) or **cancel the whole operation**. Replacing an existing period is a separate, deliberate edit on that stay, not a side effect of bulk apply.
4. **All or nothing per confirmation.** The apply runs in one transaction. The result lists what was added and what was skipped. A toast summarizes it.
5. **Existing reservations are untouched**, and the dialog says so. Only future quotes change.
6. **Audit log.** Record who applied it, when, and to which stays.

## Discounts

Discounts are **admin-configured and flexible**. The client should be able to add a new kind of discount without a deploy. The API owns all calculation. React only displays the discount lines the quote returns.

### Model

A discount is an **effect** plus a list of **conditions**. It applies when **all** conditions match.

```ts
type DiscountEffect =
  | { kind: "percent"; percent: number }          // 0-100 off the eligible amount
  | { kind: "fixed"; amountCents: number };       // fixed amount off

type DiscountCondition =
  | { kind: "min_nights"; nights: number }                 // long stay
  | { kind: "booking_lead_days"; minDays?: number; maxDays?: number } // early bird / last minute
  | { kind: "stay_dates"; startDate: string; endDate: string }        // stay falls in a window
  | { kind: "booking_window"; startDate: string; endDate: string }    // booked within a sale window
  | { kind: "weekday"; days: number[] }                    // e.g. Sun-Thu only
  | { kind: "promo_code"; code: string };                  // guest types a code

interface Discount {
  id: string;
  propertyId: string;
  houseIds: string[] | null;   // null = every house in the property
  label: string;               // shown on the quote and the email
  effect: DiscountEffect;
  conditions: DiscountCondition[];
  combinable: boolean;         // may stack with other combinable discounts
  priority: number;            // lower runs first
  active: boolean;
  maxRedemptions: number | null;
}
```

New condition kinds are added to the union and to the API evaluator. The admin screen is data-driven off the same union, so adding one is a code change in one place, not a new table.

Typical presets staff can create from the same form: **long booking** (e.g. 7+ nights, 10%), **early bird** (booked 60+ days ahead), **last minute**, **seasonal sale** (booking dates), **promo code**, **weekday special**.

### Rules (NestJS only)

1. **Applies to the booking subtotal only** (the summed nightly rates). Extras are not discounted unless a later story says so.
2. **Stacking:** by default the guest gets the **single best** matching discount. Discounts marked `combinable` may stack with each other, applied in `priority` order, each on the amount left by the previous one.
3. **Floor:** the booking total never goes below zero, and a fixed discount never exceeds the subtotal.
4. **Rounding:** `round(amount * percent / 100)` in integer cents, same method everywhere.
5. **Promo codes** are validated by the API, case-insensitive, and rate-limited (no guessing codes by brute force). An invalid or expired code gives a clear message and never blocks the booking.
6. **Visible, not hidden:** the quote, the checkout summary, and the confirmation email show each discount as its own line with its label.
7. **Snapshot:** applied discount lines are stored on the reservation (`price_snapshot`). Later edits or deletions of a discount never change an existing booking.
8. **Guardrails in admin:** percent 0-100 integer, fixed amount non-negative, at least one condition unless explicitly marked "always on", date windows with `end >= start`, and a warning when a `combinable` stack could exceed a configurable maximum total discount percent (org setting, not hardcoded).
9. **Scope:** property-wide by default, or limited to chosen stays. Property-wide "apply to all stays" discounts show the same confirmation warning as bulk rate periods.
10. **Cancellation and refunds** use the amount actually paid (after discount). See `docs/07-cancellation-policy.md`.
11. **No N+1:** active discounts for the property are loaded once per quote or search request.

### Implemented (discounts)

- **Tables:** `discounts` (effect, `conditions` JSON, `always_on`, optional `house_ids`, `combinable`, `priority`, `active`, `max_redemptions`; the database refuses a percent over 100 and a discount with no conditions unless `always_on`) and `discount_redemptions` (one row per paid booking that used it).
- **Condition meanings (exact):** `min_nights` = the booking has at least N nights. `booking_lead_days` = whole days from booking day (property timezone) to check-in, inclusive at both ends, either end optional. `stay_dates` = **every** night of the booking is inside the window. `booking_window` = the booking day is inside the window. `weekday` = **every** night is one of the listed weekdays (0 = Sunday). `promo_code` = the typed code matches, ignoring case and spaces. All conditions on a discount must match.
- **Stacking:** the guest gets whichever saves more of (a) the single best non-combinable discount or (b) the stack of all matching combinable discounts, applied in priority order, each on what is left. They never mix, and ties go to the single discount. The total never goes below zero.
- **Quote:** `GET /quotes` (optional `promoCode`) and `GET /search` return `subtotalCents`, `discounts[]`, `discountCents`, `totalCents`, and `promoCode { code, applied, message }`. A wrong or unusable code only returns a message ("That code is not valid", "This code does not apply to these dates", "A better offer is already applied to this booking") and never blocks the booking. Search loads discounts for all candidate stays in one query.
- **Promo-code guessing:** at most 20 quote or hold requests carrying a code per minute per IP (`429 PROMO_RATE_LIMITED`). Requests without a code are never counted.
- **Snapshot and use limits:** the hold stores the full quoted price including discount lines. A discount counts toward `max_redemptions` only when a booking is **paid and confirmed**, not when it is merely held.
- **Staff API** (`StaffGuard`): `GET|POST /staff/properties/:propertyId/discounts`, `PATCH|DELETE /staff/discounts/:discountId`. Errors: `400 INVALID_DISCOUNT` (with a readable message), `400 UNKNOWN_HOUSE`, `404 DISCOUNT_NOT_FOUND`.
- **Admin:** property workspace tab "5. Discounts": list, add, edit, delete (with confirmation). Saving a **new** discount that applies to all stays shows a warning dialog first.
- **Guest UI:** a promo code field with an explicit Apply (no request per keystroke), and each discount as its own line in the price breakdown.
- **Not built:** the organization-wide "warn when a stack exceeds a maximum total discount %" guardrail (rule 8 above). Each discount is already limited to 100%.

**Still not decided (do not build until the client confirms):** minimum-night rules per season, weekend rates as a separate price (weekday *discounts* above are covered), taxes and city-tax lines, gift cards.

## Cancellation

See `docs/07-cancellation-policy.md`. Admin sets refund **days + %**, and whether bookings are **rebookable** (optional **fee**: none / fixed / percent). The API only **calculates** from the snapshot saved at booking. If not rebookable, guest **cancels and books again**. If we cancel, **100%** refund. Disclose no 14-day cooling-off before pay.

## Listing: photos, map, contact

Guests must see **where** the property is, **what it looks like**, and **how to call** — before they book. This is listing content, not a chat product.

| Field | Where | Guest UI |
| --- | --- | --- |
| Photo gallery | Property and each stay | Lightbox / carousel. First photo is the card image. No empty image slots. |
| Address + lat/lng | Property (required). Stay may override if it is not on the same grounds. | Map on the property and stay pages. |
| Phone | Property (required to publish). Optional stay phone. | Visible `tel:` link (click-to-call on mobile). |
| Email | Property | `mailto:` link. |

Map rules:

- Embed with **MapLibre GL** and **OpenStreetMap** tiles (no Google script on page load, no Mapbox/Google/CARTO key for the pin).
- Do not use the Google Maps JavaScript SDK (or Mapbox GL billed tokens) on the listing. Leaflet raster OSM is a fallback, not the default.
- **Directions:** buttons that open Google Maps and Apple Maps in a new tab (`https://maps.google.com/?q=lat,lng` and the Apple maps URL). That is enough for turn-by-turn.
- Do not load the Google Maps JavaScript SDK unless the guest has given cookie consent. Prefer the OSM-data embed + external directions links so ads/maps consent stays simple.
- Admin places the pin (address search or lat/lng). Do not hardcode coordinates in the frontend.
- Unpublished properties still have a map in admin preview; guests never see it.

Communication: phone and email on the listing only. **Do not** build an in-app messenger (Airbnb inbox). Booking notes stay on the reservation.

## Booking rules (stays)

- **Straight-through booking:** pick stay + dates → extras → pay. Card: 15-minute freeze then auto-confirm. Bank transfer: 48-hour freeze, receipt upload, staff **verify payment** (not “accept guest”).
- A stay is booked **exclusively** for the booking dates (same idea as one hotel **room**, but the unit is a **whole stay**).
- One property has **many stays**. A freeze or booking on Stay A does **not** block Stay B on the same property. Search still shows other stays for those dates.
- Do not invent hotel-style “5 identical deluxe rooms” unless a later story asks for it. Each stay has its own calendar (usually quantity = 1).
- Card hold: `HOLD_TTL_SECONDS = 900`. Warn at **5 minutes left** (`HOLD_WARN_REMAINING_SECONDS = 300`). Bank hold: `BANK_TRANSFER_HOLD_TTL_SECONDS = 172800`. See `docs/05-eu-compliance-and-payments.md`.

## Simple checkout (do not add hassle)

**To complete the booking, only:**

1. Stay + dates (already chosen)
2. Booker **first name, last name, email, phone**
3. **How many guests** will stay (number, 1 through stay capacity)
4. Optional instant extras (checkboxes; default off)
5. Cancellation / no cooling-off tick
6. Pay (wallet, card, or bank)

No other-guest names, **no ID / passport photos (we do not store IDs)**, no address form, no account-required wall. Guest may stay logged out (email is the key).

**On arrival:** staff confirm the party size in person (admin check-in). The app does not collect identity documents.

## Reviews (after the visit)

Optional, simple, not an Airbnb review network.

- After **check-out date**, email the booker a link: rating + a short text about their visit (“good stuff” / experience).
- They can skip. No photos required. No public guest-to-guest thread.
- Staff can publish or hide a review on the stay/property page.
- Do not block booking on reviews. Do not require an account beyond the booking email link.

## Extra services

Staff create extras per property (not hardcoded in the app).

| Kind | Guest at checkout | Booking | Money |
| --- | --- | --- | --- |
| `instant` | Add breakfast (etc.) with a price | Stay confirms when **payment** is confirmed | Included in card charge **or** in the bank-transfer amount |
| `on_request` | Request (e.g. private dinner, special setup) | **Stay still confirms** | No extra charge until staff approve; then pay-later / extra Stripe charge |

Rules:

- Extras must **not** freeze the stay waiting for a human. Approval is only for the extra.
- Declining an extra never cancels the reservation.
- Optional free-text “message to the property” is not an extra; it is a note on the reservation (no approval workflow).
- Do not build a marketplace of third-party vendors. Catalog is the operator’s own services.

## Out of scope for v1 (do not build as if we were Airbnb)

- Multi-host marketplace, host payouts, Airbnb/VRBO channel sync
- Guest-to-guest messaging inbox (email confirmation is enough at first)
- Reviews network, wishlists, Superhost-style social graph (a **simple post-visit review** is in scope)
- Complex booking (split bookings, host approval **of the stay**, multi-house carts)

Those can be added later. Channel managers (re-sync to Airbnb) are a **conscious** future integration, not the reason this app exists. The point is to **leave** Airbnb.

## Payments and ads

- **Payments to keep the money:** bank transfer (~€0), then Stripe **card + Apple Pay + Google Pay** (same card fee). No PayPal/Klarna in v1.
- Stripe payouts to the client’s bank are typically **days**, not 30 days.
- Never store raw card numbers. SCA/3-D Secure on the card/wallet path.
- Google/Meta tags belong only on `apps/web` **after cookie consent**.
- Domain TLD is a branding choice. Details in `docs/05-eu-compliance-and-payments.md`.
- UI: `docs/06-ui-theme.md` (8px professional buttons).
