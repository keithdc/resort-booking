-- 008: house amenities, guest stay notes, requestable house items (pillows, mattresses)

ALTER TABLE inventory_blocks
  ADD COLUMN guest_note text NOT NULL DEFAULT '';

CREATE TABLE house_amenities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  property_id uuid NOT NULL REFERENCES properties (id) ON DELETE CASCADE,
  house_id uuid NOT NULL REFERENCES houses (id) ON DELETE CASCADE,
  name text NOT NULL,
  details text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0
);

CREATE INDEX house_amenities_house_idx ON house_amenities (house_id);

CREATE TABLE property_request_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  property_id uuid NOT NULL REFERENCES properties (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE inventory_block_requests (
  inventory_block_id uuid NOT NULL REFERENCES inventory_blocks (id) ON DELETE CASCADE,
  request_option_id uuid NOT NULL REFERENCES property_request_options (id) ON DELETE CASCADE,
  PRIMARY KEY (inventory_block_id, request_option_id)
);

INSERT INTO house_amenities (organization_id, property_id, house_id, name, details, sort_order) VALUES
(
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222221',
  '33333333-3333-3333-3333-333333333331',
  'Mattress',
  'King, medium-firm',
  0
),
(
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222221',
  '33333333-3333-3333-3333-333333333331',
  'Pillows',
  'Four sleeping pillows + two extras in the cupboard',
  1
),
(
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222221',
  '33333333-3333-3333-3333-333333333332',
  'Mattress',
  'Queen, firmer support',
  0
),
(
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  'Mattress',
  'Two king beds',
  0
),
(
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333334',
  'Mattress',
  'Queen sofa-bed plus a spare foam mattress',
  0
);

INSERT INTO property_request_options (organization_id, property_id, name, description, published) VALUES
(
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222221',
  'Extra pillows',
  'We leave two more pillows in the house if you tick this.',
  true
),
(
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222221',
  'Baby mattress / travel cot',
  'Staff confirm we have one free. The stay is still booked if we cannot.',
  true
),
(
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  'Extra pillows',
  'Hypoallergenic extras on request.',
  true
),
(
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  'Extra mattress',
  'Fold-out mattress for one extra sleeper (within capacity).',
  true
);
