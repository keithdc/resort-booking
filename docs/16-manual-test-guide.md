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
4. As the employee check: no Team, Audit log or Properties in the menu, Reports show no money figures, and opening `/team` shows "Only admins can open this page".
5. Back as admin, on the employee row choose **Reset access** and confirm. **Expected:** a one-time link. Open it in a private window. **Expected:** only **Password** and **Confirm password**, "Signing in as <email>", the heading "Reset your password" and the button "Set new password". No name field. After saving, the member's name on the Team page is unchanged.
6. Pending invitations: on an unused invitation click **New link** (or Copy new link). **Expected:** the old link stops working, the new one works.
7. Email (only when Resend is configured, see `docs/12-email.md`): tick "Email the link to them". **Expected:** a status like "Email sent to ..." and the link still shown.

## 6. Refund access and cancellations

Create a test booking first: on the guest site pick dates, pay with the mock payment, note the booking reference. Make a second one that **checks in today**.

1. As the employee **without** refund access: open the future booking, Cancel. **Expected:** only the "Guest asked" option, the refund shown equals your property's "If they cancel" table for that date, and no custom amount. Confirm. **Expected:** cancelled, a refund created at the policy amount.
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

15. **Who may tick paid.** As the employee without refund access, open a pending booking. **Expected:** the **Mark as paid** button is greyed out and a note says "Ask an admin, or an admin can give you refund access on the Team page, to mark this booking as paid." (A direct API call returns 403.) As admin, Team, **Give refund access** to that employee, confirm (the text now mentions marking pay-at-hotel bookings as paid). **Expected:** after the employee reloads, the button works and the audit log row says it was done through refund access. Remove the access again: the button greys out again.
16. **Unpaid at hotel on the home page.** Make two pending bookings: one arriving within 7 days and one later. Reports page, "Needs your attention". **Expected:** an item **N unpaid at hotel** with "<amount> to collect · 1 arriving within 7 days" (the amount is for admins; as an employee you see only the count and the arrivals). Select it. **Expected:** the Bookings tab opens on the **Unpaid at hotel** filter, only the unpaid ones are listed, the soonest check-in first, with "Arrives in N days" next to the arrival within a week.
17. **To collect, not collected.** Same page. **Expected (admin):** under Revenue the small line says "Paid by guests ... · Refunded ... · To collect <amount>", the Bookings tab shows a yellow banner "N bookings are unpaid at the hotel in this period: <amount> still to collect" with **Show them**, and the Payments & offers tab adds "Of this, <amount> comes from pay-at-hotel bookings not marked as paid yet". Mark one booking as paid. **Expected:** after Refresh its amount moves out of To collect and into Paid by guests and Revenue, and the Unpaid count goes down by one. As an employee the amounts are not shown.
18. **CSV.** Download the CSV. **Expected:** the summary has "Unpaid at hotel (bookings in the period)" (and, for admins, "still to collect"); every booking row has "Payment method", "Payment status" (Paid, Pending, Awaiting payment) and "Paid on" (the day it was marked paid).
19. **Extras in the form.** New booking, choose a property that has guest extras (Properties, Guest extras tab: a priced one such as "Breakfast basket", and an on-request one such as the default "Extra pillows"). **Expected:** an **Extras** section lists exactly the property's published extras with the price or "On request · nothing charged now". An unpublished extra is not listed. Choose another property: its own list appears.
20. **Priced and requested extras.** Tick the priced extra and set 2. **Expected:** the price summary adds "Breakfast basket × 2" and the total grows by price x 2 (no discount on extras). Tick the on-request extra. **Expected:** it appears as "Extra pillows × 1 · on request" with "Not charged now" and the total does not change. Quantity stops at 20.
21. **Saved with the booking.** Save it. Open the booking. **Expected:** "Extras" lists both (the priced one with its amount, the request as "waiting for the property to confirm, nothing charged"), Total includes the priced extra, Paid so far is 0. Guest site, Manage booking: the "Extras" line shows the same. Audit log: `booking.created_by_staff` shows the number of extras and their names, nothing else.
22. **Price is a copy.** In Properties, Guest extras, change the price of the extra you booked (or delete it). Reopen the booking. **Expected:** the booking still shows the old name and price and the same total.
23. **Mark paid and cancel with extras.** Mark that booking as paid (admin). **Expected:** Paid so far equals the total including the extra. Cancel it. **Expected:** the refund is the policy percentage of that whole paid amount.
24. **Changing dates with extras.** On a booking with a **priced** extra choose **Change dates**. **Expected:** refused with "This booking includes paid extras ... Cancel it and make a new booking instead." (a guest on Manage booking is told to contact the property). A booking with only the free or on-request extra can change dates, and the extra moves to the new booking.

## If something fails

1. Note the step, what you did and what you saw (a screenshot helps).
2. The migrations are additive, so a code revert (`git revert <commit>`) is safe: the extra columns and tables stay and are ignored by older code. The append-only triggers also stay.
3. Never edit a migration that has already run. Add a new one. The migration runner checks checksums and will stop with a message if an applied file was changed.
