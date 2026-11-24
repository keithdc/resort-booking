# Cancellation, refunds, and rebooking

There is **no EU-wide legal table** that says “3 days = 75% refund.” Those percentages are a **commercial policy** we choose, disclose, and encode. A lawyer in the operator’s country should still sign off before go-live.

## What EU law actually requires

| Topic | Rule | Source |
| --- | --- | --- |
| 14-day cooling-off | **Does not apply** to dated hotel / holiday-home bookings. Guests cannot cancel “for any reason” like an online T-shirt. | Consumer Rights Directive 2011/83/EU **Article 16(l)**; France **Code de la consommation L221-28 12°**; [Your Europe — returns](https://europa.eu/youreurope/citizens/consumers/shopping/returns/index_en.htm) |
| Tell them before pay | Checkout must state clearly that **the 14-day withdrawal right does not apply**, plus the cancellation ladder. | Same directive (pre-contract information) |
| Unfair terms | A hidden or extreme fee (e.g. keep 100% when they cancel a month ahead) can be challenged. A **published, stepped** fee that rises as check-in nears is normal. | Unfair terms / ECC hotel guidance |
| Package holidays | If we sold flight+hotel as one package, Package Travel Directive 2015/2302 would apply (including full refund for extraordinary circumstances). **We sell lodging only** — that directive does not set our guest ladder. | Do not bundle transport into the same checkout in v1 |
| Operator cancels | Guest gets **100% of what they paid**. Do not keep a penalty when we cannot host. | ECC / national consumer practice; France extra rules if the prepayment was *arrhes* |
| Force majeure | Often full refund even if the ladder would keep money. Staff override; not a fully automatic legal engine in v1. | National civil law (e.g. France Code civil 1218) |

[ECC — hotel cancellation](https://www.eccnet.eu/consumer-rights/what-are-my-consumer-rights/travel-and-passenger-rights/accommodation/hotels): compensation is usually a **percentage that increases toward arrival**, up to 100% at short notice. That is industry practice, not a mandated 75/25 split.

Treat prepaid amounts as payment for the booking (not French *arrhes*). If we called them *arrhes* and **we** cancelled, France can require **double** repayment. Product copy: “payment of the booking,” never “arrhes,” unless a lawyer says otherwise.

## Admin-configured ladder (source of truth)

**The system never owns the percentages.** Staff set the rules in admin; code only **looks up** the matching tier and **calculates** `refund = round(paidAmount * refundPercent / 100)`.

- Config lives on the **property** (each property can differ).
- Each row is: **minimum days before check-in** + **refund percent (0–100)**.
- Staff can add, edit, reorder, or remove rows (must keep at least one catch-all, usually `0 days → 0%`).
- A new property is **seeded** with the sample table below so they are not staring at an empty form. They can change it immediately. **Do not** bake 75 or 25 into frontend or service `if` statements.
- When a guest **books**, copy the current ladder **and** rebooking flags onto the reservation (`policy_snapshot`). Cancel and rebook use **that snapshot**, not today’s admin edits.
- Checkout, stay page, and emails **render the snapshot or live property policy** from the API — never hardcoded copy.

Cutoff: **full days before check-in 00:00 in the property timezone**. Pick the tier with the greatest `minDaysBeforeCheckIn` that is still `<=` days remaining (or equivalent: sort tiers descending by days, first match).

### Sample seed (not law, not hardcoded logic)

| Guest cancels | Refund % (seed only) |
| --- | --- |
| 7 days or more | 100 |
| 3 days or more | 75 |
| 1 day or more | 25 |
| 0 days / no-show | 0 |

Validation in admin: percents 0–100 integers; `minDaysBeforeCheckIn` unique per property; warn if a farther-out tier refunds **less** than a closer one (usually a mistake). Cannot publish a property with zero tiers.

On-request extras that were never approved or never paid are not refunded. Stripe/wallet **processing fees** are often not returned by Stripe; refund of **captured amount** minus PSP keep, unless staff top up. Show that in terms.

Bank-transfer bookings: same percent from config; payout by bank after the original transfer was verified.

## Checkout and emails (mandatory)

- Before Pay: the ladder, whether the booking is **rebookable**, any **rebook fee**, and “You have **no** 14-day right of withdrawal because this is a booking for specific dates.”
- Guest must tick that they have read it (record timestamp).
- Confirmation email repeats the ladder and rebook rule.
- Cancel in the guest portal: show the **exact refund amount** before they confirm.
- If not rebookable: no “Change dates” action — copy explains they must **cancel and book again** (refund ladder applies).

### Guest display (built)

- **Public endpoint:** `GET /properties/:slug/cancellation-policy` returns only what a guest may read: the refund ladder (highest days first), `rebookable`, and the rebook fee. No internal ids, no staff data. Unpublished or unknown properties are a 404.
- **Where guests see it:** a "Cancellation and changes" section on the **property page** and the **stay page**, before they book. It lists each refund step in plain words ("7 days or more before check-in: Full refund"), says how days are counted (before check-in at 00:00, property local time), whether dates can be changed and the fee, that the property refunds 100% if it cancels, and that the 14-day withdrawal right does not apply to a booking for specific dates. The percentages and fees are always the API's; the page only words them.
- **If the policy cannot load,** the page still renders and tells guests to contact the property before booking. If a property has no ladder yet, it says so instead of inventing one.
- **Checkout tick-box (built):** before the dates can be held, the guest must tick "I have read the cancellation terms and understand that I have no 14-day right of withdrawal for a booking on specific dates"; "cancellation terms" links to the terms on the page. The box starts unticked, the Hold button stays off until it is ticked, and it cannot be unticked while the dates are held. The API refuses a hold without it (`400`, `termsAccepted` must be a real boolean `true`; text such as "yes" or "false" is **not** accepted, because the app would otherwise convert it to `true`), and a second check in the service (`TERMS_NOT_ACCEPTED`) stops any other caller skipping it. The **server clock** records when it was accepted in `inventory_blocks.terms_accepted_at`, next to the `policy_snapshot` the guest agreed to, and the value carries over when the hold becomes a confirmed booking. Holds made before this existed, and stays staff created, have it empty.
- **Not built yet:** the policy repeated in the confirmation email, changing the dates of a booking (rebooking), and staff-initiated cancellations and goodwill refunds. The wording is product copy that still needs a local lawyer's review before go-live.

### Guest cancellation (built)

A guest can look up and cancel their own booking without an account. The **booking reference plus the email it was made with** is the key.

**Endpoints** (public, `apps/api/src/modules/bookings`):

| Call | Returns |
| --- | --- |
| `POST /bookings/lookup` `{ reference, email }` | the `GuestBooking`: dates, stay, status, `canCancel`, and the refund cancelling now would give (`refundQuote`), or the refund already issued (`refund`) |
| `POST /bookings/cancel` `{ reference, email }` | the same `GuestBooking`, now `status: "cancelled"` with `refund` filled |

- **Reference:** `BK-` plus the first 10 hex characters of the booking id (for example `BK-5185EFFCF7`). The API accepts it in any case, with or without the `BK-`/dash, with spaces. The lookup uses an id **range** so the primary-key index does the work. If the reference matches more than one booking for that email, it is treated as not found.
- **Privacy:** a wrong reference, a wrong email, an unreadable reference, and an ambiguous reference all return the **same** `404 BOOKING_NOT_FOUND` ("We could not find a booking with that reference and email."), so nobody can tell which half was right. The response never includes phone, email, staff notes, or internal ids beyond the booking id.
- **Rate limit:** 10 lookups or cancels per minute per IP (shared budget), then `429 LOOKUP_RATE_LIMITED`. If Redis is down the limit is skipped, but the reference and email are still checked.

**The policy is saved with the booking.** When a guest holds dates, the property's current ladder and rebook settings are copied onto the hold (`policy_snapshot`) and travel with it when it becomes a booking. Lookup and cancel always use THAT copy, never today's admin edits. Bookings made before this existed have no copy and use the property's current policy.

**Refund math** (`bookings.rules.ts`, pure and tested):

1. `days` = whole days from today to check-in, with "today" taken in the **property's timezone**. Cancelling is allowed up to and including the check-in date (0 days). After that: `canCancel: false` with "This booking has already started. Please contact the property." and `POST /bookings/cancel` answers `409 CANCELLATION_NOT_ALLOWED`.
2. Pick the tier with the greatest `minDaysBeforeCheckIn` that is at or below `days`. No tier reaching that far (or no ladder) means 0%.
3. `refund = round(paid × percent / 100)`, never more than paid and never negative.
4. `paid` is the succeeded payment for the booking, else the booking total.

**Cancel flow** (one transaction, then the provider):

1. Lock the booking row (`FOR UPDATE`), re-check it is still confirmed, set `status = cancelled` and `cancelled_at`. The dates are free again at once (the no-overlap constraint only covers active and confirmed rows).
2. In the same transaction insert the refund (`refunds`, unique per booking) as `pending`.
3. After the commit, ask the payment provider to refund. Success sets the refund to `succeeded` with the provider's reference.
4. **If the provider fails, the booking stays cancelled** and the refund is marked `failed` with the reason (and logged). The response shows `refund.status: "failed"` honestly. Staff retry it; the guest is never left with a half-cancelled booking.
5. A 0% refund is recorded as `succeeded` with amount 0 and the provider is never called.
6. If there is no online payment on record (or it was taken with a different provider than the active one) the refund is recorded as `pending` with provider `manual`: the operator must pay it back outside the app. `refund.simulated` is false for these because someone has real work to do.

**Idempotent:** cancelling an already-cancelled booking returns the same cancelled booking and creates no second refund. Two cancels at the same moment cannot both refund: the second waits on the row lock, sees it cancelled, and returns it.

**Discounts:** cancelling does **not** give a discount use back (`discount_redemptions` is left as is).

**Tables:** `inventory_blocks.policy_snapshot` and `.cancelled_at`; `refunds` (provider, provider reference, amount, percent, status, failure reason, who initiated it).

**Not built yet:** changing dates (rebooking, with its fee and price difference), staff-initiated cancellation and force-majeure or goodwill refunds (the `refunds.initiated_by` column already allows `staff`), refunding a failed refund again from admin, confirmation emails, and real provider refunds (the Stripe refund call goes behind the same `PaymentProvider.refund` method).

## Operator / staff

- If **we** cancel: refund **100%**, stay released, email the guest. Target: refund initiated within **14 days**.
- Staff may issue a full refund (force majeure, goodwill). Log who and why.
- Do not invent a second silent policy in code.

## Rebooking (change dates)

Also **admin config**, not hardcoded. Per property:

| Field | Meaning |
| --- | --- |
| `rebookable` | `true`: guest can change dates on the same stay (if free). `false`: no modify flow — they **cancel** (refund %) and **book again**. |
| `rebookFeeType` | `none` \| `fixed` \| `percent` |
| `rebookFeeValue` | Euros (fixed) or 0–100 (percent of the **original** booking paid). Ignored when type is `none`. |

Seed: `rebookable = false`, `rebookFeeType = none` (safest: cancel and book again until staff turn it on).

### If `rebookable` is false

- Guest portal: Cancel only.
- Do not run a modify API. Staff can still change a reservation in admin (ops override), logged.

### If `rebookable` is true

1. Guest picks new check-in / check-out on the **same stay**.
2. API checks availability (no overlap with others; 15-min hold on the new dates while they pay any balance).
3. Quote:
   - `newStayTotal` for the new nights (current rate periods and discounts, priced per night; see `docs/04-product-domain.md`, Pricing by date range and Discounts). Refunds always use the amount actually paid, after any discount.
   - `fee` from snapshot: `0`, or `rebookFeeValue`, or `round(originalPaid * rebookFeeValue / 100)`.
   - If `newStayTotal + fee > alreadyPaid`: guest pays the **difference** (card/wallet; bank transfer uses the pending-payment path).
   - If `newStayTotal + fee < alreadyPaid`: refund the **difference** (same channel rules as cancel refunds).
   - If equal except fee: charge the fee only.
4. Instant extras: keep if they still apply; drop ones that were date-specific and re-quote.
5. Old dates released and new dates occupied in **one transaction**. Fail if the new window is taken.
6. Cannot rebook after check-in has started. Cannot switch **stay** in v1 (that is cancel + new booking).

Fee and `rebookable` on the snapshot cannot be changed for that reservation by later admin edits.

## Data model

Property:

- `cancellation_policy_tiers`: `{ minDaysBeforeCheckIn: number, refundPercent: number }[]`
- `rebookable: boolean`
- `rebookFeeType: "none" | "fixed" | "percent"`
- `rebookFeeValue: number`

Reservation: `policy_snapshot` JSON with tiers + rebook fields at booking time.

API:

- `calculateRefund(paidAmount, checkInDate, now, tiers)`
- `calculateRebookQuote(reservation, newDates, snapshot)` — returns pay/refund/fee; **404-style reject** if `rebookable === false`

Frontends never hardcode rebookable or fee amounts.
