-- 014: operational arrival on a confirmed stay (separate from payment status)

ALTER TABLE inventory_blocks
  ADD COLUMN IF NOT EXISTS arrival_status text NOT NULL DEFAULT 'expected';

ALTER TABLE inventory_blocks
  DROP CONSTRAINT IF EXISTS inventory_blocks_arrival_status_check;

ALTER TABLE inventory_blocks
  ADD CONSTRAINT inventory_blocks_arrival_status_check
  CHECK (arrival_status IN ('expected', 'checked_in', 'checked_out'));
