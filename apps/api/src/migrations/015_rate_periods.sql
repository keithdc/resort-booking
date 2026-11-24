-- 015: seasonal pricing. houses.nightly_rate_cents is the STANDARD rate; a rate period
-- overrides it for a date range (peak season, holidays). Ranges are inclusive nights.

CREATE TABLE rate_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  property_id uuid NOT NULL REFERENCES properties (id),
  house_id uuid NOT NULL REFERENCES houses (id) ON DELETE CASCADE,
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 80),
  start_date date NOT NULL,
  end_date date NOT NULL,
  nightly_rate_cents integer NOT NULL CHECK (nightly_rate_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

-- Guardrail: no two periods on one house may share a night. The service reports a friendly
-- error first; this constraint stops any code path (or race) from saving a conflict.
ALTER TABLE rate_periods
  ADD CONSTRAINT rate_periods_no_overlap
  EXCLUDE USING gist (
    house_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  );

CREATE INDEX rate_periods_house_dates_idx ON rate_periods (house_id, start_date, end_date);

-- Who applied a period to many houses at once, and what happened.
CREATE TABLE rate_period_bulk_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  property_id uuid NOT NULL REFERENCES properties (id),
  staff_account_id uuid,
  label text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  nightly_rate_cents integer NOT NULL,
  added_house_ids uuid[] NOT NULL,
  skipped_house_ids uuid[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The price a guest was quoted travels with the hold, so later rate edits never change it.
ALTER TABLE inventory_blocks
  ADD COLUMN IF NOT EXISTS price_snapshot jsonb;

-- Sample seasons for the seeded houses so the feature is visible out of the box.
INSERT INTO rate_periods (organization_id, property_id, house_id, label, start_date, end_date, nightly_rate_cents)
SELECT h.organization_id, h.property_id, h.id, 'Peak summer 2027', DATE '2027-07-01', DATE '2027-08-31',
  (h.nightly_rate_cents * 13 / 10)
FROM houses h
WHERE h.id IN (
  '33333333-3333-3333-3333-333333333331',
  '33333333-3333-3333-3333-333333333332',
  '33333333-3333-3333-3333-333333333333',
  '33333333-3333-3333-3333-333333333334'
);

INSERT INTO rate_periods (organization_id, property_id, house_id, label, start_date, end_date, nightly_rate_cents)
SELECT h.organization_id, h.property_id, h.id, 'Winter holidays', DATE '2026-12-23', DATE '2027-01-03',
  (h.nightly_rate_cents * 14 / 10)
FROM houses h
WHERE h.id = '33333333-3333-3333-3333-333333333333';
