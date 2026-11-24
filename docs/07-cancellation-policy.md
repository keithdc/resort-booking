# Cancellation, refunds, and rebooking

There is **no EU-wide legal table** that says “3 days = 75% refund.” Those percentages are a **commercial policy** we choose, disclose, and encode. A lawyer in the operator’s country should still sign off before go-live.

## What EU law actually requires

| Topic | Rule | Source |
| --- | --- | --- |
| 14-day cooling-off | **Does not apply** to dated hotel / holiday-home stays. Guests cannot cancel “for any reason” like an online T-shirt. | Consumer Rights Directive 2011/83/EU **Article 16(l)**; France **Code de la consommation L221-28 12°**; [Your Europe — returns](https://europa.eu/youreurope/citizens/consumers/shopping/returns/index_en.htm) |
| Tell them before pay | Checkout must state clearly that **the 14-day withdrawal right does not apply**, plus the cancellation ladder. | Same directive (pre-contract information) |
| Unfair terms | A hidden or extreme fee (e.g. keep 100% when they cancel a month ahead) can be challenged. A **published, stepped** fee that rises as check-in nears is normal. | Unfair terms / ECC hotel guidance |
| Package holidays | If we sold flight+stay as one package, Package Travel Directive 2015/2302 would apply (including full refund for extraordinary circumstances). **We sell accommodation only** — that directive does not set our guest ladder. | Do not bundle transport into the same checkout in v1 |
| Operator cancels | Guest gets **100% of what they paid**. Do not keep a penalty when we cannot host. | ECC / national consumer practice; France extra rules if the prepayment was *arrhes* |
| Force majeure | Often full refund even if the ladder would keep money. Staff override; not a fully automatic legal engine in v1. | National civil law (e.g. France Code civil 1218) |

[ECC — hotel cancellation](https://www.eccnet.eu/consumer-rights/what-are-my-consumer-rights/travel-and-passenger-rights/accommodation/hotels): compensation is usually a **percentage that increases toward arrival**, up to 100% at short notice. That is industry practice, not a mandated 75/25 split.

Treat prepaid amounts as payment for the stay (not French *arrhes*). If we called them *arrhes* and **we** cancelled, France can require **double** repayment. Product copy: “payment of the stay,” never “arrhes,” unless a lawyer says otherwise.

## Admin-configured ladder (source of truth)

**The system never owns the percentages.** Staff set the rules in admin; code only **looks up** the matching tier and **calculates** `refund = round(paidAmount * refundPercent / 100)`.

- Config lives on the **property** (each resort can differ).
- Each row is: **minimum days before check-in** + **refund percent (0–100)**.
- Staff can add, edit, reorder, or remove rows (must keep at least one catch-all, usually `0 days → 0%`).
- A new property is **seeded** with the sample table below so they are not staring at an empty form. They can change it immediately. **Do not** bake 75 or 25 into frontend or service `if` statements.
- When a guest **books**, copy the current ladder **and** rebooking flags onto the reservation (`policy_snapshot`). Cancel and rebook use **that snapshot**, not today’s admin edits.
- Checkout, house page, and emails **render the snapshot or live property policy** from the API — never hardcoded copy.

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

- Before Pay: the ladder, whether the stay is **rebookable**, any **rebook fee**, and “You have **no** 14-day right of withdrawal because this is a stay on specific dates.”
- Guest must tick that they have read it (record timestamp).
- Confirmation email repeats the ladder and rebook rule.
- Cancel in the guest portal: show the **exact refund amount** before they confirm.
- If not rebookable: no “Change dates” action — copy explains they must **cancel and book again** (refund ladder applies).

## Operator / staff

- If **we** cancel: refund **100%**, house released, email the guest. Target: refund initiated within **14 days**.
- Staff may issue a full refund (force majeure, goodwill). Log who and why.
- Do not invent a second silent policy in code.

## Rebooking (change dates)

Also **admin config**, not hardcoded. Per property:

| Field | Meaning |
| --- | --- |
| `rebookable` | `true`: guest can change dates on the same house (if free). `false`: no modify flow — they **cancel** (refund %) and **book again**. |
| `rebookFeeType` | `none` \| `fixed` \| `percent` |
| `rebookFeeValue` | Euros (fixed) or 0–100 (percent of **original** stay paid). Ignored when type is `none`. |

Seed: `rebookable = false`, `rebookFeeType = none` (safest: cancel and book again until staff turn it on).

### If `rebookable` is false

- Guest portal: Cancel only.
- Do not run a modify API. Staff can still change a reservation in admin (ops override), logged.

### If `rebookable` is true

1. Guest picks new check-in / check-out on the **same house**.
2. API checks availability (no overlap with others; 15-min hold on the new dates while they pay any balance).
3. Quote:
   - `newStayTotal` for the new nights (current rate periods and discounts, priced per night; see `docs/04-product-domain.md`, Pricing by date range and Discounts). Refunds always use the amount actually paid, after any discount.
   - `fee` from snapshot: `0`, or `rebookFeeValue`, or `round(originalPaid * rebookFeeValue / 100)`.
   - If `newStayTotal + fee > alreadyPaid`: guest pays the **difference** (card/wallet; bank transfer uses the pending-payment path).
   - If `newStayTotal + fee < alreadyPaid`: refund the **difference** (same channel rules as cancel refunds).
   - If equal except fee: charge the fee only.
4. Instant extras: keep if they still apply; drop ones that were date-specific and re-quote.
5. Old dates released and new dates occupied in **one transaction**. Fail if the new window is taken.
6. Cannot rebook after check-in has started. Cannot switch **house** in v1 (that is cancel + new booking).

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
