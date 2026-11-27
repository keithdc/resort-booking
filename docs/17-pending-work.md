# Pending work and open decisions

One place for everything that is **not built yet** or **waiting for an owner decision**. Written in plain words so the owner can read it. Details live in the doc named in brackets. When something here is done or decided, delete the line (or move it to the doc that describes the feature) so this file stays short.

Last reviewed after the staff-notes round (migration `043`).

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

### 1.3a Calendar sync with Airbnb and other sites (iCal)

Needed while the client still has bookings on Airbnb or another site, and for any later channel. Today the admin must **block those dates by hand** or two guests can book the same night (`docs/04` lists channel sync as out of scope for v1; this is the small, safe version).

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

## 2. Waiting for an owner decision

Numbers refer to the doc that explains the question.

### 2.1 Security and database

- **R5-07 maintenance switch** (`docs/13` section 9): any database role can turn on `resort.record_maintenance` inside its own transaction, which disables the guard triggers (for example "paid never goes back to pending"). It needs a second flaw (an injection) to matter. Fix: require the owner role as well, in a new migration. Needs the real role names per environment.
- **R5-08 report sums** (`docs/13` section 9): report totals are 32-bit. About 21 bookings at the EUR 1M ceiling would overflow a period total. Real totals are far lower. Switching to 64-bit touches several queries.
- **R5-09 employees and totals** (`docs/13` section 9): an employee without money access still sees extras prices and a staff booking's total on the booking card (only reports hide money). Hide, or accept?
- **Hidden staff notes** (`docs/13` section 10): hidden notes keep their text until the booking is anonymised. Scrub sooner (for example 30 days after hiding)?
- **One operator or several** on one deployment, and who owns the public property slug (R2-02). `GET /identity/organization` returns the first organization today.
- **A distinct `owner` role above `admin`?** (R2-10)
- **Session limits** (R2-08): 30 minutes idle, 12 hours employees, 8 hours admins. Confirm or change.
- **Refund amount cap per person:** today refund access is all or nothing, set by an admin (R2-01).
- **POST /holds when Redis is down** (R2-13): keep taking bookings (fail open) or stop (fail closed)?
- **Invitation token in the URL path** (R2-04): move it to a fragment or a POST body so it never reaches access logs.
- **Seed data out of the migrations** (S-25): demo properties are created by a migration today.
- **Password re-entry** before changing the bank account or the sender email.
- **Audit write in the same transaction** as the action (today it is written right after, and a crash between the two loses the row; the action itself is safe).
- **Password hashing cost** (scrypt N=2^17 today): raise to roughly 128 MiB per hash and eight times the CPU?
- **Emailed admin password reset** with a second step, or a documented operator procedure (R2-27).
- **`late_payment` refunds** record the initiator as "system"; confirm the wording the accountant wants.
- **Employee audit row** when someone's two-factor secret cannot be read (today: a log line only).

### 2.2 Data, backups and operations

- **Retention periods** (`docs/15`): guests, holds, invites, sessions, webhooks, audit log. All are proposals; confirm with a lawyer and an accountant for the operator's country.
- **Who runs the weekly retention job**, and where its output goes.
- **Backup target and key custody**, **RPO and RTO** (proposal: 15 minutes with point-in-time recovery, or 24 hours with daily dumps; 4 hours to restore), host log retention, who answers guest privacy requests (`docs/15`).
- **Alert recipients and thresholds** for stuck or failed refunds, late payments, webhook failures and login floods (`docs/13` section 6, `docs/14`).

### 2.3 Product

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
7. **Calendar:** every existing Airbnb or agency booking blocked (by hand or through section 1.3a), then a double-check of the next 12 months.
8. **Test run:** two real bookings made by friends (card and pay at hotel), one cancelled with refund, one date change, each followed through the admin, the reports and the guest emails.
9. **Security test:** an outside penetration test (`docs/13`), fixes done.
10. **Find guests:** the website domain, Google Business Profile, Instagram, an email to past guests who agreed to hear from the property, and a "book direct and save" discount.
11. **First weeks:** watch the audit log, refunds queue and unpaid-at-hotel report every day.

