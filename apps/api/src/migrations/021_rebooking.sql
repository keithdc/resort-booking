-- 021: changing the dates of a booking (docs/07 "Rebooking").
-- A change cancels the old booking and creates a NEW linked booking (rebook_of_id), which is the
-- model the staff calendar and reports already use. Money follows the guest: `paid_cents` says what
-- has been paid for a booking so far, a stay may have more than one payment (the original plus a
-- balance payment), and a booking may have a cancellation refund and a date-change refund.

-- What has been paid for this booking so far. Set when a payment succeeds and when a change is applied.
ALTER TABLE inventory_blocks
  ADD COLUMN IF NOT EXISTS paid_cents integer;

-- Existing reservations: what their succeeded payments add up to, else their total (what the
-- cancellation logic assumed until now).
UPDATE inventory_blocks ib
SET paid_cents = COALESCE(
  (SELECT sum(p.amount_cents)::int FROM payments p WHERE p.inventory_block_id = ib.id AND p.status = 'succeeded'),
  ib.total_cents
)
WHERE ib.kind = 'reservation' AND ib.paid_cents IS NULL;

-- A payment is either the booking itself or the balance of a date change. `payload` keeps the
-- change the guest agreed to (new dates, price) until the payment settles.
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'booking',
  ADD COLUMN IF NOT EXISTS payload jsonb;

ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_purpose_check;
ALTER TABLE payments
  ADD CONSTRAINT payments_purpose_check CHECK (purpose IN ('booking', 'rebook'));

-- A stay can legitimately be paid twice (original + balance). One OPEN payment per stay still holds.
DROP INDEX IF EXISTS payments_one_success_per_stay;

-- A booking can have a cancellation refund and a date-change refund, one of each.
ALTER TABLE refunds
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'cancellation';
ALTER TABLE refunds
  DROP CONSTRAINT IF EXISTS refunds_kind_check;
ALTER TABLE refunds
  ADD CONSTRAINT refunds_kind_check CHECK (kind IN ('cancellation', 'rebook_difference'));
ALTER TABLE refunds
  DROP CONSTRAINT IF EXISTS refunds_inventory_block_id_key;
ALTER TABLE refunds
  ADD CONSTRAINT refunds_one_per_kind UNIQUE (inventory_block_id, kind);

-- Audit trail: every date change, with the money that moved.
CREATE TABLE booking_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  property_id uuid NOT NULL REFERENCES properties (id),
  old_booking_id uuid NOT NULL REFERENCES inventory_blocks (id),
  new_booking_id uuid NOT NULL REFERENCES inventory_blocks (id),
  -- The balance payment, when the guest had to pay more.
  payment_id uuid REFERENCES payments (id),
  old_check_in date NOT NULL,
  old_check_out date NOT NULL,
  new_check_in date NOT NULL,
  new_check_out date NOT NULL,
  old_total_cents integer NOT NULL,
  new_total_cents integer NOT NULL,
  fee_cents integer NOT NULL CHECK (fee_cents >= 0),
  pay_cents integer NOT NULL CHECK (pay_cents >= 0),
  refund_cents integer NOT NULL CHECK (refund_cents >= 0),
  initiated_by text NOT NULL CHECK (initiated_by IN ('guest', 'staff')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (new_booking_id)
);

CREATE INDEX booking_changes_old_idx ON booking_changes (old_booking_id);
CREATE INDEX booking_changes_payment_idx ON booking_changes (payment_id) WHERE payment_id IS NOT NULL;
