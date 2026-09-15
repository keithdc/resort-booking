-- 007: organization bank/legal settings + per-property extra services

ALTER TABLE organizations
  ADD COLUMN legal_name text NOT NULL DEFAULT '',
  ADD COLUMN legal_address text NOT NULL DEFAULT '',
  ADD COLUMN vat_number text NOT NULL DEFAULT '',
  ADD COLUMN iban text NOT NULL DEFAULT '',
  ADD COLUMN bic text NOT NULL DEFAULT '',
  ADD COLUMN bank_account_name text NOT NULL DEFAULT '',
  ADD COLUMN contact_email text NOT NULL DEFAULT '',
  ADD COLUMN contact_phone text NOT NULL DEFAULT '';

UPDATE organizations
SET
  legal_name = 'Atlantic Hospitality SAS',
  legal_address = '12 Chemin des Pins, 40130 Capbreton, France',
  vat_number = 'FR00000000000',
  iban = 'FR7630006000011234567890189',
  bic = 'AGRIFRPP',
  bank_account_name = 'Atlantic Hospitality',
  contact_email = 'ops@atlantic.example',
  contact_phone = '+33500000000'
WHERE id = '11111111-1111-1111-1111-111111111111';

CREATE TABLE extra_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  property_id uuid NOT NULL REFERENCES properties (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  kind text NOT NULL CHECK (kind IN ('instant', 'on_request')),
  price_cents integer NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  currency_code text NOT NULL DEFAULT 'EUR',
  published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX extra_services_property_idx ON extra_services (property_id);

INSERT INTO extra_services (
  organization_id, property_id, name, description, kind, price_cents, currency_code, published
) VALUES
(
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222221',
  'Breakfast basket',
  'Delivered to the house the morning after arrival.',
  'instant',
  1800,
  'EUR',
  true
),
(
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222221',
  'Airport transfer',
  'Staff confirm timing after the stay is paid.',
  'on_request',
  0,
  'EUR',
  true
),
(
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  'Late checkout',
  'Keep the house until 16:00 on departure day.',
  'instant',
  4500,
  'EUR',
  true
),
(
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  'Private dinner',
  'Chef visit. House stay is confirmed even if this is declined.',
  'on_request',
  0,
  'EUR',
  true
);
