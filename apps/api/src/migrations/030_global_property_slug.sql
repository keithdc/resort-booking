-- 030: public property slugs are globally unique (R2-02).
--
-- Guest pages find a property by its slug alone (`WHERE p.slug = $1`), but until now a slug was only unique inside one
-- organization, so a second workspace could take over another workspace's public address. This adds one unique index on
-- lower(slug) across all organizations. Houses are looked up by (property slug, house slug), so they are covered by it.
--
-- Safe on existing data: nothing is deleted. If two properties already share a slug (compare ignoring case), the OLDEST
-- one (by created_at, then id) keeps it and every later one gets its own short id appended ("beach-house-1a2b3c4d"), with
-- a NOTICE naming each change, so the migration never fails on the data and never picks the winner at random.
-- A database with a single organization, or with distinct slugs, changes nothing. Replayable: the index is IF NOT EXISTS
-- and, once it exists, no duplicates can exist.
--
-- No new table, so no new grants: `resort_app` already has its rights on `properties` (migrations 027 to 029).

DO $$
DECLARE
  moved record;
BEGIN
  FOR moved IN
    SELECT id, slug, lower(slug) || '-' || left(replace(id::text, '-', ''), 8) AS new_slug
    FROM (
      SELECT id, slug,
        row_number() OVER (PARTITION BY lower(slug) ORDER BY created_at ASC, id ASC) AS place
      FROM properties
    ) ranked
    WHERE place > 1
  LOOP
    RAISE NOTICE 'property % had a slug already used by an older property: "%" is now "%"', moved.id, moved.slug, moved.new_slug;
    UPDATE properties SET slug = moved.new_slug WHERE id = moved.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS properties_slug_lower_key ON properties (lower(slug));
