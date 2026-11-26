# Manual test guide for the hardening work

Run this after pulling the hardening commits. It takes about 45 minutes. Use **test data only** (test emails, a test booking). Each step says what to do and what you should see. If a step does not match, note the step number and the screenshot; that is enough to open a hotfix.

Ports used by the dev setup: web `3000`, admin `3001`, API `3002`.

## 0. Prepare

1. Stop the API, admin and web.
2. Admin env: in `apps/admin/.env` rename `NEXT_PUBLIC_API_URL` to `API_URL` (same value, `http://localhost:3002`). The old name still works as a fallback, but the API address should not be in the browser bundle.
3. Start everything with `npm run dev:api`, `npm run dev:admin` and `npm run dev:web` (use `npm run dev`, not a bare `next dev`).
4. In the API terminal, look for the migration lines. **Expected:** pending migrations up to `039` are applied once, then nothing on the next restart. No error lines.
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

## If something fails

1. Note the step, what you did and what you saw (a screenshot helps).
2. The migrations are additive, so a code revert (`git revert <commit>`) is safe: the extra columns and tables stay and are ignored by older code. The append-only triggers also stay.
3. Never edit a migration that has already run. Add a new one. The migration runner checks checksums and will stop with a message if an applied file was changed.
