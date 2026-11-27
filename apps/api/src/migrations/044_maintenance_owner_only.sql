-- 044: the maintenance switch works only for the owner of the table (docs/13 R5-07, round 6).
--
-- `SET LOCAL resort.record_maintenance = 'on'` lets an owner-run retention or erasure job step around the guard
-- triggers (audit log append-only, payment and refund history, "paid never goes back to pending", staff notes and so on).
-- Until now ANY role could set it inside its own transaction. The runtime role has no write privilege on most guarded
-- tables, but on the ones it does write (bookings, notes) a second flaw (an injection) could have switched a guard off.
--
-- Now every guard asks `resort_maintenance_allowed(table)`: the setting must be 'on' AND the current role must be a
-- superuser or a member of the role that OWNS the table. The owner is read from the catalog, so it follows the roles setup
-- (resort_owner in production, the table owner in development) and nothing is hard-coded. resort_app and resort_readonly
-- are not members of the owner role, so setting the switch gives them nothing.
--
-- In a development database where the one role `resort` owns everything and also runs the API, that role is still the owner,
-- so the switch still works there: switch development to the least-privilege roles (docs/11) to close it too.
--
-- The guard functions are rewritten in place from their own definition (pg_get_functiondef), so no body is copied by hand
-- and any guard added later by a migration is covered by the test that lists every function mentioning the switch.
-- Safe on existing data (no row is touched). Replayable: running it again finds nothing left to replace.

CREATE OR REPLACE FUNCTION resort_maintenance_allowed(guarded regclass) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('resort.record_maintenance', true), '') = 'on'
    AND (
      (SELECT rolsuper FROM pg_roles WHERE rolname = current_user)
      OR pg_has_role(current_user, (SELECT relowner FROM pg_class WHERE oid = guarded), 'MEMBER')
    )
$$;

DO $$
DECLARE
  item record;
  definition text;
  old_check constant text := $c$coalesce(current_setting('resort.record_maintenance', true), '') = 'on'$c$;
  new_check constant text := 'resort_maintenance_allowed(TG_RELID)';
BEGIN
  FOR item IN
    SELECT p.oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proname <> 'resort_maintenance_allowed'
      AND position(old_check IN p.prosrc) > 0
  LOOP
    definition := pg_get_functiondef(item.oid);
    EXECUTE replace(definition, old_check, new_check);
  END LOOP;
END
$$;
