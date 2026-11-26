-- 041: extras chosen on a booking (docs/04 "Extra services", docs/14).
--
-- Until now the guest checkout only LISTED a property's extras: nothing saved which extra a booking wanted. A staff
-- booking can now carry extras, and this table is where they live (the guest checkout can reuse it later).
--
-- One row per extra on a booking. The row keeps a COPY of what the guest was offered (name, kind, unit price, currency),
-- so editing or deleting the catalog entry later never changes a booking's price or what the guest asked for.
--   kind 'instant'     a priced add-on: it is part of the booking total (line_cents = unit price x quantity) and is paid
--                      together with the stay. Status 'confirmed'.
--   kind 'on_request'  the guest asks, staff confirm later: nothing is charged now (line_cents = 0). Status 'pending'.
--                      Approving or declining a request is a later step; the status list grows then, never shrinks.
--   quantity           1 to 20 (two pillows, three cots).
--
-- Tenant safety: the booking and the property must belong to the SAME organization (composite foreign keys). The
-- catalog link is a plain key that becomes NULL when the extra is deleted from the catalog.
-- Money safety: price, quantity, kind, currency and the booking never change after the row exists; only the status can
-- move (pending -> confirmed or declined, later). No DELETE for the runtime role (see RESTRICTED_TABLES in roles.ts).
-- A retention or erasure job run by the owner can still use `SET LOCAL resort.record_maintenance = 'on'`.
--
-- Safe on existing data: a new table, nothing rewritten or deleted. Replayable: IF NOT EXISTS, DROP ... IF EXISTS.

CREATE UNIQUE INDEX IF NOT EXISTS inventory_blocks_id_organization_key ON inventory_blocks (id, organization_id);

CREATE TABLE IF NOT EXISTS reservation_extras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  property_id uuid NOT NULL REFERENCES properties (id),
  inventory_block_id uuid NOT NULL REFERENCES inventory_blocks (id),
  extra_service_id uuid REFERENCES extra_services (id) ON DELETE SET NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
  kind text NOT NULL CHECK (kind IN ('instant', 'on_request')),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 20),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0),
  line_cents integer NOT NULL CHECK (line_cents >= 0),
  currency_code text NOT NULL CHECK (length(currency_code) = 3),
  status text NOT NULL CHECK (status IN ('confirmed', 'pending', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reservation_extras_line_matches_kind CHECK (
    (kind = 'instant' AND line_cents = unit_price_cents * quantity AND status = 'confirmed')
    OR (kind = 'on_request' AND line_cents = 0 AND status IN ('pending', 'declined'))
  ),
  CONSTRAINT reservation_extras_booking_org_fk
    FOREIGN KEY (inventory_block_id, organization_id) REFERENCES inventory_blocks (id, organization_id),
  CONSTRAINT reservation_extras_property_org_fk
    FOREIGN KEY (property_id, organization_id) REFERENCES properties (id, organization_id)
);

CREATE INDEX IF NOT EXISTS reservation_extras_booking_idx ON reservation_extras (inventory_block_id);

CREATE OR REPLACE FUNCTION resort_guard_reservation_extras() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('resort.record_maintenance', true), '') = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'reservation_extras rows are not deleted: DELETE is not allowed'
      USING ERRCODE = 'insufficient_privilege',
        HINT = 'A retention or erasure job must run as the owner with SET LOCAL resort.record_maintenance = ''on'' (docs/11).';
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.property_id IS DISTINCT FROM OLD.property_id
    OR NEW.inventory_block_id IS DISTINCT FROM OLD.inventory_block_id
    OR NEW.name IS DISTINCT FROM OLD.name
    OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.quantity IS DISTINCT FROM OLD.quantity
    OR NEW.unit_price_cents IS DISTINCT FROM OLD.unit_price_cents
    OR NEW.line_cents IS DISTINCT FROM OLD.line_cents
    OR NEW.currency_code IS DISTINCT FROM OLD.currency_code THEN
    RAISE EXCEPTION 'the price and quantity of an extra on a booking never change'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS reservation_extras_guard ON reservation_extras;
CREATE TRIGGER reservation_extras_guard BEFORE UPDATE OR DELETE ON reservation_extras
  FOR EACH ROW EXECUTE FUNCTION resort_guard_reservation_extras();
