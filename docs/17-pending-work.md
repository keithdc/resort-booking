# Pending work and open decisions

One place for everything that is **not built yet** or **waiting for an owner decision**. Written in plain words so the owner can read it. Details live in the doc named in brackets. When something here is done or decided, delete the line (or move it to the doc that describes the feature) so this file stays short.

Last reviewed after the search-visibility round.

## 1. Not built yet

### 1.1 Card payment link for bookings made by staff (phase 2)

Today an admin or employee can make a booking **paid at the hotel** (pending until someone ticks Paid). The **Credit card** option in the New booking dialog is shown greyed out ("Payment link: coming soon"). Agreed direction: the staff member creates the booking, the dates are held, and the guest gets a **link to pay by card** on a secure payment page. No card numbers ever touch our system.

What the design must settle first:

- **Hold length.** The guest card hold is 15 minutes (`HOLD_TTL_SECONDS = 900`). A link sent by email or message needs hours, not minutes. Suggest a separate, configurable "payment link hold" (for example 24 hours), shown to the staff member before they send it.
- **A link nobody can guess.** A long random token (not the booking id), stored only as a hash, single booking, expiring with the hold, revocable. Never put it in logs or the audit log.
- **The pay page.** A page in `apps/web` that shows the stay, dates and total, then the payment form. It must work on a phone, show a clear "link expired" state, and never reveal anything about other bookings.
- **Sending and resending.** Copy the link, or email it (Resend, see `docs/12-email.md`). Resend or "new link" invalidates the old one (as invitations do). Every send is audited (who, when, never the link).
- **What the booking shows meanwhile.** A new status such as "Waiting for card payment" (distinct from Pay at hotel · Pending), with the time the hold ends, in the booking card, the day list and reports (it counts as to collect, not as collected).
- **When time runs out.** The hold is released and the booking is cancelled or expires with a clear note. No refund (nothing was paid).
- **Confirming.** The payment webhook confirms the booking (the existing late-success and idempotency rules in `docs/14` apply). Staff can also mark it paid by hand if the guest pays another way.
- **Refunds and date changes.** After a successful card payment the booking behaves like a normal online booking.

### 1.2 Real Stripe

The payment code runs on a **mock** provider today (`docs/05`, `docs/14`). The real adapter must:

- send an `Idempotency-Key` on every create and refund call;
- throw `ProviderOutcomeUnknownError` on timeouts and 5xx answers, so the booking is never treated as failed when the money may have moved (the reconciler, `docs/14`, settles it);
- verify webhook signatures with the live secret, and be tested against Stripe's test mode before any live key is set;
- store only the provider reference, never card data.

### 1.3 Emails to the guest

Guest booking **confirmation**, **hold expiry** and **cancellation/refund** emails are not built. Only staff invitation and reset emails exist (`docs/12-email.md`).

### 1.3a Calendar sync with Airbnb and other sites (iCal): required before launch

The owner may keep Airbnb running next to the direct site (a good idea: years of reviews and ranking), so both channels share one calendar. Build this **before launch**. The booking source field already exists (`inventory_blocks.booking_source`, docs/04): an import will create calendar blocks (`kind = 'block'`) with the source set (`airbnb`, `booking_com` or `other_site`) and no payment method, which migration 045 allows; blocks must be skipped by the reservation-only reports and lists as they are today. Needed while the client still has bookings on Airbnb or another site, and for any later channel. Today the admin must **block those dates by hand** or two guests can book the same night (`docs/04` lists channel sync as out of scope for v1; this is the small, safe version).

- **Import:** each stay gets an optional iCal link (the private calendar link that Airbnb and Booking.com give a host). The API reads it on a schedule (for example every 15 to 30 minutes) and turns each busy range into an inventory block marked "Blocked by Airbnb", never overwriting a real booking. A range that disappears from the feed is released.
- **Export:** each stay gets a private iCal link of its confirmed bookings so other sites can block the same nights. The link is a long random token, revocable, with no guest details (only "Reserved").
- **Safety:** only fetch `https` URLs of the allowed hosts, set a short timeout and a size cap, do not follow redirects to private networks (SSRF), never log the URL (it is a secret), show the last successful sync time and any error in the stay settings.
- **Limits:** iCal is not instant (15 to 30 minutes of delay is normal), so a double booking is still possible in that window. Keep the schedule short and block manually for peak dates.
- **Not planned:** a full channel manager (prices, messages, reviews).

### 1.4 Booking features: decided to keep simple

Not planned, on purpose (owner decision, keep the app easy to use): switching to another stay (cancel and book again), extras re-quote or an on-request approval flow (use a staff note, or add the extra when making the booking), and the guest checkout choosing extras (use the note). Still open and small: a date change that needs more money supports card payment of the difference only (no bank-transfer balance), and automatic reminders for unpaid-at-hotel bookings (the report already lists them by arrival date).

### 1.5 Quality work

- **Refactoring pass:** low priority. Only do it when a file gets in the way of a change.
- **Browser testing of the recent admin screens:** low priority, owner will test over time (`docs/16-manual-test-guide.md` sections 14 and 15).
- **Least-privilege roles in development:** the dev database still uses one owner role. Switching to `resort_owner` / `resort_app` / `resort_readonly` as in `docs/11-database-access.md` would catch permission mistakes earlier.

### 1.6 Search visibility: steps outside the code

The code side is done (`docs/04`, "Search visibility"). These steps need the owner and the real domain:

1. **Real domain and `SITE_URL`.** Buy the domain, point it at the web app, set `SITE_URL=https://...` on the server. Without it the sitemap is empty and there are no canonical links.
2. **Google Search Console.** Add the domain, verify it (DNS record), submit `https://<domain>/sitemap.xml`, and check "Pages" for anything marked excluded or erroring after a week.
3. **Google Business Profile.** Create the profile for each property: right category, exact pin, photos, phone, the website link, opening and check-in details. Reply to every review. This is the biggest factor for "best accommodation in [area]" searches.
4. **Reviews.** Email each guest after check-out with the direct link to leave a Google review (needs the guest emails, section 1.3). Show 3 to 5 testimonials with permission. No in-app reviews (decided: skip).
5. **Backlinks.** Ask the local tourism board, nearby restaurants and tour operators, and travel bloggers to link to the property page. A few good local links beat many poor ones.
6. **Content.** Real photos with a short description each (the photo text is used by Google Images and screen readers), a longer description for each stay that mentions the town and what is nearby, and one page about the area (not built yet: a small "Things to do near [town]" page would help the searches people make before they look for a place to stay).
7. **Social previews.** After launch, check a stay address in the Facebook Sharing Debugger and LinkedIn Post Inspector; use "Scrape again" after changing a photo.
8. **Measure.** Check Search Console monthly: impressions, clicks, average position for the town and "holiday stay" searches. No third-party tracking is installed (decision: privacy first); Search Console needs none.

**Decision for later: real 404 status.** An unknown or unpublished address shows the 404 screen and `noindex` but answers with status 200, because `app/loading.tsx` makes the page stream. Search engines treat this as a soft 404 and drop it, so it works. A true 404 status needs `loading.tsx` removed (visitors then see nothing until the page's data has loaded, instead of a spinner). Not done; say if you want it.

**Decision for later: page caching.** Every page is rendered per request (the security policy needs a fresh nonce on each response), so a CDN cannot cache the HTML and the speed depends on the API's response time. The alternative is a policy without nonces (hash-based or `unsafe-inline`), which weakens the protection against injected scripts. Not changed.

### 1.7 Small jobs for later

- **Unique one-time codes sent by email (design note, not built).** Model it as ONE discount with a batch of generated codes, not one discount row per code, so the Discounts list stays short. A `discount_codes` table holds `discount_id`, `code` (unique per property, random, 8+ characters from an unambiguous alphabet), an optional `email` (the guest it was sent to; personal data, so include it in the export, erasure and retention tools, `docs/15`), `used_at` and `booking_id` (filled when a booking uses it, in the same transaction as the redemption, with a unique index so one code is used once). The discount carries the effect, the run window, the stays and the stacking; the codes only say who may use it. Open the codes from that one discount in a **codes view**: search, filter used or unused, **generate N codes**, **export CSV**, and **send by email** (Resend, `docs/12`; every send audited without the code in the log). The guest types the code like any promo code; the API looks it up in `discount_codes` first. Keep the same rule as a coupon: the code works alone, with the run window and the use limits of the discount. This replaces "one discount per code", which would bury the list (the filters on the list are only a stopgap).
- **Stronger anti-abuse for coupons when real Stripe is live.** "Once per guest" is checked by email only (`docs/13` R7-02). Ideas, cheapest first: also limit by phone number; limit by the card fingerprint Stripe returns (one use per card, no card data stored); one code per email sent by us (the one-time codes above, so a guest cannot invent an address to receive it); and the rate limits that already exist on code attempts.

- **Commission per channel booking (only if wanted).** A booking from Airbnb or Booking.com records the total the guest paid there; the commission the site keeps is not tracked, so revenue from those bookings is gross. If the owner wants net income per source, add an optional "commission" amount to a channel booking and show net figures in the source report.
- **Privacy-friendly analytics, when paid ads start.** Not added now on purpose. When ads begin, add analytics that measure visits and bookings per source (ad, Google, Instagram, email) without tracking individuals, plus the cookie notice the rules require, so the cost per booking can be compared with the Airbnb fee it replaces. Start with a small ad test (about EUR 5 to 10 a day for 3 to 4 weeks) a few weeks before a busy period.
- **Guest email opt-in at checkout.** An optional, unticked checkbox ("Email me about offers and my next stay") stored with the date and wording, so past guests can be written to about booking direct. A guest who has not agreed is not emailed. Include it in the data export and erasure tools (`docs/15`).
- **"Things to do near" area page** for the property (searches people make before choosing a stay).
- **Book direct card for the property** (printed card or QR code: "Book direct next time and save X%") and the matching discount code. Not code, but plan it with the owner.

### 1.8 Guest accounts and stricter coupons (someday, billed separately)

Not built, and **not planned for now**. The owner will offer it to the client as a separate paid feature. Until then a coupon is limited by "once per guest (checked by email)" and by its maximum number of uses; a person with another email address can reuse a public code (accepted risk, `docs/13` R7-02).

**Why accounts alone do not make a coupon strict:** a person can register again with another email. Strictness comes from proof of a real email address or card plus a limit on use, not from the account itself. Accounts earn their cost only for loyalty features (saved details, booking history, member prices).

**Options for the client, cheapest first**

- **A. Nothing extra** (what exists): once per email plus a maximum number of uses.
- **B. Unique one-time codes sent by email:** strict for welcome offers, no accounts (design note in section 1.7). Smaller job. The recommended first step.
- **C. Verified email at checkout:** a 6-digit code sent to the guest's email before a coupon applies. No account. Needs the guest emails (section 1.3).
- **D. Full guest accounts:** everything below.
- **Later, with real Stripe:** block the same card (payment provider card fingerprint) on a coupon. Strong and invisible to the guest.

**What full guest accounts (D) would include**

1. Sign-up and sign-in by email and password, or by a one-time email link (simpler and safer for guests who book once or twice a year).
2. Email verification before a coupon can be used.
3. Coupon rules: usable only by a signed-in verified guest, once per account.
4. A guest area: "My bookings" with cancel and change dates (the guest manage page becomes part of it).
5. Account tools the EU privacy rules need: forgot login, change email, delete my account, download my data (`docs/15`).
6. Security and admin side: rate limits, bot protection on sign-up, block an account, merge duplicates, audit.
7. Emails: verification, login link, welcome (depends on section 1.3).

Size: medium to large, a few weeks, plus ongoing support (lost logins, duplicate accounts, privacy requests). Questions for the client: how much a reused coupon really costs them; whether they want repeat-guest features; whether guests must have an account to book or only to use a coupon; who answers guest support.

## 2. Waiting for an owner decision

Numbers refer to the doc that explains the question.

### 2.1 Security and database

Done in round 6 (`docs/13` section 11): the maintenance switch for the table owner only, 64-bit report sums, the invitation token after the `#`, scrypt N=2^17 with rehash on sign-in, audit rows in the same transaction for money and permission actions, and the password for bank or email changes. Still open from that round:

- **Remove the older invitation link shape** (`/invite/<token>` and `GET /staff/invites/:token/preview`) with the next release; they only exist so links already handed out still open.
- **Audit rows in the same transaction for the remaining actions** (settings, property, rate, discount, extra, house, arrival, two-step enable and disable, sessions, profile and password): list in `docs/13` R6-05; each is one hook on an existing transaction.

- **R5-09 employees and totals** (`docs/13` section 9): an employee without money access still sees extras prices and a staff booking's total on the booking card (only reports hide money). Hide, or accept?
- **Hidden staff notes** (`docs/13` section 10): hidden notes keep their text until the booking is anonymised. Scrub sooner (for example 30 days after hiding)?
- **One operator or several** on one deployment, and who owns the public property slug (R2-02). `GET /identity/organization` returns the first organization today.
- **A distinct `owner` role above `admin`?** (R2-10)
- **Session limits** (R2-08): 30 minutes idle, 12 hours employees, 8 hours admins. Confirm or change.
- **Refund amount cap per person:** today refund access is all or nothing, set by an admin (R2-01).
- **POST /holds when Redis is down** (R2-13): keep taking bookings (fail open) or stop (fail closed)?
- **Seed data out of the migrations** (S-25): demo properties are created by a migration today.
- **Emailed admin password reset** with a second step, or a documented operator procedure (R2-27).
- **`late_payment` refunds** record the initiator as "system"; confirm the wording the accountant wants.
- **Employee audit row** when someone's two-factor secret cannot be read (today: a log line only).

### 2.2 Data, backups and operations

- **Retention periods** (`docs/15`): guests, holds, invites, sessions, webhooks, audit log. All are proposals; confirm with a lawyer and an accountant for the operator's country.
- **Who runs the weekly retention job**, and where its output goes.
- **Backup target and key custody**, **RPO and RTO** (proposal: 15 minutes with point-in-time recovery, or 24 hours with daily dumps; 4 hours to restore), host log retention, who answers guest privacy requests (`docs/15`).
- **Alert recipients and thresholds** for stuck or failed refunds, late payments, webhook failures and login floods (`docs/13` section 6, `docs/14`).

### 2.3 Product

- **Does a cancelled booking give its coupon use back?** Today it does not: a cancelled booking still counts toward the use limit and toward "once per guest" (the same rule, as built). A guest who cancelled a welcome-code booking cannot use the code again with the same email. If the owner wants the use returned on cancellation, it is one change in the cancel path (delete the redemption rows of the cancelled booking) and it would apply to the use limit too.

- **Extras prices:** the two default extras ("Baby mattress / travel cot", "Extra pillows") are created at EUR 0, on request. Set real prices per property.
- **Percent change fee on a date change** includes extras (same base as a cancellation refund). Confirmed as is.
- **Who can mark a booking paid:** admins and employees with refund access. Confirmed as is.
- **Employees with refund access see money figures** in Reports. Confirmed as is.

## 3. Decided: not wanted

- **Login lockout** (locking an account after failed attempts): **not wanted**. The per-IP and per-email rate limits and two-step verification stay.

## 4. Known caveats

- The **QR code for two-step verification** was scanned with a real authenticator app by the owner and works.
- **Real email** (Resend) has been tested only with mocks. Send one real invitation once the key and domain are set.
- **Encrypted backups** (the `age` and `gpg` paths in `scripts/backup-db.sh`) and `shellcheck` have not been exercised.
- The **guest checkout after Pay** and the cancel dialogs are tested at component level only.
- The middleware on the admin app only checks that the session cookie **exists**; the API decides whether it is valid.
- Browser autofill colours: the theme removes the saved-login tint (`packages/ui`), checked only through tests and one screenshot round. Report it if the blue returns.

## 5. Go-live checklist (taking real bookings)

Do these in order. Do not announce the site before every box is ticked.

1. **Money:** the real Stripe adapter (section 1.2) tested in Stripe test mode, then live keys, webhook secret set, a real small payment and a real refund made and checked in the Stripe dashboard.
2. **Guest emails:** booking confirmation, hold expiry and cancellation or refund emails (section 1.3). Resend domain verified.
3. **Production settings:** `NODE_ENV=production`, no mock payments, strong secrets in the host's secret store, the app running as `resort_app` only, migrations run by the owner role, two-step verification on every admin.
4. **Backups and monitoring:** daily backups, one restore drill done, an uptime monitor with phone alerts, alerts for stuck refunds and failed webhooks (`docs/15`, `docs/14`).
5. **Legal pages:** terms and cancellation policy, privacy notice, cookie notice, company and VAT details, tourist tax if it applies, the model for guest data requests (`docs/05`, `docs/15`).
6. **Content:** real photos and descriptions for every stay, real prices and extras, house rules, check-in instructions, a phone or WhatsApp number guests can reach.
7. **Calendar:** the iCal sync (section 1.3a) built if Airbnb stays on, otherwise every existing Airbnb or agency booking blocked by hand, then a double-check of the next 12 months.
8. **Test run:** two real bookings made by friends (card and pay at hotel), one cancelled with refund, one date change, each followed through the admin, the reports and the guest emails.
9. **Security test:** an outside penetration test (`docs/13`), fixes done.
10. **Find guests:** the website domain, Google Business Profile, Instagram, an email to past guests who agreed to hear from the property, and a "book direct and save" discount.
11. **First weeks:** watch the audit log, refunds queue and unpaid-at-hotel report every day.

