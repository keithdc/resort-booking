-- 033: refund processing lease, idempotency generation and late-payment refunds (docs/13 R2-12, R2-28).
--
-- processing_started_at  the lease: set when one process takes the refund to call the provider. While it is younger than
--                        the lease length (REFUND_LEASE_SECONDS, default 150 s, longer than the provider timeout) nobody
--                        else may take the same refund; an older lease is stale and can be taken again (a crash, a deploy,
--                        a lost answer). NULL = nobody holds it.
-- attempts               how many times a process took the refund (staff retries and reconciler passes included).
-- key_generation         part of the provider idempotency key (refund id + generation + chunk). It goes up only after the
--                        provider DEFINITIVELY refused, so a staff retry then sends a fresh key, while a lost answer is
--                        asked again with the SAME key and can never pay twice.
--
-- A refund can now also be of kind 'late_payment' (the provider reported a success for a payment whose hold had ended or
-- whose dates were no longer free: the money is given back in full, automatically) with reason code 'late_payment'.
--
-- Safe on existing data: only adds columns with defaults and widens two CHECK constraints (every existing row still
-- passes). Replayable: IF NOT EXISTS / DROP CONSTRAINT IF EXISTS.

ALTER TABLE refunds
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  ADD COLUMN IF NOT EXISTS key_generation integer NOT NULL DEFAULT 1 CHECK (key_generation >= 1);

ALTER TABLE refunds DROP CONSTRAINT IF EXISTS refunds_kind_check;
ALTER TABLE refunds
  ADD CONSTRAINT refunds_kind_check CHECK (kind IN ('cancellation', 'rebook_difference', 'late_payment'));

ALTER TABLE refunds DROP CONSTRAINT IF EXISTS refunds_reason_code_check;
ALTER TABLE refunds
  ADD CONSTRAINT refunds_reason_code_check
  CHECK (reason_code IS NULL OR reason_code IN ('guest_request', 'property_cancelled', 'goodwill', 'dates_changed', 'late_payment'));

-- What the reconciler scans: online refunds still waiting on the provider.
CREATE INDEX IF NOT EXISTS refunds_stuck_pending_idx
  ON refunds (updated_at) WHERE status = 'pending' AND provider <> 'manual';
