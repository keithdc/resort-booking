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
| **Stay** | One bookable unit inside a property, e.g. Lake Chalet | `house` | `houses` | `/properties/:slug/stays/:staySlug` (API paths keep `houses`) |

Rules for writing:

- In user-facing text and docs prose use **Property** and **Stay**. In code keep `property` and `house`.
- **"Stay" never means a booking.** A guest's booking is a **booking** or **reservation** ("your booking is confirmed", "confirmed bookings"). Use "stay" only for the bookable unit. The plain verb ("stay on this page", "guests stay for three nights") is fine.
- Error `code` values (`HOUSE_NOT_FOUND`, `PROPERTY_NOT_FOUND`) are code, not text. They do not change.

Every durable row that is property-scoped stores `organization_id` and `property_id`. Stay-scoped rows also store `house_id`. Queries always filter by these ids so a third property cannot leak into the first.

## What guests see (`apps/web`)

- Browse **all published properties**, or land on one property by URL (`/properties/[slug]`).
- Property page: header with one **availability search that works in place** ("Check availability at {property}"; dates go in the page URL: `checkIn`, `checkOut`, `nights`, `guestCount`), **photo gallery**, the list of stays, a compact cancellation section, then **map + address**, **phone** (`tel:`) and email. With dates, the page asks the search API for this property and lists **every** stay: the free ones first with the API's price for those dates, the rest muted and labelled "Not available for these dates and guests" (still links, so the guest can pick other dates). A polite live-region summary reads "2 of 3 stays available for 10 Jul to 12 Jul · 2 guests" with a "Clear dates" link; bad or past dates, or a failed search, fall back to the undated list with a short message. Availability is only ever the API's answer.
- Inside a property, list **stays** with photos, capacity, amenities, and price for selected dates (the **booking total**, which can differ by season; "from €X / night" only when no dates are picked).
- Stay page: gallery, amenities, map (same pin as the property unless the stay has its own coordinates), contact, book CTA.
- Search: check-in, check-out, guest count — across one property or all properties. **Past days and already-booked dates are disabled** on guest calendars (booked dates come from the availability API, see **Availability: booked dates in the API response**).
- **Search map (built):** the results page shows a map beside the list (behind a "Show map" toggle on phones). **Every stay is on the map with its own price**: stays that share a place (usually every stay of one property) appear as a small stack of chips ("Lake Chalet 960,00 €"), cheapest first, one chip per stay, pointing at the place. A chip opens its stay with the guest's dates kept. Hovering a chip lights up its card and hovering a card lights up its chip. More than four stays at one place collapse into "+N more", which opens the full list. Each stay summary carries `mapLatitude`/`mapLongitude` (its own coordinates if it has a complete pair, otherwise its property's, never half and half). Stays without usable coordinates stay in the list but not on the map. The map loads on demand (MapLibre on a light vector basemap, no Google SDK). Stays appear as Airbnb-style pills: white with a hairline border and soft shadow; the active one turns dark and slightly larger.
- **Properties page (built):** `/properties` lists every published property as cards (photo, name, address, link to its stays). The header and footer "Properties" links go there, and the home page shows the same cards.
- **Manage a booking (built):** `/manage` lets a guest with no account look up a booking by reference and email, see what cancelling would refund, and cancel after a confirmation that states the exact amount. When the policy saved with the booking allows it, the same page has **Change dates**: pick a new check-in and number of nights (the calendar disables taken dates, but not the booking's own), see the exact price difference (new total, change fee, what was already paid, and one sentence: pay more, get money back, or nothing), then confirm. A balance is paid first (test mode today); a refund or nothing changes the dates straight away. A changed booking gets a **new reference**, and the old one shows "replaced by" it. Backend and rules: `docs/07-cancellation-policy.md`.
- Stay page is the SEO/ads landing URL (`/properties/[slug]/stays/[slug]` (old `/houses/` URLs redirect permanently)).
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
- **Reports** (`/reports`): the owner report, described under "Owner report" below.
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
- **Guest UI:** the checkout shows the per-rate breakdown from the API. Cards say "Standard rate", because individual nights can cost more. The stay page header follows the dates in the checkout: it shows "Standard rate 320,00 € / night" until dates are priced, then the seasonal rate and its name ("416,00 € / night · Peak summer 2027"), or a range ("320,00 € – 416,00 € / night") when the stay crosses seasons. It only formats the API's quote lines; discounts never change the nightly rate shown.
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
  combinable: boolean;         // only read for a promo-code discount (a coupon): stack after the automatic discount
  priority: number;            // kept for old data, no longer read or shown (default 100)
  active: boolean;
  maxRedemptions: number | null;
}
```

New condition kinds are added to the union and to the API evaluator. The admin screen is data-driven off the same union, so adding one is a code change in one place, not a new table.

Typical presets staff can create from the same form: **long booking** (e.g. 7+ nights, 10%), **early bird** (booked 60+ days ahead), **last minute**, **seasonal sale** (booking dates), **promo code**, **weekday special**.

### Rules (NestJS only)

1. **Applies to the booking subtotal only** (the summed nightly rates). Extras are not discounted unless a later story says so.
2. **Stacking:** **automatic** discounts (no promo code) never stack with each other: the guest gets the single best one. A **promo-code discount is a coupon** and stacks on top of it, taken from the amount the automatic discount left (automatic first, then the coupon). A coupon switched to "not combinable" never stacks: the guest gets whichever saves more, that coupon alone or the best automatic discount alone.
3. **Floor:** the booking total never goes below zero, and a fixed discount never exceeds the subtotal.
4. **Rounding:** `round(amount * percent / 100)` in integer cents, same method everywhere.
5. **Promo codes** are validated by the API, case-insensitive, and rate-limited (no guessing codes by brute force). An invalid or expired code gives a clear message and never blocks the booking.
6. **Visible, not hidden:** the quote, the checkout summary, and the confirmation email show each discount as its own line with its label.
7. **Snapshot:** applied discount lines are stored on the reservation (`price_snapshot`). Later edits or deletions of a discount never change an existing booking.
8. **Guardrails in admin:** percent 0-100 integer, fixed amount non-negative, at least one condition unless explicitly marked "always on", date windows with `end >= start`, and a warning when a stack (automatic + coupon) could exceed a configurable maximum total discount percent (org setting, not hardcoded).
9. **Scope:** property-wide by default, or limited to chosen stays. Property-wide "apply to all stays" discounts show the same confirmation warning as bulk rate periods.
10. **Cancellation and refunds** use the amount actually paid (after discount). See `docs/07-cancellation-policy.md`.
11. **No N+1:** active discounts for the property are loaded once per quote or search request.

### Implemented (discounts)

- **Tables:** `discounts` (effect, `conditions` JSON, `always_on`, optional `house_ids`, `combinable`, `priority`, `active`, `max_redemptions`; the database refuses a percent over 100 and a discount with no conditions unless `always_on`) and `discount_redemptions` (one row per paid booking that used it).
- **Condition meanings (exact):** `min_nights` = the booking has at least N nights. `booking_lead_days` = whole days from booking day (property timezone) to check-in, inclusive at both ends, either end optional. `stay_dates` = **every** night of the booking is inside the window. `booking_window` = the booking day is inside the window. `weekday` = **every** night is one of the listed weekdays (0 = Sunday). `promo_code` = the typed code matches, ignoring case and spaces. All conditions on a discount must match.
- **Two different date settings (admin):** "**How long does it run?**" (Starts / Ends, optional, the `booking_window` condition) is when the **guest books**: a discount with a window of 1 Dec to 31 Dec is only applied, and only promoted, to guests who book on those days, so on 25 Nov a guest looking at December stays does not see it yet (the dialog says "Starts in 6 days: until then guests do not see or get this discount."). "**Only for stays between these dates**" (Stay from / Stay until, the `stay_dates` condition) is which **stay dates** qualify, e.g. only July stays; the whole stay must fall inside. Both dates are required once either is filled; blank means it runs until it is switched off. The list says "Book 1 Dec – 31 Dec 2026" and "Stays 1 Jul – 31 Aug 2026", and shows ONE status chip per discount (precedence: Off, Used up, Ended, Starts 1 Dec, Live).
- **Stacking (owner's model):** (1) automatic discounts never stack with each other: the guest gets the best one (ties: name order). (2) A promo-code discount is a coupon: only one code can be typed per booking, and it stacks on top of the best automatic discount, taken from what is left. (3) If a coupon is switched to "not combinable", the guest gets whichever saves more, that coupon alone or the automatic one alone, never both; on a tie the automatic discount wins. A coupon never applies without its code. The total never goes below zero. **Priority is gone from the admin and from the rules**: the `priority` column is kept for old data and clients (optional in the API, default 100) but nothing reads it.
- **Worked example (a coupon on a long stay):** 7 nights at 140,00 € = 980,00 €. The automatic "Long stay: 7+ nights" (10%) takes 98,00 € off, leaving 882,00 €. The typed code "Welcome code" (15%) then takes 15% of what is left, 132,30 €, so the total is **749,70 €**. Without the code the guest still gets the long-stay discount; on a short stay only the code applies; with two automatic discounts only the better one applies, and the coupon goes on top of it.
- **Usage limits:** any discount, automatic or coupon, can have "Limit how many bookings can use it" (`max_redemptions`). A booking counts only when it is paid and confirmed. When the limit is reached the discount is no longer applied, no longer promoted on the site, and a typed code says "This code has been used up". The admin list shows "3 of 10 used" and a "Used up" chip.
- **Admin form:** no Priority field. Automatic discounts show "Automatic discounts do not stack with each other: the guest gets the best one." and are saved as not combinable (the flag means nothing for them). When "Promo code" is ticked the form shows "Can be used together with an automatic discount" (default **on**: "A coupon is applied after the best automatic discount, on what is left. Turn off to make it replace the automatic discount when it saves more."). The list says "Automatic: the best one applies", "Coupon: stacks after the automatic discount" or "Coupon: replaces the automatic discount when better". Migration `025_stackable_sample_discounts.sql` (restart the API to apply) set the seeded "Welcome code" to stack; no further migration is needed for this model.
- **Discount lines say their size:** a percentage discount's quote line carries `percent` (`QuoteDiscountLine.percent`, optional; absent for a fixed amount and for price snapshots saved before it existed) and every screen that lists the lines shows it next to the name ("Long stay: 7+ nights · 10% off", unless the name already says it). The guest checkout and the date-change summaries add "Your discounts are combined." (staff: "Discounts are combined.") when an automatic discount and a coupon both apply (more than one line). Amounts are unchanged: this is wording only.
- **Quote:** `GET /quotes` (optional `promoCode`) and `GET /search` return `subtotalCents`, `discounts[]`, `discountCents`, `totalCents`, and `promoCode { code, applied, message }`. A wrong or unusable code only returns a message ("That code is not valid", "This code does not apply to these dates", "A better offer is already applied to this booking", "This code has been used up") and never blocks the booking. Search loads discounts for all candidate stays in one query.
- **Promo-code guessing:** at most 20 quote or hold requests carrying a code per minute per IP (`429 PROMO_RATE_LIMITED`). Requests without a code are never counted.
- **Snapshot and use limits:** the hold stores the full quoted price including discount lines. A discount counts toward `max_redemptions` only when a booking is **paid and confirmed**, not when it is merely held.
- **Staff API** (`StaffGuard`): `GET|POST /staff/properties/:propertyId/discounts`, `PATCH|DELETE /staff/discounts/:discountId`. Errors: `400 INVALID_DISCOUNT` (with a readable message), `400 UNKNOWN_HOUSE`, `404 DISCOUNT_NOT_FOUND`.
- **Admin:** property workspace tab "5. Discounts": list, add, edit, delete (with confirmation). Saving a **new** discount that applies to all stays shows a warning dialog first.
- **Guest UI:** a promo code field with an explicit Apply (no request per keystroke), and each discount as its own line in the price breakdown.

### Promoted offers (advertising a discount)

A discount can be **advertised** so guests see it before they pick dates (migration `024_promoted_discounts.sql`: `promoted boolean NOT NULL DEFAULT false`). **Restart the API after pulling this change** so migration 024 applies and the new route exists.

- **Admin switch "Show on the website"** in the discount dialog, off by default (`promoted` on `DiscountWrite`; optional in the request so an older admin keeps working). With a promo code the helper text warns "Guests will SEE this code on the website. Leave off to keep the code private." The discounts list shows a "Promoted" chip.
- **Public endpoint:** `GET /properties/:slug/offers` (no auth, published properties only) returns `PromotedOffer[]`: `id, name, kind, value, currencyCode, minNights, nightsOnly, promoCode, houseIds, validFrom, validTo, headline`. Only **active, promoted** discounts that can still be used today (property timezone: booking window open, stay dates not over, use limit not reached) and sit on at least one published stay. One query for the discounts, one for the property and one for its stays: no per-offer lookups.
- **The code is exposed only for promoted discounts.** A non-promoted promo code never appears in any response. Priority and stacking flags are never exposed.
- **The API writes the headline** from the numbers: "Save 10% when you stay 7 or more nights", "Use code WELCOME10 for 10% off", "Save 50 € when you stay 3 or more nights". Every condition kind has a plain phrase (minimum nights, stay dates, weekdays, booking lead time, booking window). `validFrom`/`validTo` are the booking window when there is one. `nightsOnly` is true when the minimum stay is the only condition besides a code.
- **Guest UI (display only, never prices):** the stay page shows the offers that apply to that stay in a highlighted box above "About this stay" (a "Copy code" icon follows the text of code offers). There is no banner strip. Stay cards show the headlines of the offers that apply to that stay. Before enough nights are chosen the booking box adds "Add 3 more nights to save 10%" for a percentage long-stay offer (display arithmetic from `minNights`; nothing once the guest has enough nights, because the quote then shows the real discount line). The stay page accepts `?promo=CODE` to **pre-fill** the promo field; the guest still presses Apply. The home page does not show offers (it would need one offers call per property).
- **Errors:** unknown or unpublished property: `404 PROPERTY_NOT_FOUND`. A failed offers call never breaks a guest page: it shows no offers.
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

- Embed with **MapLibre GL** on a **vector** basemap in soft colours (no Google script on page load, no billed Mapbox/Google token). Default style: **OpenFreeMap "liberty"** (green parks, blue water; free, no key; "positron" at `https://tiles.openfreemap.org/styles/positron` is the paler alternative). Set `NEXT_PUBLIC_MAP_STYLE_URL` (a full `style.json` URL: MapTiler, Protomaps, self-hosted) or `NEXT_PUBLIC_MAPTILER_KEY` (MapTiler "dataviz-light") in `apps/web` and `apps/admin` to change it; the URL wins over the key. The logic is `resolveMapStyle` in `@resort-booking/ui/map`. The attribution stays visible (compact control).
- If the style fails to load, the map switches **once** to OpenStreetMap raster tiles so it never stays blank. OSM's public tile servers are only this last resort, not for production traffic.
- Single-place maps (property and stay pages, staff property map) show a dark circular house pin with a soft pulse (it stops for `prefers-reduced-motion`), zoom +/- buttons without a compass, no rotation, and `cooperativeGestures` so the page still scrolls (ctrl/cmd + scroll zooms).
- **Map worker:** vector tiles are decoded in a web worker, and a Next.js bundle breaks the URL MapLibre works out for it (the map then stays blank). `scripts/copy-maplibre-worker.mjs` copies the worker into `apps/<app>/public/maplibre/` before `dev` and `build` (git-ignored), and each map calls `ensureMapWorker()` (`setWorkerUrl`) before it is created. If a map is blank after a fresh checkout, run `npm run dev` (not `next dev` directly) so the copy runs.
- Do not use the Google Maps JavaScript SDK (or Mapbox GL billed tokens) on the listing. Leaflet is not used.
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
- **Single Pay button and hold timer (guest UI):** the checkout has ONE primary button, **Pay {total}** (the quote total; "Holding your dates…" while working; the bank-transfer flow keeps the explicit label "Reserve and pay by bank transfer"). Under it the page says only "We hold your dates while you pay. Nothing is charged until you pay." with **no countdown and no minutes**: the hold length exists only in the API's hold, and the timer never runs on page load. Pressing the button creates the hold (same terms payload), then the form is replaced by a **Complete your payment** step: a countdown ("We are holding these dates for you for N minutes (or hours)", a live clock `mm:ss`, or `h:mm:ss` for the bank-transfer hold, and a progress bar) and the payment panel, so there is exactly one way forward. N, the expiry and the warning moment all come from the API's hold (`holdTtlSeconds`, `expiresAt`, `warningAt`), so the web app hardcodes none of 15, 48 or 5. When the warning moment passes the bar and clock turn to the warning color and a polite live message says "Less than N minutes left. Finish paying to keep your dates." When time runs out the form returns with everything the guest typed and offers **Hold the dates again**. If the API answers `409 DATES_UNAVAILABLE` (someone else took the dates between quote and hold) the guest sees "Sorry, those dates were just taken. Pick other dates." and the availability and quote are refreshed. A declined card shows **Try again**, which releases the hold screen back to the form.

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

A **new property** starts with two guest extras so the owner has something to adjust instead of an empty list (created in the same transaction as the property, never on update): **Baby mattress / travel cot** and **Extra pillows**. Both are `on_request`, price 0 EUR, published: guests can ask, staff confirm after the stay is booked, nothing is charged. The owner sets a price (and may switch the kind to `instant`) in the property's extras tab. Existing properties are not touched. The model has no pricing unit: an extra is a name, description, kind, price, currency and a published flag.

### Extras on a booking (built for staff bookings, migration 041)

Until now the guest checkout only **listed** a property's extras ("Priced extras can be added after you pay. Ask-us extras wait for staff to confirm"): nothing saved which extra a booking wanted. A staff booking can now carry extras, stored in `reservation_extras` (one row per extra: a **copy** of the name, kind, unit price and currency offered, the quantity 1-20, the line amount and a status), so editing or deleting the catalog entry later never changes a booking. The guest checkout can reuse the table when it starts taking extras.

- **Offered:** only the **published** extras of the stay's property and organization (`GET /staff/properties/:id/booking-extras`, admins and employees). An id from another property or organization, an unpublished one or an unknown one answers 404 `EXTRA_NOT_FOUND`; the same extra twice is 400 `DUPLICATE_EXTRA`; at most 10 different extras, quantity 1-20 (strict request body: a price, name or status sent by the client is refused).
- **Money:** `instant` extra: line = unit price x quantity, status `confirmed`, **added to the booking total** (`total_cents`, so what is owed, marked paid and refunded all include it); extras are not discounted. A priced extra in another currency than the stay is 400 `EXTRA_CURRENCY_MISMATCH`. `on_request` extra: line 0, status `pending`, nothing charged now ("approve or decline" is not built; the status list is ready for it).
- **Quote:** `POST /staff/reservations/quote` takes the same optional `extras` and answers the stay figures plus `extras` lines and `extrasCents`; `totalCents` is the whole booking. The saved price snapshot keeps the stay's own figures and an `extrasCents` field on top.
- **Changing dates (extras ride along):** a date change is cancel-and-rebook in one step, so the booking's extras travel to the new booking **exactly as they were booked**: same name, quantity and **saved price** (never today's catalog price, so a later price edit cannot make a change unequal). New total = the new stay (today's rates and discounts, as before) **plus the same extras**; the difference against what was already paid decides the rest as usual: the guest pays the difference when the new total is higher, gets money back when it is lower, nothing moves when equal. The change fee keeps its rule (a percent fee is a share of what was paid, extras included, the same base a cancellation refund uses). The quote shows a line "Extras carried over: Breakfast × 2, Private dinner (on request)" with what they add ("No charge" for requests and free extras), both on the guest's /manage page and in the staff change-dates dialog. A pay-at-hotel booking that is still pending cannot have its dates changed until it is marked paid (`PAYMENT_PENDING`).
- **Cancelling / refunds:** unchanged: the refund is a percentage of what was **paid**, which includes the instant extras once the booking is paid; a pending booking refunds 0.

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

## Search visibility (SEO)

How the guest site is found on Google and shared on social media. Code: `apps/web/src/shared/seo/`, the route files in `apps/web/src/app/`.

- **Site address.** Set `SITE_URL` (read when the server starts) or `NEXT_PUBLIC_SITE_URL` (fixed at build) to the real public address, for example `https://www.example.com`. Without it, in production, no canonical links, structured-data links or sitemap entries are written (so localhost addresses never reach search engines). Set it before the site goes public.
- **Titles and descriptions** are built from the data on each page: the home page names the towns; a property page says "Name: stays in Town" with the number of stays, how many it sleeps and the lowest price; a stay page says "Stay at Property, Town" with "Sleeps N, from X per night" and the stay's own description. Descriptions are cut at about 155 characters. Each page has its own canonical link (always the clean address, whatever dates or promo code are in the link) and its own Open Graph and Twitter cards, with the cover photo.
- **Not indexed:** the search results page and the manage-booking page carry `noindex`, and `robots.txt` also keeps crawlers out of `/manage`, `/search` and any link with `checkIn=` in it. The old `/houses/` stay addresses redirect permanently to `/stays/`.
- **`/sitemap.xml`** lists the home page, the property list, every published property and every published stay, built on request from the API. Unpublished items are never listed. If the API is down it lists less, never errors. There is no "last modified" date because the API does not give one.
- **Structured data (JSON-LD)** on the home page (`WebSite`), property pages (`LodgingBusiness`) and stay pages (`VacationRental` with sleeps and amenities), plus a breadcrumb trail. It carries the public business phone, address and price-from line only, never an email address or guest data, and **no ratings**: the site has no reviews of its own and must not invent any. The text is escaped so a stay name can never close the script tag.
- **Missing pages:** an unknown or unpublished property or stay shows the 404 screen and is marked `noindex`. It still answers with status 200 (the page streams after the loading screen has been sent); see `docs/17-pending-work.md` for the option to change that.
- **Page structure:** one `h1` per page, headings in order, a `main` landmark, a `nav` in the header, descriptive photo text, a visible mention of the town, links between the property page and its stays, and a site-wide list of properties in the footer.
- **Speed:** the first photo is loaded with high priority and the others lazily; photos use responsive `srcset`; fonts use `display=swap` with preconnect. No third-party scripts. Pages are rendered on every request (the security policy needs a fresh nonce), so they are not cached by a CDN.

## Where a booking came from (booking source)

The client may keep Airbnb running next to the direct site (years of reviews and ranking are worth keeping), so every booking records **where it came from**, and the owner report can say how many bookings and how much money each source brought. Nothing depends on a channel: with Airbnb dropped, the same fields simply show only your own sources.

- **Six sources** (`inventory_blocks.booking_source`, migration 045): **Our website** (the guest checkout, always), **Airbnb**, **Booking.com**, **Another website**, **Phone or email** and **Walk-in** (staff typed in a booking). Existing bookings: those made by a staff member became *Phone or email*, every other one stays *Our website*.
- **Staff pick it** in **New booking** ("Where did the guest book?", starting on Phone or email). The guest checkout never offers it: a guest cannot send a source (the public form refuses unknown fields), and no guest route returns it (`/manage` says "another website" in plain words and never names the site).
- **Your own sources** (website, phone or email, walk-in) work exactly as before: priced from the stay's rates, extras allowed, **Pay at hotel** with status Pending until a person marks it paid.
- **Airbnb, Booking.com, another website** (the "channel" group): that site collected the money, so the booking is saved as **Paid through that site** (`payment_method = paid_by_channel`, status `paid`, paid in full). Staff type **the total the guest paid there** (the commission that site keeps is not tracked here); it is not computed from your rates, there are **no extras** and no discounts. The dates are still checked against your calendar, so a double booking is refused. The database ties the two together: a channel reservation is always `paid_by_channel`, and `paid_by_channel` only exists with a channel source.
- **Cancelling** a channel booking frees the dates and records **no refund at all** (no refund row, whoever cancels and whatever reason is chosen): refunds are handled on that site. The cancel dialog says so. See `docs/07-cancellation-policy.md`.
- **Changing dates** on a channel booking is **not offered** (for staff and guests): the booking lives on that site, so change it there, then cancel it here and add it again. A change here would not change anything there.
- **An admin can correct a wrong source** on the booking card ("Where it came from" > Change), but **only within the same group** (own bookings among themselves, or channel bookings among themselves): the payment of a booking made elsewhere was handled there, so it cannot become one of your own. Recorded in the audit log (`booking.source_changed`: who, from, to).
- **The booking list and card** show a small chip with an icon and the words ("Airbnb", "Phone or email"...). The Bookings report can be **filtered by source** (chips with counts, shown only when there is more than one source) and has a **Source** column.
- **Report "Where bookings come from"** (top of the Bookings tab): per source the number of confirmed bookings, the nights that fall in the period, what those nights are worth (the same measure as the rest of the report) and the share of the bookings (adds up to 100). Employees without refund access see counts, nights and shares, not money. The CSV has a **Source** column and lines "Bookings from ..." (and "Revenue from ..." for people who see money).
- **Cancellations report:** a cancelled channel booking counts as a cancellation, but its paid and refunded money is shown as 0 (the money was never here).
- **Calendar import (later):** an iCal import will create calendar blocks (`kind = 'block'`) carrying the source (`airbnb`...), with no payment method; the migration allows exactly that. See `docs/17-pending-work.md` section 1.3a.

## Staff screens (cancellations, refunds, date changes)

- **Booking dialog** (calendar → click a booking): shows the reference, amount paid, terms accepted, and the cancellation, refund and history records. **Cancel booking** and **Change dates** open from here. Both default focus to the safe button, put the exact euro amount on the confirm button, and need a written note (3–500 characters) kept with the staff name.
- **Change dates** is a rebook: the old booking is cancelled and a new one (new reference) is created. Staff can waive the fee and, when money is due, record that it was settled outside the app.
- **New booking (built, pay at hotel):** the calendar page has a **New booking** button for a guest on the phone or at the desk (admins and employees). Choose the property and stay, check-in, nights and guests, see the live price (the same seasonal rates and automatic discounts a guest would get; shown by `POST /staff/reservations/quote`), enter the guest's name, email (needed: the guest finds the booking with reference + email) and optional phone and note, and choose any extras (below) and the payment. **Pay at hotel** is the only open option: the booking is **confirmed at once** (no hold, no timer, never expires on its own), its **payment status is Pending** and nothing counts as paid (`paid_cents` is 0). **Credit card** is shown but disabled ("Payment link: coming soon"): it will email or hand the guest a payment link and confirm when paid (phase 2, not built). The booking keeps the cancellation policy of that day; no guest accepted terms online, so the booking says "Booked by staff". Past check-in is refused, and so is a clash with another booking (409, nothing saved).
- **Pending and Paid:** a pending booking shows a **Pay at hotel · Pending** chip on the day list and the booking card. **Mark as paid** (admins, and employees an admin gave refund access; with a confirmation, audited with the person's name; an employee without it sees the button greyed out and who to ask) turns it into **Paid at hotel** once: the whole total then counts as paid. It never goes back to pending (database guard). A pending booking can be cancelled, with **nothing to refund**; once marked paid, a later cancellation refunds under the saved policy **by hand** (no online payment backs it). **Change dates** is refused while payment is pending (the price difference would be wrong): mark it paid first, or cancel and book again. A guest looking it up on `/manage` can cancel it (refund 0) but is told to contact the property to change dates. **Extras:** the form lists the property's published guest extras (the same list as the guest checkout) with price or "On request" and a quantity from 1 to 20; instant extras are added to the total (never discounted), on-request ones are only noted and charge nothing; the booking card, the guest's `/manage` page and the audit log (names and counts only) show them. See "Extras on a booking" below. Reports: revenue and nights count the booking as soon as it is confirmed (as they always counted the booking value); the Bookings list and CSV show "Pay at hotel · Pending". The home page and Reports show what is still to collect: **Unpaid at hotel** on the "Needs your attention" list, a banner and an **Unpaid at hotel** filter in the Bookings tab (soonest check-in first, with "Arrives in N days" / "Check-in passed"), a **To collect** line under Revenue and on the Payments tab, and payment status and paid-on date in the CSV. Employees see the counts but not the amounts (the report hides money from employees, as before).
- **Refunds** (`/refunds`, nav “Refunds”): queue filtered by Needs attention / Pending / Failed / Done / All, by property, and by search. **Retry** applies to failed refunds and pending provider refunds. A hand refund (`provider: manual`) is sent outside the app, then **Mark as refunded** with a note. The home page shows a heads-up when refunds need attention.

## Staff notes on a booking

Staff can write their **own internal notes** on a booking (a deposit taken, a late arrival, a request made by phone). They are separate from the **note from the guest** (`guest_note`, written at checkout and read-only for staff).

- **Where:** the booking card (click a booking in the list under the calendar) has a **Staff notes** section: a box with a counter (2000 characters), **Add note**, and the list of notes, newest first, each with who wrote it and when. Empty state: "Only your team sees these notes. The guest never does."
- **List icon:** a booking row under the calendar shows a small note icon with the count ("2 staff notes") when it has notes. The list only carries the count; the text loads when the card opens.
- **A list, not one text box:** every note keeps its author and time, several people can add notes without overwriting each other, and a note is **never edited**. To correct something, add a new note.
- **Removing:** an **admin** can remove any note; an **employee** only their own (someone else's note answers "not found"). Removing hides the note for everyone; the row stays in the database (the app role cannot delete rows) and is scrubbed with the booking when it is anonymised.
- **Who may add or read:** admins and employees (no refund access needed). Only for real bookings (not an unfinished checkout). Another workspace's booking answers 404.
- **Never reaches the guest:** no guest route, report or export other than the person's own privacy export reads the table (a test pins the list of files that may). Do not type card numbers or passwords into a note.
- **Audit:** `booking.note_added` and `booking.note_removed` record who, which booking and (for an added note) its length, never the text. Limit: 30 notes or removals a minute per person, and at most 200 visible notes per booking.
- **Privacy:** the text can name people, so it is part of the guest export and is replaced with `[removed]` when the booking is anonymised (retention job or erasure command). See `docs/15`.

## Staff passwords

Rule (API and admin, one shared definition): 10 to 200 characters, a capital letter, a small letter and a number; not only spaces; not
containing the first part of the sign-in email; not a very common password. It is checked whenever a password is set, never at
sign-in, so existing accounts keep working. The admin form shows a live checklist (icon and words for each rule) and a show/hide
toggle, and keeps "Change password" off until every rule is met. The API answers `400 PASSWORD_TOO_WEAK` with a `problems` list.
Details and the development-login exception: `docs/10-security-review.md` (Password policy).

## Staff accounts and roles

Who: the person who **registers** becomes the **admin** of a new workspace (organization). An admin adds the **employees**. A workspace can
have several admins and always keeps at least one active one.

| | Admin | Employee |
| --- | --- | --- |
| Calendar, booking list, check-in | yes | yes |
| Cancel a booking, change its dates | yes, any reason and amount | yes, policy only (see below) |
| Refund list | yes | read only |
| Reports | all figures | activity only: nights, occupancy, bookings, arrivals; every money figure is withheld (`moneyHidden: true`) |
| Retry a refund, mark a hand refund as paid, choose any refund amount or reason, waive the rebook fee, mark a balance as paid outside, act on the check-in day | yes | only with the per-person permission **"Can handle refunds and money actions"** (below) |
| Properties, stays, photos, extras, rates, discounts, cancellation rules | yes | no |
| Bank and legal details | yes | no |
| Team, invitations, audit log, system health | yes | no |

An employee who calls an admin route gets `403 FORBIDDEN_ROLE`. The API decides; the admin screens will only hide what a role cannot use.

**Refund access (per-person permission, migration 031).** An admin can give an employee **"Can handle refunds and money actions"** (`staff_users.can_manage_refunds`, default off; `canManageRefunds` in `GET /staff/me` and in the team list; admins always have it). It can be ticked in the invite dialog (employees only; copied to the account when the invitation is accepted) or granted/removed later from a member's menu in **Team** with a confirmation that says what changes. Only an admin can change it; it is tenant-scoped, never applies to an admin or to yourself, takes effect on the person's next request (the account is read from the database on every request, there is no cached session copy) and is audited (`team.refund_access_granted` / `team.refund_access_removed`, with who changed whose access). With it an employee has the same money powers as an admin on bookings and refunds (not on rates, discounts, properties, bank details or the team). Without it, an employee cancelling on the check-in day (or later) is allowed but the refund is forced to zero. The rules and the audit entries are in `docs/07-cancellation-policy.md`, "Staff cancellations".

**Registration** (`GET /staff/register/status`, `POST /staff/register`): open in development; **closed in production** unless
`ALLOW_REGISTRATION=true`. Registering creates the organization and its admin together and signs them in. The password follows the staff
password rule. Rate limited per IP and per email.

**Adding someone** (no email system yet, so a link): an admin creates an invitation (`POST /staff/team/invites`); the answer holds a
one-time token, shown once, that the admin hands over (the client builds the link). It works once, expires after 72 hours
(`INVITE_TTL_HOURS`), and a new invitation for the same email replaces the old one. The person opens it (`GET /staff/invites/:token/preview`
shows only the workspace name, the email and the role), chooses a password that meets the rule and is signed in
(`POST /staff/invites/accept`). Lost password or lost phone: **reset access** signs the person out everywhere and issues a new one-time link
that sets a new password for the same account. Switching a person off ends their sessions and stops them signing in; it never deletes
their history.

**Audit log** (`GET /staff/audit`, admin only): who did what and when, newest first, filterable by action prefix and date. It records
ids and names of fields only, never passwords, tokens, bank values or readable IPs. Details: `docs/10-security-review.md` (S-14).

## Owner report (`/reports`)

Written for the owner (the client), not for engineers: plain words, one number per question, every term explained. The page only chooses the period and property and arranges what `GET /staff/reports` returns; all figures are computed in NestJS (`report-summary.rules.ts`, `report-summary.repository.ts`, `reservations.service.ts`).

**Page structure**

1. **Header:** a **Period** menu (Today, This week, Last week, Last 30 days, Next 30 days, This month, Last month, This quarter, Last quarter, This year, Last year, Custom dates with first and last day, both included; weeks run Monday to Sunday, quarters are Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec) where every option shows the dates it covers today, plus a chip beside it that always spells out the exact dates being reported ("1 Jul – 31 Jul 2027"), a property filter (All properties by default), **Refresh**, **Download CSV**, **Print / Save as PDF**.
2. **At a glance:** exactly four cards: Revenue, Bookings, Occupancy, Average nightly rate. Each has a plain one-line explanation and a change against the equal-length period right before (arrow and words, "no earlier data" when that period had nothing).
3. **Needs your attention:** unpaid holds (opens the Bookings tab filtered to Awaiting payment), **unpaid at hotel** (pay-at-hotel bookings nobody has marked paid, all dates: the count, what is still to collect for people who see money, how many arrive within 7 days and how many already passed check-in; opens the Bookings tab on the Unpaid at hotel filter), refunds to pay (links to `/refunds`), arrivals today and in the next 7 days. Only items above zero show; otherwise "Nothing needs attention." Counted as of today, whatever period is shown.
4. **Tabs** (`?tab=`): Overview (one chart of revenue bars and an occupancy line, plus up to three plain sentences built only from true facts), Properties & stays (sortable table, every stay listed even if unbooked, share of revenue), Bookings (search, status filter, opens the booking), Cancellations & refunds, Payments & offers.
5. Every section has a one or two sentence caption, every tab a one-line purpose, and every empty state says why it is empty and what to do. These words, and one definition per number, live in `apps/admin/src/features/reporting/utils/metric-definitions.ts` (tested). No jargon such as "pipeline".
6. **Print / PDF** uses the browser's print: controls hide, all tabs print in order under a title block (property, period, date), and the definitions are appended. **CSV** has a summary block and one row per booking; text that could run as a spreadsheet formula is neutralised.

**Definitions** (same wording as the tooltips)

- **Period:** nights are counted on the night they are slept; a booking across two periods is split by nights.
- **Bookings:** confirmed bookings with at least one night in the period (a pay-at-hotel booking counts once it is confirmed, paid or not; unpaid online holds and cancelled bookings do not).
- **Paid by guests (gross):** confirmed booking revenue that was **paid** plus what guests paid for cancelled bookings in the period (shared out over their nights). A pay-at-hotel booking counts here only once someone marks it paid; until then its value is **To collect**, shown apart (on the Revenue card, in the Bookings tab banner, on the Payments tab and in the CSV) and in neither gross nor net. Booked value (`revenueCents`, the nights chart, the property rows and the average nightly rate) still counts every confirmed booking, paid or not.
- **Refunded:** cancellation refunds of bookings cancelled in the period, any status (pending and failed ones are still owed). A date change is not a cancellation, and its price difference is already in the new booking's total.
- **Revenue (net):** paid by guests minus refunded: what the property kept (cash actually received; money still to collect at the hotel is not in it).
- **Occupancy:** booked nights divided by (all stays x all nights in the period).
- **Average nightly rate:** confirmed revenue divided by booked nights.
- **Cancellation rate:** cancelled bookings divided by confirmed plus cancelled, in the period.
- **Discount given:** `discount_redemptions` on confirmed bookings in the period, per discount.
- **Previous period:** the same numbers for the equal-length window ending where the chosen period starts (`StaffReport.previous`).

An API from before this report (not restarted) is tolerated: the admin fills the missing fields with defaults (`withReportDefaults`) instead of crashing. Opening a booking from the report attaches its refunds; its date-change history is only complete on the calendar's booking dialog.
