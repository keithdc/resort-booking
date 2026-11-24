# EU operations, payments, and domains

The operator is in **Europe**. We follow standard EU rules in the product so the guest site is not an easy takedown target (privacy, cookies, payments). This is an engineering checklist, not legal advice. A local lawyer still reviews privacy copy and terms before go-live.

## Domain names (`.co.fr` is not an EU standard)

A country-looking URL is **not** required to operate legally in the EU. Hosting, company registration, VAT, and GDPR matter; the TLD does not.

| What people see | What it actually is |
| --- | --- |
| `.fr` | France country domain. Common if the guest audience is France. |
| `.eu` | EU-wide domain. Optional, not mandatory. |
| `.de` / `.it` / `.es` / `.nl` | Other country domains. Same idea as `.fr`. |
| `.co.uk` | United Kingdom (this is the famous `co.` pattern). **UK is not EU.** |
| `.co.fr` | **Not** the normal French or EU standard. Do not treat it as “how EU sites must look.” |
| `.com` | Fine for an EU business if WHOIS/legal pages identify the company. |

Pick a domain the client can register and brand (often `.fr` or `.com` plus a `.fr` redirect if they are French). We do not need a special “EU URL protocol” in code.

## Straight-through booking (keep it simple)

Guest path:

1. Choose property / stay and dates  
2. Optional extras on the same page  
3. Choose payment: **card / Apple Pay / Google Pay** or **bank transfer**  
4. Freeze the stay (duration depends on method)  
5. Pay  
6. Email: confirmed (card) or pending payment (bank)

No request-to-book for the guest’s identity. No split bookings. No complex packages.

## Payment methods

**Goal: keep as much of the booking value as possible.** Extra methods are allowed only when they do not add a second fee stack.

### What we ship (low-fee set)

| Method | How | Operator fee (typical) | Booking confirmed |
| --- | --- | --- | --- |
| **Bank transfer** | IBAN + reference + receipt | ~**€0** SEPA | Staff verify (48-hour hold) |
| **Card** | Stripe Payment Element | ~**1.4%–3%** + small fixed (EU vs extra-EEA) | Stripe succeeds (15-minute hold) |
| **Apple Pay / Google Pay** | Same Stripe checkout, wallet button | **Same as card** (they are card wallets, not a cheaper GCash) | Same as card (15-minute hold) |

Apple Pay and Google Pay are **in the first checkout**, not a later experiment. They convert well and do **not** cost more than typing the card number. Enable them on the Stripe Payment Element (no custom wallet app).

### What we do not add if we want to keep the money

| Method | Why not (for now) |
| --- | --- |
| **PayPal** | Usually **higher** than Stripe cards; extra account; slower/less predictable |
| **Klarna / Affirm / BNPL** | Merchant pays a **large** cut for “pay later” |
| **GCash** | Philippines only |
| Second PSP besides Stripe | Double complexity, not lower card fees |

iDEAL / Bancontact can be cheap in NL/BE. Add later **only** via Stripe if those guests show up — still one processor.

**Checkout order on the page:** wallets (Apple Pay / Google Pay) → card fields → “Pay by bank transfer” as the low-fee alternative (with the 48-hour wait explained). Do not hide bank transfer; it is how the operator keeps almost 100% of the booking.

### Stripe payouts (what we tell the client)

Stripe does **not** hold their money for 30 days as a standard product setting. They receive payouts on a schedule they pick (daily/weekly) after funds become available. Compare that to Airbnb, which often pays the host around **check-in**, not at booking. Direct booking + Stripe usually gets cash **earlier** than Airbnb, minus a few percent.

We never store cards. SCA/3-D Secure still applies on the card path.

### Bank transfer + receipt (what we build)

When the guest chooses bank transfer:

1. Create reservation status `pending_payment` and a **48-hour** stay hold.  
2. Show IBAN, beneficiary name, amount, and a **unique payment reference** (e.g. `BK-8F2K`). Guest must put that reference on the transfer.  
3. Guest uploads a receipt (PDF/JPG). Store the file; do not treat the upload as proof by itself.  
4. Email staff: “awaiting verification.”  
5. Staff in admin: match amount + reference on their bank, then **Confirm payment** (the stay stays occupied) or **Reject** (hold released, guest emailed).  
6. If 48 hours pass with no confirmation, auto-expire the hold and set the reservation `expired`. Guest can start again. The stay is released by the clock at exactly 48 hours; the minute-by-minute sweeper then records the status and sends the guest email (`docs/01-architecture.md`, Hold expiry).

This is **payment verification**, not Airbnb-style “accept this guest.” Staff are only saying “the money arrived.”

Instant extras are included in the transfer amount. On-request extras stay pending after the booking is paid, same as the card path.

Organization stores bank details (IBAN, BIC, account name) in admin. Do not hardcode IBANs in the frontend.

## Payment provider and test mode (built)

No payment provider has been chosen yet, so payments run through a **provider interface** with a **mock** behind it. The booking flow (hold, pay, confirm) is real; only the money is simulated.

- **Interface:** `PaymentProvider` (`apps/api/src/modules/payments/payment-provider.ts`) with `name`, `simulated`, and `createIntent`. The booking logic only talks to this. Replacing the mock with Stripe means one new class and one line in `payments.module.ts`; the reservation flow does not change.
- **Selection:** `PAYMENT_PROVIDER` (default `mock`). **The app refuses to start in production on `mock`**, and an unknown provider name is an error, never a silent fallback.
- **Guest flow (card):** after the hold, `POST /holds/:holdId/payment` opens one payment (repeating the call returns the same open payment; a unique index allows only one open attempt per hold). In test mode the guest sees "no real money moves" and two buttons: pay, or simulate a declined card.
- **Settling (test mode only):** `POST /payments/:paymentId/mock/complete` with `outcome: success | failure`. With a real provider this route answers 404.
  - **Success:** in **one transaction** the hold becomes a confirmed reservation (`kind = reservation`, `status = confirmed`, appears in the staff calendar and reports), the payment is marked succeeded, and discount use is recorded. Repeating a success returns the same confirmation.
  - **Failure:** the payment is marked failed and the dates are released.
  - **Never charged after expiry:** a hold that timed out cannot be paid. The attempt is cancelled with `hold_expired`, nothing is confirmed, and the guest is told to hold the dates again.
- **Confirmation:** the guest gets a short reference derived from the booking id (for example `BK-1A2B3C4D5E`).
- **Tables:** `payments` (provider, provider ref, amount, status, `purpose`, `payload`) with a unique index for one open payment per booking. A booking can have several succeeded payments (the original plus balance payments).
- **Payment purposes:** `booking` (checkout) and `rebook` (the balance of a date change, with the agreed change stored in `payload`). `inventory_blocks.paid_cents` tracks what the guest has paid net of the change fee logic. Refunds carry a `kind` (`cancellation`, `rebook_difference`), unique per booking and kind, and are allocated across payments newest first.
- **Settlement registry:** `PaymentSettlementRegistry` maps a purpose to a handler registered on module init (the bookings module registers `rebook`), so payments never imports bookings. `completeMock` looks up the handler; a refusal rolls back and cancels the payment, an unexpected error leaves it open to retry. See "Changing dates (built)" in `docs/07-cancellation-policy.md`.
- **Refunds:** the interface also has `refund({ providerRef, amountCents, currencyCode, reason })`, which returns `{ providerRef, status: "succeeded" }` or throws. `providerRef` is the id of the ORIGINAL payment (what `createIntent` returned). The mock always succeeds (it still rejects a zero, negative or fractional amount, as a real provider would). The booking logic calls it only after the cancellation has committed, never for a zero refund, and records a failure instead of losing it: see "Guest cancellation (built)" in `docs/07-cancellation-policy.md`. `PaymentsService.describeProvider()` says which provider is active and whether it is simulated.
- **Not built yet:** Stripe itself and its webhook (`event_id` idempotency, SCA), bank-transfer receipt upload and staff verification (a bank hold shows an explanation and waits), and confirmation emails.
- **Manual payments and refunds:** money handled outside the app is recorded, never invented. A balance the guest paid at the desk is a succeeded payment with provider `manual` (purpose `rebook`), only after staff confirm it. A refund against a `manual` payment, or any refund made while no online provider is active, stays `pending` with provider `manual` until staff send the money and use "mark as refunded" (note, who and when are kept). The card provider is never asked to refund a manual payment. Failed provider refunds can be retried from the refunds queue. See "Staff actions (built)" in `docs/07-cancellation-policy.md`.
- **Safety:** the mock settle route is unauthenticated by design in test mode, so anyone who knows a payment id could confirm that booking. That is acceptable for a prototype and is exactly why production refuses to start on the mock.

## Freeze by payment method (no double booking)

The freeze is **per stay**, not per property. Other stays at the same property stay bookable.

When **card or wallet** checkout starts:

1. PostgreSQL: insert a `hold` row for `house_id` + date range if no overlapping reservation or active hold exists.  
2. Redis: lock key for that stay/dates with **TTL = 15 minutes**.  
3. Guest must complete Stripe payment before the hold expires.  
4. On success: hold becomes a confirmed reservation; calendar is occupied. Instant extras are paid in that same payment.  
5. On expiry, cancel, or failed payment: hold is released; another guest can book.  
6. Countdown on checkout. At **5 minutes left**, a non-blocking prompt: wrap up name/contact/pay — **stay on this page**, do not jump to search.  
7. If the hold **expires** mid-form: **keep all fields**. Do not force a new booking from scratch. Show “Time ran out — your details are still here” with a **Hold the dates again** button (the main **Pay** button works too). That starts a new hold if the stay is still free; if not, they pick other dates with the same name/email/phone still filled. Do not charge after expiry.

Bank transfer uses the same hold row with TTL **48 hours** until staff confirm or the hold expires.

Never rely on Redis alone. Never confirm a booking without a unique overlap constraint in PostgreSQL on the stay calendar. If the guest abandons checkout, nothing needs to run for the stay to free up: an overdue hold is ignored by the clock, and a sweeper tidies the stored status (`docs/01-architecture.md`, Hold expiry).

Card hold: `HOLD_TTL_SECONDS = 900`. Bank hold: `BANK_TRANSFER_HOLD_TTL_SECONDS = 172800`. Do not scatter magic numbers in components. Do not wait on extra-approval before converting a **card** hold.

## Cards: one processor, not “every card company”

We do **not** integrate Visa, Mastercard, Amex, and Cartes Bancaires as separate APIs. One **payment service provider (PSP)** accepts the major card brands.

**Default for this product: Stripe** (EU account, Payment Element / Checkout). Alternatives if the client already uses them: Mollie, Adyen.

That gives:

- Visa, Mastercard, American Express, and usually local schemes (e.g. Cartes Bancaires in France) when enabled in the PSP dashboard  
- **SCA / 3-D Secure** (PSD2) — required for most EU card payments; Stripe handles the challenge  
- **PCI**: we never store raw card numbers. Card fields are the PSP’s iframe/element. We store only PSP ids (`payment_intent_id`, last4, brand).

Checkout is one page: **name, email, phone, guest count** + optional extras + **pay method** + (Stripe Payment Element **or** bank instructions + receipt upload). No ID upload. No multi-step wizard unless SCA redirects and returns.

Webhooks from Stripe confirm paid vs failed. Idempotent `event_id` in PostgreSQL. A **card** hold converts to a reservation only after a successful payment intent. A **bank** hold converts only after staff verification.

## EU protocols we implement in the apps

These are the ones that actually keep a site out of trouble. They belong mainly on `apps/web`. Admin still uses HTTPS and staff access control.

| Requirement | What we build |
| --- | --- |
| HTTPS everywhere | TLS on web, admin, API. No mixed content. |
| GDPR | Privacy policy; lawful processing; guest data export/delete; **do not collect or store ID / passport images**. |
| Processors | Document Stripe, email, hosting, analytics as processors. Contracts/SCCs are the client’s job with those vendors. |
| Cookies / ePrivacy | **Consent banner before** Google Ads, Meta Pixel, or the Google Maps JS SDK. Strictly necessary cookies (session, hold, checkout) can load without ads consent. Default map embed is MapLibre + OpenFreeMap (OSM data, no Google cookie). |
| Company identity | Footer: legal name, address, contact (and VAT number if they have one). Required culture in several EU states. |
| Terms + cancellation | Clear house rules, **cancellation ladder**, and **rebookable / fee** before pay. State that the 14-day withdrawal right **does not apply** to dated bookings. See `docs/07-cancellation-policy.md`. |
| Payments | SCA via Stripe for cards; no card data in our DB; bank transfer uses IBAN + receipt; receipts/emails. |
| Minors | No accounts or bookings designed for children; standard age gate on terms. |
| Accessibility | Aim for usable keyboard/forms (we already require this). EAA gets stricter over time; do not ship unusable contrast or mouse-only checkout. |

**Do not** fire Ads/GTM/Facebook pixels until the guest has opted in. That is the usual way EU sites get complaints, not the missing `.fr` domain.

## Out of scope (not “EU protocol”)

- Geo-blocking every country (only if the client asks)  
- Building our own card vault, GCash, PayPal, Klarna, or a second PSP in v1  
- A `.eu` or `.fr` domain as a substitute for a privacy policy  
