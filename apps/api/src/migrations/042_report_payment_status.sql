-- 042: payment status in the reporting view (docs/14).
--
-- `report_bookings` is the facts-only view the read-only role queries (migration 027: no guest name, email, phone or
-- notes). Pay-at-hotel bookings are confirmed before they are paid, so a report needs to tell the two apart. This adds
-- two columns at the END of the view (CREATE OR REPLACE VIEW can only append): payment_status ('paid' or 'pending') and
-- paid_at. Nothing personal is added. Existing columns keep their name, type and position.
--
-- Replayable: CREATE OR REPLACE VIEW. The grants of the view are unchanged (they survive a replace).

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
  paid_at
FROM inventory_blocks;
