-- 022: staff cancellations, refund resolution and date changes made by staff (docs/07 "Staff actions").
-- Who did it and why is kept on the record, never only in a log.

-- A booking cancelled by staff (or because its dates were changed) remembers who, and why.
ALTER TABLE inventory_blocks
  ADD COLUMN IF NOT EXISTS cancelled_by_staff_id uuid REFERENCES staff_users (id),
  ADD COLUMN IF NOT EXISTS cancel_reason text,
  ADD COLUMN IF NOT EXISTS cancel_note text;

ALTER TABLE inventory_blocks
  DROP CONSTRAINT IF EXISTS inventory_blocks_cancel_reason_check;
ALTER TABLE inventory_blocks
  ADD CONSTRAINT inventory_blocks_cancel_reason_check
  CHECK (cancel_reason IS NULL OR cancel_reason IN ('guest_request', 'property_cancelled', 'goodwill', 'dates_changed'));

-- A refund keeps a machine-readable reason next to its readable text, who made it, and how it was
-- resolved when staff sent the money by hand.
ALTER TABLE refunds
  ADD COLUMN IF NOT EXISTS reason_code text,
  ADD COLUMN IF NOT EXISTS created_by_staff_id uuid REFERENCES staff_users (id),
  ADD COLUMN IF NOT EXISTS resolution_note text,
  ADD COLUMN IF NOT EXISTS resolved_by_staff_id uuid REFERENCES staff_users (id),
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

ALTER TABLE refunds
  DROP CONSTRAINT IF EXISTS refunds_reason_code_check;
ALTER TABLE refunds
  ADD CONSTRAINT refunds_reason_code_check
  CHECK (reason_code IS NULL OR reason_code IN ('guest_request', 'property_cancelled', 'goodwill', 'dates_changed'));

-- The queue staff work from: refunds still waiting on a person.
CREATE INDEX IF NOT EXISTS refunds_needs_attention_idx ON refunds (status, created_at DESC) WHERE status IN ('pending', 'failed');

-- A date change made by staff records who and why.
ALTER TABLE booking_changes
  ADD COLUMN IF NOT EXISTS staff_user_id uuid REFERENCES staff_users (id),
  ADD COLUMN IF NOT EXISTS note text;
