-- 035: more CHECK constraints (docs/13 R2-21, first half).
--
-- The database now refuses what the application already refuses, so a bug or a hand-written statement cannot store it:
--   * currency codes are three capital letters (houses, extras, payments, refunds; inventory_blocks is left to its own
--     migrations), so a sum can never mix "EUR" with "eur" or "Euro";
--   * discount redemptions, rebook fees and failed-attempt counters are not negative; a percent rebook fee is at most 100;
--   * booking_changes (a history table) has check-out after check-in on both the old and the new stay, and bulk rate
--     applications end on or after they start (like rate_periods already does);
--   * public slugs are lower-case words joined by single hyphens (they are URL parts), country codes are two capital
--     letters, coordinates are on the globe, a timezone is not blank.
--
-- Safe on existing data, nothing is rewritten or deleted. Each constraint is added NOT VALID (enforced for every new or
-- changed row at once) and then VALIDATEd, but only if no existing row breaks it. If one does, the constraint stays NOT VALID,
-- a WARNING names it and how many rows break it, and the migration still succeeds: fix those rows by hand, then run
--   ALTER TABLE <table> VALIDATE CONSTRAINT <name>;
-- Replayable: a constraint that already exists is skipped.
--
-- Not here, on purpose: "a refund is at most what was paid" and "refunds add up to at most the succeeded payments" need a
-- trigger across inventory_blocks, payments and refunds with the rebook rules in it; they stay application rules (docs/13).

-- A helper in the migration's own transaction (a temporary function would need the TEMP right, which the roles do not have).
CREATE OR REPLACE FUNCTION resort_migration_add_check(target regclass, constraint_name text, expression text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  broken bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = target AND conname = constraint_name) THEN
    RETURN;
  END IF;
  -- A CHECK passes on NULL, so only rows where the expression is FALSE break it.
  EXECUTE format('SELECT count(*) FROM %s WHERE (%s) IS FALSE', target, expression) INTO broken;
  EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I CHECK (%s) NOT VALID', target, constraint_name, expression);
  IF broken = 0 THEN
    EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I', target, constraint_name);
  ELSE
    RAISE WARNING 'constraint % on % is enforced for new rows but NOT VALIDATED: % existing row(s) break it. Fix them, then ALTER TABLE % VALIDATE CONSTRAINT %.',
      constraint_name, target, broken, target, constraint_name;
  END IF;
END
$$;

-- --- currency ---------------------------------------------------------------------------------------------------------

SELECT resort_migration_add_check('houses', 'houses_currency_format', $$currency_code ~ '^[A-Z]{3}$'$$);
SELECT resort_migration_add_check('extra_services', 'extra_services_currency_format', $$currency_code ~ '^[A-Z]{3}$'$$);
SELECT resort_migration_add_check('payments', 'payments_currency_format', $$currency_code ~ '^[A-Z]{3}$'$$);
SELECT resort_migration_add_check('refunds', 'refunds_currency_format', $$currency_code ~ '^[A-Z]{3}$'$$);

-- --- money and counters -----------------------------------------------------------------------------------------------

SELECT resort_migration_add_check('discount_redemptions', 'discount_redemptions_amount_nonneg', 'amount_cents >= 0');
SELECT resort_migration_add_check('property_rebook_settings', 'property_rebook_settings_fee_range',
  $$rebook_fee_value >= 0 AND (rebook_fee_type <> 'percent' OR rebook_fee_value <= 100)$$);
SELECT resort_migration_add_check('staff_two_factor_challenges', 'staff_two_factor_challenges_attempts_nonneg', 'failed_attempts >= 0');

-- --- dates ------------------------------------------------------------------------------------------------------------

SELECT resort_migration_add_check('booking_changes', 'booking_changes_old_stay_ordered', 'old_check_out > old_check_in');
SELECT resort_migration_add_check('booking_changes', 'booking_changes_new_stay_ordered', 'new_check_out > new_check_in');
SELECT resort_migration_add_check('rate_period_bulk_applications', 'rate_period_bulk_applications_dates_ordered', 'end_date >= start_date');

-- --- text shapes ------------------------------------------------------------------------------------------------------

SELECT resort_migration_add_check('properties', 'properties_slug_format', $$slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'$$);
SELECT resort_migration_add_check('houses', 'houses_slug_format', $$slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'$$);
SELECT resort_migration_add_check('properties', 'properties_country_code_format', $$country_code ~ '^[A-Z]{2}$'$$);
SELECT resort_migration_add_check('properties', 'properties_timezone_not_blank', 'length(btrim(timezone)) >= 1');
SELECT resort_migration_add_check('properties', 'properties_coordinates_range', 'latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180');
SELECT resort_migration_add_check('houses', 'houses_coordinates_range',
  '(latitude IS NULL OR latitude BETWEEN -90 AND 90) AND (longitude IS NULL OR longitude BETWEEN -180 AND 180)');

DROP FUNCTION resort_migration_add_check(regclass, text, text);
