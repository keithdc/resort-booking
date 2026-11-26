-- Abuse guardrail for unpaid holds: remember WHO (a one-way hash of the IP, never the IP) created a hold so the API
-- can cap how many unpaid holds one caller keeps open at once. Additive and replayable.
ALTER TABLE inventory_blocks ADD COLUMN IF NOT EXISTS creator_ip_hash text;

-- The cap queries only look at live holds, so the indexes cover only those rows.
CREATE INDEX IF NOT EXISTS inventory_blocks_active_hold_ip_idx
  ON inventory_blocks (creator_ip_hash)
  WHERE kind = 'hold' AND status = 'active' AND creator_ip_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS inventory_blocks_active_hold_email_idx
  ON inventory_blocks (lower(booker_email))
  WHERE kind = 'hold' AND status = 'active';
