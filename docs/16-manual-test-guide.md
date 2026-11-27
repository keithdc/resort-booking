# Manual test guide for the hardening work

Run this after pulling the hardening commits. It takes about 45 minutes. Use **test data only** (test emails, a test booking). Each step says what to do and what you should see. If a step does not match, note the step number and the screenshot; that is enough to open a hotfix.

Ports used by the dev setup: web `3000`, admin `3001`, API `3002`.

## 0. Prepare

1. Stop the API, admin and web.
2. Admin env: in `apps/admin/.env` rename `NEXT_PUBLIC_API_URL` to `API_URL` (same value, `http://localhost:3002`). The old name still works as a fallback, but the API address should not be in the browser bundle.
3. Start everything with `npm run dev:api`, `npm run dev:admin` and `npm run dev:web` (use `npm run dev`, not a bare `next dev`).
4. In the API terminal, look for the migration lines. **Expected:** pending migrations up to `040` are applied once, then nothing on the next restart. No error lines.
5. Sign in as the dev owner (`STAFF_OWNER_EMAIL` / `STAFF_OWNER_PASSWORD` from `apps/api/.env`).

## 1. Startup safety (optional, 2 minutes)

1. Stop the API. In a terminal run `cd apps/api && node dist/main.js` **without** `NODE_ENV`.
2. **Expected:** it refuses to start and lists what is missing. Nothing listens on 3002.
3. Start it again with `npm run dev:api`. **Expected:** it starts normally.

## 2. Session and token storage

1. Sign in. Open the browser dev tools, Application tab.
2. **Expected:** Local Storage has only `staff_last_active`, no token. Cookies show `staff_token` with **HttpOnly** ticked. `document.cookie` in the console does not show it.
3. Network tab: open the Calendar. **Expected:** data requests go to `localhost:3001/api/proxy/staff/...`, none go to `:3002`.
4. Sign out. **Expected:** you land on the login page, the cookie is gone, and going back to `/team` sends you to login.

## 3. Signed-in devices

1. Sign in on a second browser (or a private window).
2. Account, "Signed-in devices". **Expected:** two cards, one marked "This device", with device names like "Chrome on macOS" and a last-active time.
3. Click "Sign out" on the other device, confirm. **Expected:** it disappears. Reloading the second browser sends it to login.
4. Sign in again there, then "Sign out all other devices". **Expected:** only this device remains.

## 4. Two-step verification with QR

1. Account, "Two-step verification", start setup. **Expected:** it asks for your password first. A wrong password is refused.
2. **Expected after the password:** a QR code, then "Can't scan? Enter this key" with a copy button, and a collapsed "Show setup link".
3. Scan the QR with Google Authenticator, Microsoft Authenticator or 1Password. **Expected:** the account appears with a changing 6-digit code.
4. Enter the code and confirm. **Expected:** recovery codes are shown once. Save them. A notice says other devices were signed out.
5. Sign out and sign in again. **Expected:** after the password a code step appears. The app's code works. A recovery code also works (once only).
6. Do not test five wrong codes unless you want to wait: five wrong codes block that sign-in for about 15 minutes.
7. Disable two-step verification (password plus a code). **Expected:** it turns off, other sessions are signed out.

## 5. Team, invitations and reset

1. Team, "Invite someone": a test email, a name, role **Employee**, leave "Can handle refunds and money actions" **unticked**.
2. **Expected:** a one-time link dialog with Copy. If email is not set up it says so. Copy the link.
3. Open the link in a private window. **Expected:** "Join <organization>", your email and role, an optional name and a password with a live rule checklist. Accept it. **Expected:** you are signed in as the employee with an "Employee" chip.
4. As the employee check: no Team, Audit log or Properties in the menu, Reports show no money figures (until an admin gives that employee refund access, see section 14, step 25), and opening `/team` shows "Only admins can open this page".
5. Back as admin, on the employee row choose **Reset access** and confirm. **Expected:** a one-time link. Open it in a private window. **Expected:** only **Password** and **Confirm password**, "Signing in as <email>", the heading "Reset your password" and the button "Set new password". No name field. After saving, the member's name on the Team page is unchanged.
6. Pending invitations: on an unused invitation click **New link** (or Copy new link). **Expected:** the old link stops working, the new one works.
7. Email (only when Resend is configured, see `docs/12-email.md`): tick "Email the link to them". **Expected:** a status like "Email sent to ..." and the link still shown.

## 6. Refund access and cancellations

Create a test booking first: on the guest site pick dates, pay with the mock payment, note the booking reference. Make a second one that **checks in today**.

1. As the employee **without** refund access: open the future booking, Cancel. **Expected:** only the "The guest is cancelling" option, the refund shown equals your property's "If they cancel" table for that date, and no custom amount. Confirm. **Expected:** cancelled, a refund created at the policy amount.
2. Open the booking that checks in **today**. **Expected:** Cancel is allowed but shows "Check-in is today: no refund applies" and the button reads "Cancel with no refund". "Change dates" is disabled with a message.
3. As admin, on the Team page choose **Give refund access** on the employee and confirm. **Expected:** the chip changes to "Refund access". The employee (reload) now sees the goodwill and custom-amount options and Retry or "Mark as refunded" on the Refunds page.
4. Remove the access again. **Expected:** the options disappear on reload.
5. Audit log (admin): **Expected:** entries for each action with who did it, their role, the booking reference and the refund amount, and no emails, notes or secrets.
6. As the employee, a booking in another property or organization is never visible (404).

## 7. New-property defaults

1. Properties, create a new property and save.
2. **Expected:** "If they cancel" has exactly one row, 0 days before check-in, 0% refund. Guest extras contain "Baby mattress / travel cot" and "Extra pillows" (on request, price 0). Set real prices.
3. **Expected:** existing properties are unchanged.

## 8. Refund statuses

1. Refunds page. **Expected:** the default "Needs attention" chip lists Pending and Failed. "Done" lists paid ones.
2. For a manual refund (no online payment), choose "Mark as refunded" with a note. **Expected:** it moves to Done and the audit log records who did it.

## 9. Payment safety

1. With `PAYMENT_PROVIDER=mock` and `ALLOW_MOCK_PAYMENTS=true` the mock payment works in development. Remove the second variable and restart. **Expected:** the API refuses to start.
2. Webhooks: `curl -i -X POST http://localhost:3002/payments/webhooks/mock -d '{}'`. **Expected:** `404` while no webhook secret is configured.

## 10. Database guardrails

Run these in a terminal. Each runs inside a transaction that is rolled back, so nothing changes.

```bash
docker exec -i resort-booking-postgres-1 psql -U resort -d resort_booking <<'SQL'
begin; delete from audit_log; rollback;
begin; update refunds set amount_cents = amount_cents + 1; rollback;
SQL
```

**Expected:** both statements fail with an error (the audit log is append-only and refund amounts cannot change), even though `resort` is the owner role.

Optional: switch the dev database to the least-privilege roles with `docs/11-database-access.md`, then run `npm run db:verify-roles -w @resort-booking/api`. **Expected:** all probes pass.

## 11. Privacy tools (dry run only)

1. The commands need the owner connection: set `MIGRATION_DATABASE_URL` to the same value as `DATABASE_URL` in development.
2. `npm run privacy:retention -w @resort-booking/api`. **Expected:** a dry run: step names with counts, "nothing changed". It only acts with `--apply`.
3. `npm run privacy:export-guest -w @resort-booking/api -- --email <a test guest email> --out /tmp/guest-export.json`. **Expected:** a file with mode 0600 and no terminal dump. Delete it afterwards.
4. Do **not** run `--apply` on real data until the retention periods are confirmed with a lawyer and accountant (`docs/15-data-retention-and-backups.md`).

## 12. Phone layout

1. Browser dev tools, device toolbar, 390 x 844.
2. **Admin:** the login background fills the screen. The calendar fits seven columns, tapping a day scrolls to its list. Team, Audit and Refunds are card lists. Dialogs are full screen. Icons look small and proportionate. There is no horizontal page scroll.
3. **Guest site:** the header has a menu button, search collapses to a one-line summary, the stay page has a sticky Reserve bar, the date picker is a full-screen dialog and the Pay button sticks to the bottom.

## 13. Public rate limits (optional)

Hammer a public read route: `for i in $(seq 1 320); do curl -s -o /dev/null -w "%{http_code}\n" localhost:3002/properties; done | sort | uniq -c`. **Expected:** mostly 200 and then some 429 once the per-minute limit is reached. Wait a minute to recover.

## 14. Bookings made by staff (pay at hotel)

Needs migrations `040`, `041` and `042` (restart the API first). Use a stay with future dates free. Test data only. Steps 1-14 are the pay-at-hotel basics, 15-18 who may mark paid and the unpaid-at-hotel report, 19-24 extras.

1. Calendar page, **New booking**. **Expected:** a dialog. If one property exists it is already chosen, and so is its stay when it has only one. Check-in starts on the day selected in the calendar.
2. Pick check-in, nights and guests. **Expected:** after a moment the price appears (nights by rate, any discount, total). A date in the past, or more guests than the stay sleeps, shows a sentence instead of a price.
3. **Expected:** the payment section has **Pay at hotel** selected, and **Credit card** greyed out with "Payment link: coming soon".
4. Enter a guest name and a valid email (phone and note are optional). **Expected:** the **Book it · pay at hotel** button turns on only when there is a price, a name and a valid email.
5. Book it. **Expected:** the calendar jumps to the check-in day and says "Booking BK-... created ... Payment is pending: pay at hotel". The day list shows the booking with a **Pay at hotel · Pending** chip.
6. Open the booking. **Expected:** the header chip, Payment says "Not paid yet: pay at hotel", Paid so far 0, "Booked by <your name> (staff)", and a green **Mark as paid** button.
7. Try the same dates again in **New booking**. **Expected:** the price area says those dates are not free and the book button stays off.
8. Open the booking, **Change dates**, pick other dates, **See price**. **Expected:** it is refused with "This booking has not been paid yet. Mark it as paid first, or cancel it and make a new booking."
9. On the guest site go to Manage booking, enter the reference and the guest email. **Expected:** it opens; cancelling would refund nothing; changing dates is not offered ("paid at the property ... contact the property").
10. Back in admin (as an admin) choose **Mark as paid**. **Expected:** a confirmation ("Use this once the guest has paid you at the hotel. It is recorded in the audit log with your name."). Confirm. **Expected:** the chip becomes **Paid at hotel**, Paid so far equals the total, and the button is gone. Reload: same.
11. Audit log (admin). **Expected:** `booking.created_by_staff` and `booking.marked_paid` with who did them, the reference and amounts, and no guest name, email, phone or note.
12. As an **employee** (no refund access), repeat steps 1-6. **Expected:** it all works (an employee can make a booking). A second booking: cancel it while pending. **Expected:** "Nothing has been paid for this booking yet ... nothing to refund", the booking is cancelled, and the Refunds page shows nothing to do.
13. Reports, Bookings tab. **Expected:** the booking reads "Pay at hotel · Pending" (or "Pay at hotel" once paid). More on this in steps 16-18.
14. Database check (rolled back, changes nothing): `docker exec -i resort-booking-postgres-1 psql -U resort -d resort_booking -c "begin; update inventory_blocks set payment_status = 'pending' where payment_status = 'paid' and payment_method = 'pay_at_hotel'; rollback;"` **Expected:** an error "a paid booking cannot go back to pending" (or 0 rows if you have none paid yet).

15. **Who may tick paid.** As the employee without refund access, open a pending booking. **Expected:** the **Mark as paid** button is greyed out and a note says "Ask an admin, or an admin can give you refund access on the Team page, to mark this booking as paid." (A direct API call returns 403.) As admin, Team, **Give refund access** to that employee, confirm (the text now mentions marking pay-at-hotel bookings as paid). **Expected:** after the employee reloads, the button works and the audit log row says it was done through refund access. The same employee now also sees the money figures in Reports (step 25). Remove the access again: the button greys out and the figures disappear again.
16. **Unpaid at hotel on the home page.** Make two pending bookings: one arriving within 7 days and one later. Reports page, "Needs your attention". **Expected:** an item **N unpaid at hotel** with "<amount> to collect · 1 arriving within 7 days" (the amount is for admins; as an employee without refund access you see only the count and the arrivals). Select it. **Expected:** the Bookings tab opens on the **Unpaid at hotel** filter, only the unpaid ones are listed, the soonest check-in first, with "Arrives in N days" next to the arrival within a week.
17. **To collect, not collected.** Same page. **Expected (admin):** under Revenue the small line says "Paid by guests ... · Refunded ... · To collect <amount>", the Bookings tab shows a yellow banner "N bookings are unpaid at the hotel in this period: <amount> still to collect" with **Show them**, and the Payments & offers tab adds "Of this, <amount> comes from pay-at-hotel bookings not marked as paid yet". Mark one booking as paid. **Expected:** after Refresh its amount moves out of To collect and into Paid by guests and Revenue, and the Unpaid count goes down by one. As an employee the amounts are not shown.
18. **CSV.** Download the CSV. **Expected:** the summary has "Unpaid at hotel (bookings in the period)" (and, for admins, "still to collect"); every booking row has "Payment method", "Payment status" (Paid, Pending, Awaiting payment) and "Paid on" (the day it was marked paid).
19. **Extras in the form.** New booking, choose a property that has guest extras (Properties, Guest extras tab: a priced one such as "Breakfast basket", and an on-request one such as the default "Extra pillows"). **Expected:** an **Extras** section lists exactly the property's published extras with the price or "On request · nothing charged now". An unpublished extra is not listed. Choose another property: its own list appears.
20. **Priced and requested extras.** Tick the priced extra and set 2. **Expected:** the price summary adds "Breakfast basket × 2" and the total grows by price x 2 (no discount on extras). Tick the on-request extra. **Expected:** it appears as "Extra pillows × 1 · on request" with "Not charged now" and the total does not change. Quantity stops at 20.
21. **Saved with the booking.** Save it. Open the booking. **Expected:** "Extras" lists both (the priced one with its amount, the request as "waiting for the property to confirm, nothing charged"), Total includes the priced extra, Paid so far is 0. Guest site, Manage booking: the "Extras" line shows the same. Audit log: `booking.created_by_staff` shows the number of extras and their names, nothing else.
22. **Price is a copy.** In Properties, Guest extras, change the price of the extra you booked (or delete it). Reopen the booking. **Expected:** the booking still shows the old name and price and the same total.
23. **Mark paid and cancel with extras.** Mark that booking as paid (admin). **Expected:** Paid so far equals the total including the extra. Cancel it. **Expected:** the refund is the policy percentage of that whole paid amount.
24. **Changing dates with extras.** Make a **paid** booking with a priced extra (today that is a staff-made pay-at-hotel booking with breakfast, then **Mark as paid**; the guest checkout does not save extras yet) and note its total. Choose **Change dates** (staff, on the booking card) or **Change dates** on the guest's Manage booking page. **Expected:** it is no longer refused. The price box lists the new nights, then a line **"Extras carried over: Breakfast × 2"** with the amount (a request or free extra shows "No charge"), then **New total** (new stay + the same extras), the change fee if any, **Already paid**, and one sentence. Try three date ranges:
    - a **cheaper** stay: the sentence says money comes back (staff: "The guest gets ... back"), and the amount is the old paid total minus the new total minus the fee;
    - a **dearer** stay: "You pay ... more" (staff: "The guest owes ... more"), only the difference, not the whole stay again;
    - a stay that costs the **same** as the old stay, with no fee: "Nothing more to pay and nothing to refund".
    Confirm one. **Expected:** the new booking (new reference) shows the same extras with the same names and prices and its total equals the **New total** you were shown. The old booking is cancelled and keeps its own extras. Change the price of that extra in Properties first if you like: the carried-over price does **not** change.
25. **Money figures in Reports for an employee with refund access.** As admin, Team, **Give refund access** to the employee (the dialog now says it also shows revenue and amounts in Reports). Employee reloads Reports. **Expected:** revenue, Paid by guests, To collect, refunds, the Payments tab and the CSV amounts are visible, like for an admin, and the grey note about money for admins is gone. Team, Audit log and Properties are still missing from the menu. Remove the access. **Expected:** after a reload the figures are hidden again and the note says "Ask an admin if you need the money figures."
26. **Audit log member filter.** As admin, Audit log. **Expected:** next to "What happened" there is a **Member** list: **Everyone** first, then every person on the Team page by name, including someone you have switched off ("(switched off)") and you ("(you)"). Pick the employee who made the bookings above. **Expected:** only the rows that person did (their bookings, marked paid, sign-ins); pick **Everyone** to see all again. Combine it with a date or a kind of action. **Expected:** both apply, "Load older entries" keeps the member filter, and "Clear filters" resets it. Pick a member who has done nothing. **Expected:** "Nothing matches these filters". (Database check, optional: `curl` with an admin session cookie to `/api/proxy/staff/audit?member=<an id from another workspace>` returns an empty list, never an error that names it.)

27. **Marked paid while someone cancels (race, optional).** Open the same unpaid pay-at-hotel booking in two browsers (an admin in each). In one, open Cancel and wait on the confirm button; in the other, Mark as paid. Now confirm the cancel. **Expected:** the cancel is refused with "This booking was just updated by someone else. Reload it and try again." and the booking stays confirmed and paid. (Before this check a cancel could record a refund of nothing for money already received.)
28. **Too large a booking.** In New booking choose an extra priced near its limit with quantity 20 on a long stay (or lower your test extra's price to €60,000 and tick 20). **Expected:** a plain "That booking is too large" message, not an error screen.
29. **Rate limit on New booking (optional).** Press the quote refresh quickly more than about 120 times a minute, or create more than 20 bookings in a minute with a script using your session. **Expected:** a "Too many ... Wait a moment" message and a Retry-After; normal use never sees it.
30. **Free dates are not refused for a stale guest hold.** On the guest site start a checkout for dates and let it run out of time (15 minutes) without paying. As staff, book the same dates at once. **Expected:** the booking is accepted (not "no longer available").

## 15. Guest page spacing and staff notes

Section 15 needs migration `043` (restart the API first) for the notes. Steps 1-2 are only layout and need no data.

1. **Pay button spacing (guest site).** Open a stay with dates in the address (for example `/properties/<property>/stays/<stay>?checkIn=2026-12-10&checkOut=2026-12-11&guests=2`). Scroll to "Book this stay". **Expected:** at every width (320, 360, 390, 430, tablet 820 and desktop 1280) the **Pay** button has the same left and right edge as the promo field, the totals and the checkbox above it. On a phone it stays pinned to the bottom of the screen with a gap to the card's edges. On desktop (the narrow panel next to the photos) it does **not** reach the card's border. No horizontal scrolling at any width.
2. **Search bar spacing (guest site).** Open the home page and `/search?checkIn=2026-12-10&checkOut=2026-12-11&guests=2`. **Expected:** on a laptop or desktop width **Check-in, Nights, Guests and Search** sit in one row with a clear gap between each (the three fields never touch). On a phone the fields stack, Nights and Guests share a row with a gap, and nothing touches the screen edge. Also check the stay page's "Check availability" bar and the one-line summary with **Edit** on the results page at phone width.
3. **Add a note.** As an employee, open a booking from the list under the calendar. **Expected:** a **Staff notes** section with a box ("Add a note for your team"), a counter like `0 / 2000`, **Add note** (greyed out while the box is empty) and "Only your team sees these notes. The guest never does." Type `Deposit of 50 EUR taken in cash` and press **Add note**. **Expected:** it appears at the top with your name and the time, the box empties.
4. **Icon in the list.** Close the card. **Expected:** that booking's row under the calendar now shows a small note icon with `1` (hover or a screen reader: "1 staff note"). A booking without notes shows no icon. Add a second note: the icon shows `2`.
5. **The guest's own note is separate.** In the same card, "Note from the guest" is unchanged and has no edit box. **Expected:** staff notes never appear inside it.
6. **Who can remove.** As the **employee**, the **Remove note** button shows only on your own notes. As **admin**, open the same booking: every note has **Remove note**. Remove one as admin and confirm. **Expected:** it disappears for everyone after a reload, and the icon count drops. Reload as the employee: a colleague's note still has no Remove button for them.
7. **Limits.** Type 2,001 characters: the counter turns red and **Add note** stays off. Paste text with a tab or a new line: it is kept. A note that looks like code (`<b>hi</b>`) is shown as plain text.
8. **Audit log.** As admin, Audit log, filter Member = the employee. **Expected:** `booking.note_added` and `booking.note_removed` rows with who and which booking, and **no note text** anywhere in the row.
9. **The guest never sees notes.** Open the guest's `/manage` page for that booking (reference + email). **Expected:** no staff notes, no staff names.
10. **Database check (read only).** In a terminal:
    ```bash
    docker exec -i resort-booking-postgres-1 psql -U resort -d resort_booking <<'SQL'
    begin; delete from booking_staff_notes; rollback;
    begin; update booking_staff_notes set body = 'changed'; rollback;
    SQL
    ```
    **Expected:** both statements fail with an error (notes are never deleted or edited), even for the owner role. With no notes yet the statements affect no row and the error may not show: add a note first.
11. **Erasure scrubs notes (dry run).** `npm run privacy:erase-guest -w @resort-booking/api -- --email <test guest email>` (no `--apply`). **Expected:** a dry run; nothing changes. With `--apply` on a **test** booking the note text becomes `[removed]` (the receipt says "staff notes scrubbed: N").

## Automated checks you can trigger yourself

Run from the repository root. Start Docker first (`npm run db:up`) for the database tests.

| Command | What it runs |
| --- | --- |
| `npm run test:full` | Every test suite in one go: API, admin, web and ui, including the real-database tests (about 2 minutes). |
| `npm run check` | Everything before a push: type-checks, lint, `test:full` and the security script. |
| `npm run test:api` / `test:admin` / `test:web` / `test:ui` | One app at a time. |
| `npm run test:db` | Only the real-database tests (migrations, guards, roles). Uses temporary `resort_check_*` databases and removes them. |
| `npm run typecheck` / `npm run lint:all` | Type-checks, or lint for api, admin and web. |
| `npm run security:check` | The banned-pattern and secret checks used by CI. |

The database tests connect with `DATABASE_ADMIN_URL`; it defaults to the local Docker Postgres (`postgres://resort:resort@localhost:5433/postgres`). Set it yourself to use another server.

## If something fails

1. Note the step, what you did and what you saw (a screenshot helps).
2. The migrations are additive, so a code revert (`git revert <commit>`) is safe: the extra columns and tables stay and are ignored by older code. The append-only triggers also stay.
3. Never edit a migration that has already run. Add a new one. The migration runner checks checksums and will stop with a message if an applied file was changed.
