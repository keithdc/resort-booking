-- 027: database access levels (S-05, S-22, S-23). Additive and replayable.
--
-- 1. Reporting views for the read-only role. They list booking and revenue FACTS and leave out everything personal
--    (guest name, email, phone, free-text notes, the abuse-limit hash) and everything financial about the business
--    (IBAN, VAT number, bank account name). A regular view runs with its owner's rights, so the read-only role can read
--    the view without any right on the table behind it. The grants are made by `npm run db:setup-roles`.
-- 2. CHECK constraints that stop impossible numbers at the door. Each one is added NOT VALID (no table scan, applies to
--    new rows at once) and then validated only if the existing rows already satisfy it; otherwise it stays NOT VALID
--    and a notice says so, instead of failing the whole migration.
-- 3. A unique index on lower(staff_users.email) and an index that makes the expired-session purge cheap.

-- --- 1. Views without personal data ---------------------------------------------------------------------------------

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
  created_at
FROM inventory_blocks;

CREATE OR REPLACE VIEW report_organizations AS
SELECT id, name, created_at
FROM organizations;

CREATE OR REPLACE VIEW report_refunds AS
SELECT
  id,
  organization_id,
  property_id,
  inventory_block_id,
  kind,
  status,
  amount_cents,
  percent,
  currency_code,
  initiated_by,
  reason_code,
  created_at,
  resolved_at
FROM refunds;

CREATE OR REPLACE VIEW report_payments AS
SELECT
  id,
  organization_id,
  property_id,
  inventory_block_id,
  purpose,
  provider,
  status,
  amount_cents,
  currency_code,
  created_at,
  updated_at
FROM payments;

-- --- 2. Guard-rail CHECK constraints --------------------------------------------------------------------------------

DO $$
DECLARE
  wanted record;
  violations bigint;
BEGIN
  FOR wanted IN
    SELECT * FROM (VALUES
      ('inventory_blocks', 'inventory_blocks_guest_count_positive', 'guest_count >= 1'),
      ('inventory_blocks', 'inventory_blocks_total_cents_nonneg', 'total_cents >= 0'),
      ('inventory_blocks', 'inventory_blocks_paid_cents_nonneg', 'paid_cents >= 0'),
      ('booking_changes', 'booking_changes_old_total_cents_nonneg', 'old_total_cents >= 0'),
      ('booking_changes', 'booking_changes_new_total_cents_nonneg', 'new_total_cents >= 0'),
      ('rate_period_bulk_applications', 'rate_period_bulk_applications_rate_nonneg', 'nightly_rate_cents >= 0')
    ) AS t (table_name, constraint_name, check_expression)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = wanted.constraint_name AND conrelid = to_regclass(wanted.table_name)
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I CHECK (%s) NOT VALID',
        wanted.table_name, wanted.constraint_name, wanted.check_expression
      );
    END IF;

    -- A NULL value passes a CHECK, so only rows where the expression is plainly false count as violations.
    EXECUTE format('SELECT count(*) FROM %I WHERE NOT (%s)', wanted.table_name, wanted.check_expression)
      INTO violations;
    IF violations = 0 THEN
      EXECUTE format('ALTER TABLE %I VALIDATE CONSTRAINT %I', wanted.table_name, wanted.constraint_name);
    ELSE
      RAISE NOTICE 'Constraint % left NOT VALID: % existing row(s) break it. New rows are still checked.',
        wanted.constraint_name, violations;
    END IF;
  END LOOP;
END
$$;

-- --- 3. Staff table hygiene -----------------------------------------------------------------------------------------

-- Logins are matched in lower case, so two accounts may never differ only by case. Skipped (with a notice) if the
-- table already holds such a pair, so the migration cannot fail on old data.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM staff_users GROUP BY lower(email) HAVING count(*) > 1) THEN
    RAISE NOTICE 'staff_users_email_lower_key not created: two accounts differ only by email case. Merge them, then re-run.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS staff_users_email_lower_key ON staff_users (lower(email));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS staff_sessions_expires_idx ON staff_sessions (expires_at);
