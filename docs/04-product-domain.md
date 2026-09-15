# Product domain — Airbnb replacement

The client currently lists on Airbnb. That contract expires next year and will **not** be renewed. This product is their **direct-booking** replacement: they own the listings, calendar, payments, and guest relationship.

This is **not** an Airbnb marketplace (many hosts, commissions, Superhost). It is one operator account that can own **many resorts**, each with **many houses**.

## Launch facts

- **Now:** 2 resorts / accommodations.
- **Each resort:** multiple houses (bookable units), not a single hotel room pool.
- **Later:** the same owner adds more resorts under the same account with no schema rewrite.

Build **multi-property from day one**. Never hardcode “the resort” as one row or one set of env vars.

## Core model

```
Organization (the client / operator)
  └── Property (resort or accommodation site)     ← 2 at launch, N later
        ├── ExtraService (catalog: breakfast, transfer, …)
        └── House (one bookable listing)          ← many per property
              └── Calendar / rates / photos / amenities
                    └── Reservation (guest stay)
                          └── ReservationExtra (instant paid, or on-request pending)
```

| Term | Meaning |
| --- | --- |
| Organization | The owner account. Staff belong here. All properties hang off this. |
| Property | One site (resort / accommodation). Name, slug, address, lat/lng, phone, email, photo gallery, public content. |
| House | One bookable unit with its **own** availability calendar (Airbnb listing equivalent). Usually entire-house, not a shared hotel room type. |
| Guest | Person booking on `apps/web`. |
| Staff | People in `apps/admin` who manage properties, houses, extras, calendars, and reservations. |
| ExtraService | Admin-defined add-on for a property (breakfast, airport transfer, late checkout). `instant` (priced, paid at checkout) or `on_request` (staff approve later). |
| ReservationExtra | A guest’s choice of an extra on one reservation. Instant extras are confirmed with payment. On-request extras start as `pending`. |

Every durable row that is property-scoped stores `organization_id` and `property_id`. House-scoped rows also store `house_id`. Queries always filter by these ids so a third resort cannot leak into the first.

## What guests see (`apps/web`)

- Browse **all published properties**, or land on one property by URL (`/properties/[slug]`).
- Property page: **photo gallery**, short description, **map + address**, **phone** (`tel:`) and email, list of houses.
- Inside a property, list **houses** with photos, capacity, amenities, and price for selected dates.
- House page: gallery, amenities, map (same pin as the property unless the house has its own coordinates), contact, book CTA.
- Search: check-in, check-out, guest count — across one property or all properties. **Past days are disabled** on guest calendars.
- House page is the SEO/ads landing URL (`/properties/[slug]/houses/[slug]`).
- Book: **short checkout** — booker name, email, phone, **number of guests**, pay. No ID, no guest name list.
- Instant extras: optional checkboxes on the same page — not required to finish.
- On-request extras: guest can ask; the **house stay is still confirmed**. Staff approve or decline after.

Unpublished properties and houses must not appear on the guest site.

## What staff see (`apps/admin`)

- Organization home: list of properties, **Add property**.
- Property context switcher (required once there are 2+ resorts).
- Per property: houses, calendars (**past dates stay enabled** — staff are not blocked), extras, cancellation/rebook config, reservations, **check-in (verify guest count)**, reviews (publish/hide), photos, map, phone, email.
- Bank transfer queue: verify receipt / mark paid / reject. Do not treat this as guest-approval of the stay.
- On-request extras: approve or decline (with an optional note). If approved and priced, charge via Stripe or a follow-up bank transfer — do not reopen the house hold.
- Adding a house never requires a deploy or a code change.

## Cancellation

See `docs/07-cancellation-policy.md`. Admin sets refund **days + %**, and whether stays are **rebookable** (optional **fee**: none / fixed / percent). The API only **calculates** from the snapshot saved at booking. If not rebookable, guest **cancels and books again**. If we cancel, **100%** refund. Disclose no 14-day cooling-off before pay.

## Listing: photos, map, contact

Guests must see **where** the resort is, **what it looks like**, and **how to call** — before they book. This is listing content, not a chat product.

| Field | Where | Guest UI |
| --- | --- | --- |
| Photo gallery | Property and each house | Lightbox / carousel. First photo is the card image. No empty image slots. |
| Address + lat/lng | Property (required). House may override if it is not on the same grounds. | Map on the property and house pages. |
| Phone | Property (required to publish). Optional house phone. | Visible `tel:` link (click-to-call on mobile). |
| Email | Property | `mailto:` link. |

Map rules:

- Embed with **MapLibre GL** and **OpenStreetMap** tiles (no Google script on page load, no Mapbox/Google/CARTO key for the pin).
- Do not use the Google Maps JavaScript SDK (or Mapbox GL billed tokens) on the listing. Leaflet raster OSM is a fallback, not the default.
- **Directions:** buttons that open Google Maps and Apple Maps in a new tab (`https://maps.google.com/?q=lat,lng` and the Apple maps URL). That is enough for turn-by-turn.
- Do not load the Google Maps JavaScript SDK unless the guest has given cookie consent. Prefer the OSM-data embed + external directions links so ads/maps consent stays simple.
- Admin places the pin (address search or lat/lng). Do not hardcode coordinates in the frontend.
- Unpublished properties still have a map in admin preview; guests never see it.

Communication: phone and email on the listing only. **Do not** build an in-app messenger (Airbnb inbox). Booking notes stay on the reservation.

## Booking rules (houses)

- **Straight-through for the stay:** pick house + dates → extras → pay. Card: 15-minute freeze then auto-confirm. Bank transfer: 48-hour freeze, receipt upload, staff **verify payment** (not “accept guest”).
- A house is booked **exclusively** for the stay dates (same idea as one hotel **room**, but the unit is a **whole house**).
- One resort has **many houses**. A freeze or booking on House A does **not** block House B on the same resort. Search still shows other houses for those dates.
- Do not invent hotel-style “5 identical deluxe rooms” unless a later story asks for it. Each house has its own calendar (usually quantity = 1).
- Card hold: `HOLD_TTL_SECONDS = 900`. Warn at **5 minutes left** (`HOLD_WARN_REMAINING_SECONDS = 300`). Bank hold: `BANK_TRANSFER_HOLD_TTL_SECONDS = 172800`. See `docs/05-eu-compliance-and-payments.md`.

## Simple checkout (do not add hassle)

**To complete the booking, only:**

1. House + dates (already chosen)
2. Booker **first name, last name, email, phone**
3. **How many guests** will stay (number, 1 through house capacity)
4. Optional instant extras (checkboxes; default off)
5. Cancellation / no cooling-off tick
6. Pay (wallet, card, or bank)

No other-guest names, **no ID / passport photos (we do not store IDs)**, no address form, no account-required wall. Guest may stay logged out (email is the key).

**On arrival:** staff confirm the party size in person (admin check-in). The app does not collect identity documents.

## Stay reviews (after the visit)

Optional, simple, not an Airbnb review network.

- After **check-out date**, email the booker a link: rating + a short text about their stay (“good stuff” / experience).
- They can skip. No photos required. No public guest-to-guest thread.
- Staff can publish or hide a review on the house/property page.
- Do not block booking on reviews. Do not require an account beyond the booking email link.

## Extra services

Staff create extras per property (not hardcoded in the app).

| Kind | Guest at checkout | Stay | Money |
| --- | --- | --- | --- |
| `instant` | Add breakfast (etc.) with a price | House confirms when **payment** is confirmed | Included in card charge **or** in the bank-transfer amount |
| `on_request` | Request (e.g. private dinner, special setup) | **House still confirms** | No extra charge until staff approve; then pay-later / extra Stripe charge |

Rules:

- Extras must **not** freeze the house waiting for a human. Approval is only for the extra.
- Declining an extra never cancels the reservation.
- Optional free-text “message to the resort” is not an extra; it is a note on the reservation (no approval workflow).
- Do not build a marketplace of third-party vendors. Catalog is the operator’s own services.

## Out of scope for v1 (do not build as if we were Airbnb)

- Multi-host marketplace, host payouts, Airbnb/VRBO channel sync
- Guest-to-guest messaging inbox (email confirmation is enough at first)
- Reviews network, wishlists, Superhost-style social graph (a **simple post-stay review** is in scope)
- Complex booking (split stays, host approval **of the house**, multi-house carts)

Those can be added later. Channel managers (re-sync to Airbnb) are a **conscious** future integration, not the reason this app exists. The point is to **leave** Airbnb.

## Payments and ads

- **Payments to keep the money:** bank transfer (~€0), then Stripe **card + Apple Pay + Google Pay** (same card fee). No PayPal/Klarna in v1.
- Stripe payouts to the client’s bank are typically **days**, not 30 days.
- Never store raw card numbers. SCA/3-D Secure on the card/wallet path.
- Google/Meta tags belong only on `apps/web` **after cookie consent**.
- Domain TLD is a branding choice. Details in `docs/05-eu-compliance-and-payments.md`.
- UI: `docs/06-ui-theme.md` (8px professional buttons).
