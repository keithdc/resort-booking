-- 040: bookings made by staff, and money recorded by hand (docs/04, docs/14).
--
-- A staff member can create a booking for a guest who will pay at the property. That booking is confirmed at once,
-- but nothing has been paid: `payment_status` is 'pending' and `paid_cents` stays 0 until a person marks it paid.
--
--   payment_method      also accepts 'pay_at_hotel'. The public hold form still only accepts 'card' and 'bank_transfer'
--                       (CreateHoldDto), so a guest can never pick it.
--   payment_status      'paid' (every booking that exists today, and every online booking) or 'pending'.
--   paid_at             when a person marked a pending booking paid (null otherwise: online payments live in `payments`).
--   created_by_staff_id who made the booking for the guest (null for a booking the guest made online).
--   marked_paid_by_staff_id who ticked it as paid.
--
-- Guards that work for any role, owner included (same idea as migration 032):
--   * a pending booking is a pay-at-hotel booking and has nothing paid on it (paid_cents is 0 or null);
--   * payment_status only moves forward: pending -> paid, once, with paid_at set. Never paid -> pending.
-- A retention or erasure job can still use `SET LOCAL resort.record_maintenance = 'on'` inside one transaction.
--
-- Safe on existing data: columns are added with defaults, no row is rewritten beyond that default and nothing is
-- deleted. Replayable: IF NOT EXISTS, DROP ... IF EXISTS before each constraint and trigger.
-- The staff links are plain keys (like cancelled_by_staff_id): an erased account is deactivated, never deleted.

ALTER TABLE inventory_blocks
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by_staff_id uuid REFERENCES staff_users (id),
  ADD COLUMN IF NOT EXISTS marked_paid_by_staff_id uuid REFERENCES staff_users (id);

ALTER TABLE inventory_blocks DROP CONSTRAINT IF EXISTS inventory_blocks_payment_method_check;
ALTER TABLE inventory_blocks
  ADD CONSTRAINT inventory_blocks_payment_method_check
  CHECK (payment_method IN ('card', 'bank_transfer', 'pay_at_hotel'));

ALTER TABLE inventory_blocks DROP CONSTRAINT IF EXISTS inventory_blocks_payment_status_check;
ALTER TABLE inventory_blocks
  ADD CONSTRAINT inventory_blocks_payment_status_check
  CHECK (payment_status IN ('paid', 'pending'));

ALTER TABLE inventory_blocks DROP CONSTRAINT IF EXISTS inventory_blocks_pending_is_unpaid;
ALTER TABLE inventory_blocks
  ADD CONSTRAINT inventory_blocks_pending_is_unpaid
  CHECK (payment_status = 'paid' OR (payment_method = 'pay_at_hotel' AND COALESCE(paid_cents, 0) = 0 AND paid_at IS NULL));

CREATE OR REPLACE FUNCTION resort_guard_booking_payment_status() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('resort.record_maintenance', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  IF OLD.payment_status = 'paid' AND NEW.payment_status = 'pending' THEN
    RAISE EXCEPTION 'a paid booking cannot go back to pending'
      USING ERRCODE = 'check_violation',
        HINT = 'Payment status only moves from pending to paid.';
  END IF;
  IF OLD.payment_status = 'pending' AND NEW.payment_status = 'paid' AND NEW.paid_at IS NULL THEN
    RAISE EXCEPTION 'marking a booking paid needs paid_at'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS inventory_blocks_payment_status_guard ON inventory_blocks;
CREATE TRIGGER inventory_blocks_payment_status_guard
  BEFORE UPDATE OF payment_status ON inventory_blocks
  FOR EACH ROW WHEN (OLD.payment_status IS DISTINCT FROM NEW.payment_status)
  EXECUTE FUNCTION resort_guard_booking_payment_status();

CREATE INDEX IF NOT EXISTS inventory_blocks_pending_payment_idx
  ON inventory_blocks (organization_id, check_in)
  WHERE payment_status = 'pending' AND kind = 'reservation' AND status = 'confirmed';
