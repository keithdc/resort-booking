-- 045: where a booking came from (docs/04, docs/13 section 12).
--
-- The client may keep Airbnb next to the direct site, so every booking records its source and a report can say how many
-- (and how much) came from each. The app must also work if Airbnb is dropped: nothing here depends on a channel.
--
--   booking_source   'website' (guest checkout, the default), 'airbnb', 'booking_com', 'other_site' (another site),
--                    'phone_email' (staff typed in a booking from a call or email) or 'walk_in'.
--   payment_method   also accepts 'paid_by_channel': the booking was paid on Airbnb or another site, not through this app.
--                    Such a booking is `paid` (the channel collected it), records the total the guest paid as typed by
--                    staff, and has no online payment and no refund row: refunds are handled on the channel.
--
-- Guards that work for any role, owner included:
--   * 'paid_by_channel' belongs to a channel source (airbnb, booking_com, other_site), never to a website, phone or
--     walk-in booking;
--   * a RESERVATION with a channel source is always 'paid_by_channel'. (A calendar block imported from a channel later is
--     kind 'block' with no payment method, so it may carry the source without a payment method.)
-- Changing a source after the fact is an admin correction inside the same group only (own bookings among themselves, or
-- channel bookings among themselves): the two checks above refuse a change across the groups, because it would make
-- the payment record wrong.
--
-- Backfill: every booking made by a staff member (created_by_staff_id is set) becomes 'phone_email'; every other
-- booking keeps the default 'website'. Nothing else about a row changes.
--
-- Safe on existing data: one column with a default, one rewrite of the source of staff-made bookings, no deletions.
-- Replayable: IF NOT EXISTS, DROP ... IF EXISTS before each constraint, CREATE OR REPLACE VIEW.

ALTER TABLE inventory_blocks ADD COLUMN IF NOT EXISTS booking_source text NOT NULL DEFAULT 'website';

ALTER TABLE inventory_blocks DROP CONSTRAINT IF EXISTS inventory_blocks_booking_source_check;
ALTER TABLE inventory_blocks
  ADD CONSTRAINT inventory_blocks_booking_source_check
  CHECK (booking_source IN ('website', 'airbnb', 'booking_com', 'other_site', 'phone_email', 'walk_in'));

ALTER TABLE inventory_blocks DROP CONSTRAINT IF EXISTS inventory_blocks_payment_method_check;
ALTER TABLE inventory_blocks
  ADD CONSTRAINT inventory_blocks_payment_method_check
  CHECK (payment_method IN ('card', 'bank_transfer', 'pay_at_hotel', 'paid_by_channel'));

ALTER TABLE inventory_blocks DROP CONSTRAINT IF EXISTS inventory_blocks_channel_payment_needs_channel_source;
ALTER TABLE inventory_blocks
  ADD CONSTRAINT inventory_blocks_channel_payment_needs_channel_source
  CHECK (payment_method IS DISTINCT FROM 'paid_by_channel' OR booking_source IN ('airbnb', 'booking_com', 'other_site'));

ALTER TABLE inventory_blocks DROP CONSTRAINT IF EXISTS inventory_blocks_channel_reservation_is_paid_by_channel;
ALTER TABLE inventory_blocks
  ADD CONSTRAINT inventory_blocks_channel_reservation_is_paid_by_channel
  CHECK (kind <> 'reservation' OR booking_source NOT IN ('airbnb', 'booking_com', 'other_site') OR payment_method = 'paid_by_channel');

UPDATE inventory_blocks SET booking_source = 'phone_email' WHERE created_by_staff_id IS NOT NULL AND booking_source = 'website';

CREATE INDEX IF NOT EXISTS inventory_blocks_source_idx
  ON inventory_blocks (organization_id, booking_source)
  WHERE kind = 'reservation';

-- The reporting view gets the source at the END (CREATE OR REPLACE VIEW can only append). Nothing personal.
CREATE OR REPLACE VIEW report_bookings AS
SELECT
  id,
  organization_id,
  property_id,
  house_id,
  kind,
  status,
  check_in,
  check_out,
  guest_count,
  payment_method,
  arrival_status,
  total_cents,
  paid_cents,
  currency_code,
  rebook_of_id,
  cancel_reason,
  cancelled_at,
  expires_at,
  created_at,
  payment_status,
  paid_at,
  booking_source
FROM inventory_blocks;
