-- 036: composite tenant foreign keys (docs/13 R2-21, second half).
--
-- `organization_id` is copied onto almost every table, but until now nothing tied the copy to the parent's: a bug that
-- inserted a house under a property of ANOTHER organization was accepted by the database. These foreign keys make the
-- database agree with the application: a child row must carry the SAME organization (and, for rows under a house, the same
-- property) as its parent. It is the cheap alternative to row-level security that round 1 postponed (docs/10).
--
--   houses                                    -> properties (id, organization_id)
--   property_photos, property_request_options,
--   extra_services, cancellation_tiers,
--   property_rebook_settings, discounts,
--   rate_period_bulk_applications,
--   payments, refunds, booking_changes        -> properties (id, organization_id)
--   house_photos, house_amenities,
--   rate_periods                              -> houses (id, property_id, organization_id)
--   refunds.payment_id, booking_changes.payment_id -> payments (id, organization_id)
--
-- The existing single-column foreign keys stay. Where one of them cascades, the new one cascades the same way, so no delete
-- that worked before is blocked. Not covered: anything pointing at inventory_blocks, staff_sessions or audit_log (their own
-- migrations), and the staff links (created_by_staff_id and similar), which an erased account sets to NULL.
--
-- Needs a unique index on the parent columns for each target; they are created here (IF NOT EXISTS).
--
-- Safe on existing data, nothing is rewritten or deleted. Each key is added NOT VALID (enforced for every new or changed
-- row at once) and then VALIDATEd, but only if no existing row breaks it. If one does (the money tables cannot be
-- corrected, their triggers forbid it), the key stays NOT VALID, a WARNING names it and how many rows break it, and the
-- migration still succeeds: correct those rows, then run
--   ALTER TABLE <table> VALIDATE CONSTRAINT <name>;
-- Replayable: indexes and keys that already exist are skipped.

CREATE UNIQUE INDEX IF NOT EXISTS properties_id_organization_key ON properties (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS houses_id_property_organization_key ON houses (id, property_id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS payments_id_organization_key ON payments (id, organization_id);

-- A helper in the migration's own transaction (a temporary function would need the TEMP right, which the roles do not have).
CREATE OR REPLACE FUNCTION resort_migration_add_fk(
  child regclass,
  constraint_name text,
  child_columns text[],
  parent regclass,
  parent_columns text[],
  on_delete text DEFAULT 'NO ACTION'
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  matches text;
  has_values text;
  broken bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = child AND conname = constraint_name) THEN
    RETURN;
  END IF;
  SELECT string_agg(format('p.%I = c.%I', pc, cc), ' AND '), string_agg(format('c.%I IS NOT NULL', cc), ' AND ')
    INTO matches, has_values
    FROM unnest(child_columns, parent_columns) AS cols(cc, pc);
  -- A key with a NULL column is not checked (MATCH SIMPLE), so only rows with every column set can break it.
  EXECUTE format('SELECT count(*) FROM %s c WHERE %s AND NOT EXISTS (SELECT 1 FROM %s p WHERE %s)', child, has_values, parent, matches) INTO broken;
  EXECUTE format(
    'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%s) REFERENCES %s (%s) ON DELETE %s NOT VALID',
    child, constraint_name,
    (SELECT string_agg(quote_ident(x), ', ') FROM unnest(child_columns) AS x),
    parent,
    (SELECT string_agg(quote_ident(x), ', ') FROM unnest(parent_columns) AS x),
    on_delete
  );
  IF broken = 0 THEN
    EXECUTE format('ALTER TABLE %s VALIDATE CONSTRAINT %I', child, constraint_name);
  ELSE
    RAISE WARNING 'foreign key % on % is enforced for new rows but NOT VALIDATED: % existing row(s) break it. Correct them, then ALTER TABLE % VALIDATE CONSTRAINT %.',
      constraint_name, child, broken, child, constraint_name;
  END IF;
END
$$;

-- --- under a property -------------------------------------------------------------------------------------------------

SELECT resort_migration_add_fk('houses', 'houses_property_organization_fkey', ARRAY['property_id', 'organization_id'], 'properties', ARRAY['id', 'organization_id']);
SELECT resort_migration_add_fk('property_photos', 'property_photos_property_organization_fkey', ARRAY['property_id', 'organization_id'], 'properties', ARRAY['id', 'organization_id']);
SELECT resort_migration_add_fk('property_request_options', 'property_request_options_property_organization_fkey', ARRAY['property_id', 'organization_id'], 'properties', ARRAY['id', 'organization_id'], 'CASCADE');
SELECT resort_migration_add_fk('extra_services', 'extra_services_property_organization_fkey', ARRAY['property_id', 'organization_id'], 'properties', ARRAY['id', 'organization_id'], 'CASCADE');
SELECT resort_migration_add_fk('cancellation_tiers', 'cancellation_tiers_property_organization_fkey', ARRAY['property_id', 'organization_id'], 'properties', ARRAY['id', 'organization_id']);
SELECT resort_migration_add_fk('property_rebook_settings', 'property_rebook_settings_property_organization_fkey', ARRAY['property_id', 'organization_id'], 'properties', ARRAY['id', 'organization_id']);
SELECT resort_migration_add_fk('discounts', 'discounts_property_organization_fkey', ARRAY['property_id', 'organization_id'], 'properties', ARRAY['id', 'organization_id']);
SELECT resort_migration_add_fk('rate_period_bulk_applications', 'rate_period_bulk_applications_property_organization_fkey', ARRAY['property_id', 'organization_id'], 'properties', ARRAY['id', 'organization_id']);
SELECT resort_migration_add_fk('payments', 'payments_property_organization_fkey', ARRAY['property_id', 'organization_id'], 'properties', ARRAY['id', 'organization_id']);
SELECT resort_migration_add_fk('refunds', 'refunds_property_organization_fkey', ARRAY['property_id', 'organization_id'], 'properties', ARRAY['id', 'organization_id']);
SELECT resort_migration_add_fk('booking_changes', 'booking_changes_property_organization_fkey', ARRAY['property_id', 'organization_id'], 'properties', ARRAY['id', 'organization_id']);

-- --- under a house (same organization AND same property) --------------------------------------------------------------

SELECT resort_migration_add_fk('house_photos', 'house_photos_house_property_organization_fkey', ARRAY['house_id', 'property_id', 'organization_id'], 'houses', ARRAY['id', 'property_id', 'organization_id']);
SELECT resort_migration_add_fk('house_amenities', 'house_amenities_house_property_organization_fkey', ARRAY['house_id', 'property_id', 'organization_id'], 'houses', ARRAY['id', 'property_id', 'organization_id'], 'CASCADE');
SELECT resort_migration_add_fk('rate_periods', 'rate_periods_house_property_organization_fkey', ARRAY['house_id', 'property_id', 'organization_id'], 'houses', ARRAY['id', 'property_id', 'organization_id'], 'CASCADE');

-- --- money pointing at a payment --------------------------------------------------------------------------------------

SELECT resort_migration_add_fk('refunds', 'refunds_payment_organization_fkey', ARRAY['payment_id', 'organization_id'], 'payments', ARRAY['id', 'organization_id']);
SELECT resort_migration_add_fk('booking_changes', 'booking_changes_payment_organization_fkey', ARRAY['payment_id', 'organization_id'], 'payments', ARRAY['id', 'organization_id']);

DROP FUNCTION resort_migration_add_fk(regclass, text, text[], regclass, text[], text);
