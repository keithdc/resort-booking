-- 020: when the guest ticked "I have read the cancellation terms" at checkout (docs/07). The server
-- clock sets it when the hold is created; it is NULL only for holds made before this existed and
-- for stays staff created.

ALTER TABLE inventory_blocks
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
