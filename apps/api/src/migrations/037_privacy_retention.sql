-- 037: support for GDPR retention and erasure (docs/10 S-24, docs/13 R2-23, docs/15).
--
-- One new column and the indexes the retention job (`npm run privacy:retention`) and the erasure tool
-- (`privacy:erase-guest`) need, so a daily run reads only the rows it will touch and never scans the whole table.
--
--   inventory_blocks.anonymised_at   set when the guest's name, email, phone and notes were replaced by placeholders
--                                    (by the retention job or an erasure request). It is the "already done" marker that
--                                    makes both tools idempotent. Dates, amounts, currency, status and the booking
--                                    reference stay, so reports and the financial record keep working.
--
-- Safe on existing data: nothing is read, rewritten or deleted (existing rows get NULL = not anonymised yet). Replayable:
-- IF NOT EXISTS everywhere. No privilege change is needed: the table keeps its normal grants for resort_app, and the
-- retention job runs as the owner.

ALTER TABLE inventory_blocks ADD COLUMN IF NOT EXISTS anonymised_at timestamptz;

-- Stays and staff blocks waiting for the end of the retention period, oldest check-out first.
CREATE INDEX IF NOT EXISTS inventory_blocks_retention_stay_idx
  ON inventory_blocks (check_out)
  WHERE anonymised_at IS NULL AND kind IN ('reservation', 'block');

-- Abandoned checkouts (holds that never became a booking).
CREATE INDEX IF NOT EXISTS inventory_blocks_retention_hold_idx
  ON inventory_blocks (created_at)
  WHERE anonymised_at IS NULL AND kind = 'hold';

-- Erasure and export look a person up by email, ignoring case and spaces.
CREATE INDEX IF NOT EXISTS inventory_blocks_booker_email_norm_idx
  ON inventory_blocks (lower(btrim(booker_email)))
  WHERE booker_email IS NOT NULL;

-- Audit retention works by age across all organizations, and separately for rows no admin can see.
CREATE INDEX IF NOT EXISTS audit_log_retention_idx ON audit_log (created_at);
CREATE INDEX IF NOT EXISTS audit_log_orphan_idx ON audit_log (created_at) WHERE organization_id IS NULL;

-- Invitations are purged some days after they were accepted, revoked or expired, whichever came first.
CREATE INDEX IF NOT EXISTS staff_invites_closed_idx
  ON staff_invites ((COALESCE(accepted_at, revoked_at, expires_at)));

-- Finished webhook events are purged by age (the open ones are kept for the retry logic).
CREATE INDEX IF NOT EXISTS payment_webhook_events_finished_idx
  ON payment_webhook_events (received_at)
  WHERE status IN ('processed', 'ignored');
