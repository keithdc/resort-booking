# Payments operations runbook

For the person who runs the deployment. Covers refund and payment statuses, what the automatic checks do, how to retry, what
to alert on, how to rotate the webhook secret and what to do when a payment arrives too late. Design background:
`docs/05-eu-compliance-and-payments.md`, `docs/07-cancellation-policy.md`, `docs/13-security-review-round-2.md` (R2-05, R2-12,
R2-28), `docs/11-database-access.md` (append-only records).

## Statuses

**Payment** (`payments.status`): `requires_payment` (open, waiting for the guest) -> `succeeded`, `failed` or `cancelled`.
A `failed` or `cancelled` payment can still become `succeeded` once: that is a **late success** (the provider took the money
after our attempt had ended); its `failure_reason` is then `late_success`. A succeeded payment never changes again. The database
enforces this (trigger), not only the code.

**Refund** (`refunds.status`): `pending` -> `succeeded` or `failed`; `failed` -> `pending` (a retry) or `succeeded`; a
succeeded refund never changes. Kinds: `cancellation`, `rebook_difference`, `late_payment` (automatic, see below). Online
refunds hold a **lease** (`processing_started_at`) while a process is talking to the provider.

| What staff see | What it means | What to do |
| --- | --- | --- |
| `pending`, provider `manual` | No online payment to refund: staff send the money themselves | Send it, then "Mark as refunded" with a note |
| `pending`, online, young | A provider call is in flight, or the answer was lost | Wait. The reconciler settles it within about `REFUND_RECONCILE_AFTER_MINUTES` + 2 minutes |
| `pending`, online, with "The provider did not answer" | The call timed out; the outcome is unknown | Wait for the reconciler; do NOT mark it paid by hand unless you checked the provider dashboard |
| `failed`, "The provider refused ..." | The provider said no (card closed, amount too high ...) | Fix the cause, press **Retry** (a fresh idempotency key is used), or pay by hand and "Mark as refunded" |
| `failed`, "Reconciler: ... no clear answer after N tries" | The provider never answered clearly | Open the refund in the provider dashboard. If it exists there, mark it refunded by hand with the provider id in the note. If it does not, **Retry** (same key, safe) |
| `failed`, "Reconciler: the online payments can no longer cover this refund" | Another refund took the money | Pay by hand, then "Mark as refunded" |
| `failed`, "The provider reported the refund as failed" | The provider's webhook said the refund failed later | As for a refusal: Retry or pay by hand |

"Retry" and "Mark as refunded" answer 409 `REFUND_NOT_RETRYABLE` / `REFUND_BEING_PROCESSED` while a call may still be in flight
(a live lease, `REFUND_LEASE_SECONDS`, default 150). Wait a few minutes and try again; the lease expires by itself.

## Money recorded by hand: pay at hotel

A booking staff make for a guest who pays at the property (`payment_method = 'pay_at_hotel'`, migration 040) is confirmed with
`payment_status = 'pending'` and `paid_cents = 0`. There is no row in `payments`: no provider is involved, so nothing here is
reconciled automatically. A person ticks **Mark as paid** once the guest has paid at the desk.

- **Who:** admins and employees. It moves no money out, it is audited, and the front desk is who takes the cash. An admin can still
  see every tick in the audit log (`booking.marked_paid`: who, role, reference, amount; never the guest's details). If you want
  only admins (or refund-access holders) to tick, change `@AllowRoles` on `POST /staff/reservations/:id/mark-paid` and the role
  matrix in `tenant-isolation.spec.ts`; it is a one-line decision, see the open question in the hand-over notes.
- **What it writes:** `payment_status = 'paid'`, `paid_at`, `marked_paid_by_staff_id`, `paid_cents = total_cents`, in one
  conditional `UPDATE` (only a confirmed, pending pay-at-hotel row matches), so a double click or two people ticking cannot count
  it twice (the second gets 409 `ALREADY_PAID`). The database also refuses `paid -> pending`, even for the owner role (trigger from
  migration 040; the usual `resort.record_maintenance` escape hatch for an owner-run job still applies).
- **Cancelling:** a pending booking is cancelled with a refund row of 0, "no refund under the policy", status `succeeded`; no
  person has anything to do. A booking marked paid and later cancelled gets a normal policy refund, as a **manual** refund
  (`provider = manual`, no online payment is on record): the person sends the money back and uses "Mark as refunded".
- **Reconciling cash:** list what is still to collect with
  `SELECT id, check_in, total_cents, currency_code FROM inventory_blocks WHERE payment_status = 'pending' AND kind = 'reservation' AND status = 'confirmed' ORDER BY check_in;`
  (an index covers it). Pending bookings with a check-in in the past are the ones to chase. There is no screen for this yet.
- **Not done yet (phase 2):** the **Credit card** option, which will give the guest a payment link and confirm the booking when the
  provider reports the payment. It will reuse the hold and payment code of the guest checkout.

## Idempotency keys (why a retry cannot pay twice)

Every provider refund call carries `refund-<refund id>-g<key generation>-c<chunk>`. Asking again with the same key returns the
first result, so the reconciler and a staff retry after a lost answer are safe. The key generation (`refunds.key_generation`)
goes up only when the provider **definitively refused** and nothing had been paid yet, because a provider remembers a refusal
for its key; a retry then sends a fresh key. If a refund spread over two payments failed after the first part went out, the
generation stays, the first part is replayed harmlessly and the second part may need a manual refund (note it in "Mark as
refunded"). The real provider (Stripe) receives the key as the `Idempotency-Key` header; when that adapter is written it must
throw `ProviderOutcomeUnknownError` for timeouts, dropped connections and 5xx answers, and any other error for a refusal.

## The reconciler (`RefundReconcilerService`)

Every 2 minutes, on every API instance, one at a time (a Postgres advisory lock; each refund is also taken with an atomic
lease). It looks for online refunds that are `pending`, older than `REFUND_RECONCILE_AFTER_MINUTES` (default 10), with a stale
lease. For each it asks the provider again with the SAME idempotency key:

- the provider says it was refunded -> the refund is saved as `succeeded`;
- the provider refuses -> `failed` with the reason (staff queue);
- no answer -> stays `pending`; after `REFUND_RECONCILE_MAX_ATTEMPTS` (default 5) it becomes `failed` with a clear reason;
- the online payments can no longer cover it -> `failed`.

Every reconciled refund writes an **ERROR log line** (`Refund <id> was pending for N minutes and was reconciled: <outcome>`) and
an audit entry `refund.reconciled`. Switch it off on an instance with `REFUND_RECONCILER_ENABLED=false`. It never throws; a failed
sweep logs `Refund reconciliation failed` and retries on the next pass.

Settings (all optional): `REFUND_PROVIDER_TIMEOUT_MS` 20000, `REFUND_LEASE_SECONDS` 150 (never below three timeouts plus 30 s),
`REFUND_RECONCILER_ENABLED` true, `REFUND_RECONCILE_AFTER_MINUTES` 10, `REFUND_RECONCILE_MAX_ATTEMPTS` 5, `REFUND_RECONCILE_BATCH` 20.

## Webhooks

Endpoint: `POST /payments/webhooks/<provider>` (for example `/payments/webhooks/stripe`). It answers 404 until the provider is
the configured `PAYMENT_PROVIDER` and `PAYMENT_WEBHOOK_SECRET` is set. Point the provider's dashboard at your API origin. Every
delivery is checked (signature over the raw body, timestamp within `PAYMENT_WEBHOOK_TOLERANCE_SECONDS`), recorded once per event
id in `payment_webhook_events` (status `received`, `processed`, `ignored`, `failed`; a hash of the body, no card or personal
data) and applied in one transaction. Answers: 200 (applied, ignored or already seen), 400 unreadable body, 401 bad signature,
404 not configured, 413 over 64 kB, 429 too many, 500 processing failed (the provider retries and the event is taken again).

Handled events (Stripe names): `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`,
`refund.updated` / `charge.refund.updated`. Anything else is stored as `ignored`.

### Rotating the webhook secret

1. In the provider's dashboard create the new signing secret (keep the old one active).
2. Set `PAYMENT_WEBHOOK_SECRET_PREVIOUS` to the OLD value and `PAYMENT_WEBHOOK_SECRET` to the NEW one; restart the API. Both now verify.
3. Switch the provider over to the new secret (or let it roll).
4. After a day (longer than the provider's retry window), remove `PAYMENT_WEBHOOK_SECRET_PREVIOUS`, restart, and delete the old
   secret at the provider. If a secret leaked, skip step 2: set only the new one, accept that deliveries fail until the provider is
   switched, and let the provider's retries (and the reconciler) catch up.
Never log or commit a secret. The start-up check refuses a secret shorter than 16 characters and a real provider without one.

## Late success (the money arrived after the dates were gone)

Happens when the guest paid but the hold had expired or was released, the attempt had been cancelled, or the dates were no longer
free. The system never keeps the money silently. On such a webhook it, in one transaction: marks the payment `succeeded` with
reason `late_success` (it is NOT credited to any booking), creates a full refund of kind `late_payment` against it, then (after the
commit) asks the provider to refund it with the refund's idempotency key. It writes an **ERROR log line** (`LATE PAYMENT SUCCESS: ...`)
and an audit entry `payment.late_success` (`reason`, `refundId`, `refundOutcome`, amount, booking id).

What to do: open the refund queue; the refund (reason "Late payment", note "Automatic refund ...") is `succeeded` if the provider
took it, `pending` (the reconciler will finish it) or `failed` (use Retry or pay by hand). Tell the guest: they were not charged for
a stay, the money is coming back, and they can book again if the dates are still free. If the log says **"STAFF MUST REFUND IT BY
HAND"** a late-payment refund already existed for that booking: refund the payment from the provider dashboard and note it.

## What to alert on

Wire an alert to log lines (the API logs in plain text; match on the text) or to the audit log:

| Signal | Why |
| --- | --- |
| log `LATE PAYMENT SUCCESS` or audit `payment.late_success` | money arrived for a stay we could not give; check the refund |
| log `was pending for ... and was reconciled` or audit `refund.reconciled` | a refund was stuck; look at the provider if the outcome is `failed` or `gave_up` |
| log `but could not be saved` (refund) | the provider answered but the database did not take it; the reconciler repairs it |
| log `Webhook event ... failed and will be retried` and any `payment_webhook_events` row `failed` for more than 10 minutes | webhook processing is broken |
| log `Webhook refused` repeated | a wrong secret after a rotation, or someone probing |
| log `says refund ... but our record says it is already paid` | the provider and our books disagree |
| refunds `pending` older than 30 minutes, `failed` older than a day (SQL on `refunds`) | nobody is handling the queue |
| bookings `pending` payment with a check-in in the past (SQL above) | a guest stayed and nobody marked it paid or chased it |
| log `Refund reconciliation failed` | the sweep itself is down |

The audit write is still fire and forget (R2-05 note): if the audit table is unreachable the action stands and only a log line
`Could not write audit row` says so. Alert on that line too.

## Retention and erasure

`audit_log`, `payments`, `refunds` and `booking_changes` are append-only (docs/11). A retention job runs as the owner role inside one
transaction with `SET LOCAL resort.record_maintenance = 'on'`. Keep a written record of every such run.
