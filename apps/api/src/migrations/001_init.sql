-- 001: core org → property → house + inventory holds

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  slug text NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  address_line text NOT NULL,
  city text NOT NULL,
  country_code text NOT NULL,
  postal_code text NOT NULL,
  latitude numeric(9, 6) NOT NULL,
  longitude numeric(9, 6) NOT NULL,
  phone text NOT NULL,
  email text NOT NULL,
  published boolean NOT NULL DEFAULT false,
  timezone text NOT NULL DEFAULT 'Europe/Paris',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);

CREATE TABLE houses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  property_id uuid NOT NULL REFERENCES properties (id),
  slug text NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  capacity integer NOT NULL CHECK (capacity > 0),
  published boolean NOT NULL DEFAULT false,
  nightly_rate_cents integer NOT NULL CHECK (nightly_rate_cents >= 0),
  currency_code text NOT NULL DEFAULT 'EUR',
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, slug)
);

CREATE TABLE property_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  property_id uuid NOT NULL REFERENCES properties (id),
  url text NOT NULL,
  alt_text text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE house_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  property_id uuid NOT NULL REFERENCES properties (id),
  house_id uuid NOT NULL REFERENCES houses (id),
  url text NOT NULL,
  alt_text text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE inventory_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  property_id uuid NOT NULL REFERENCES properties (id),
  house_id uuid NOT NULL REFERENCES houses (id),
  kind text NOT NULL CHECK (kind IN ('hold', 'reservation', 'block')),
  status text NOT NULL CHECK (status IN ('active', 'expired', 'released', 'confirmed')),
  check_in date NOT NULL,
  check_out date NOT NULL,
  guest_count integer,
  payment_method text CHECK (payment_method IN ('card', 'bank_transfer')),
  expires_at timestamptz,
  booker_name text,
  booker_email text,
  booker_phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (check_out > check_in)
);

CREATE INDEX inventory_blocks_house_dates_idx
  ON inventory_blocks (house_id, check_in, check_out);

ALTER TABLE inventory_blocks
  ADD CONSTRAINT inventory_blocks_no_overlap
  EXCLUDE USING gist (
    house_id WITH =,
    daterange(check_in, check_out, '[)') WITH &&
  )
  WHERE (status IN ('active', 'confirmed'));
