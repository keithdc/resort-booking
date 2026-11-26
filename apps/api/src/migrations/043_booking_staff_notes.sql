-- 043: staff notes on a booking (docs/04 "Staff notes", docs/15).
--
-- Staff write their OWN internal notes on a booking (a deposit taken, a late arrival, a request on the phone). They are
-- separate from `inventory_blocks.guest_note`, which the guest wrote at checkout and which staff never change.
--
-- Shape: an append-only LIST of notes, not one editable text box. Each note keeps who wrote it and when, several people
-- can add notes without overwriting each other, and nothing is changed silently. A note is never edited. "Deleting" a
-- note hides it (`deleted_at`, `deleted_by_staff_id`): the runtime role cannot DELETE rows, so there is always a record
-- of what was written, and the text itself is scrubbed by the privacy tools (docs/15) when the booking is anonymised.
--
-- Who may hide a note (checked by the API): an admin any note, an employee only their own. The guest never sees notes:
-- no guest route reads this table and no `report_` view exposes it.
--
-- Tenant safety: the booking and the property must belong to the SAME organization (composite foreign keys).
-- Safe on existing data: a new table. Replayable: IF NOT EXISTS, DROP ... IF EXISTS, CREATE OR REPLACE.

CREATE UNIQUE INDEX IF NOT EXISTS inventory_blocks_id_organization_key ON inventory_blocks (id, organization_id);

CREATE TABLE IF NOT EXISTS booking_staff_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  property_id uuid NOT NULL REFERENCES properties (id),
  inventory_block_id uuid NOT NULL REFERENCES inventory_blocks (id),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_by_staff_id uuid REFERENCES staff_users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by_staff_id uuid REFERENCES staff_users (id),
  CONSTRAINT booking_staff_notes_deleted_together CHECK (deleted_by_staff_id IS NULL OR deleted_at IS NOT NULL),
  CONSTRAINT booking_staff_notes_booking_org_fk
    FOREIGN KEY (inventory_block_id, organization_id) REFERENCES inventory_blocks (id, organization_id),
  CONSTRAINT booking_staff_notes_property_org_fk
    FOREIGN KEY (property_id, organization_id) REFERENCES properties (id, organization_id)
);

CREATE INDEX IF NOT EXISTS booking_staff_notes_booking_idx ON booking_staff_notes (inventory_block_id, created_at DESC);

-- Rules for any role that is not running a maintenance job: no DELETE, the text and author never change, and a note can
-- only be hidden once (deleted_at goes from NULL to a time and then stays). A retention or erasure job run by the owner
-- can still use `SET LOCAL resort.record_maintenance = 'on'` to scrub text (docs/11, docs/15).
CREATE OR REPLACE FUNCTION resort_guard_booking_staff_notes() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('resort.record_maintenance', true), '') = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'booking_staff_notes rows are not deleted: DELETE is not allowed'
      USING ERRCODE = 'insufficient_privilege',
        HINT = 'Hide the note instead (deleted_at). A retention or erasure job must run as the owner with SET LOCAL resort.record_maintenance = ''on'' (docs/11).';
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.property_id IS DISTINCT FROM OLD.property_id
    OR NEW.inventory_block_id IS DISTINCT FROM OLD.inventory_block_id
    OR NEW.body IS DISTINCT FROM OLD.body
    OR NEW.created_by_staff_id IS DISTINCT FROM OLD.created_by_staff_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'a staff note is never edited'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.deleted_at IS NOT NULL AND (NEW.deleted_at IS DISTINCT FROM OLD.deleted_at OR NEW.deleted_by_staff_id IS DISTINCT FROM OLD.deleted_by_staff_id) THEN
    RAISE EXCEPTION 'a hidden staff note stays hidden'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS booking_staff_notes_guard ON booking_staff_notes;
CREATE TRIGGER booking_staff_notes_guard BEFORE UPDATE OR DELETE ON booking_staff_notes
  FOR EACH ROW EXECUTE FUNCTION resort_guard_booking_staff_notes();
