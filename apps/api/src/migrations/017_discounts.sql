-- 017: admin-configured discounts. A discount is an effect (percent or fixed) plus conditions that
-- must all match (long stay, early bird, promo code, ...). Calculated in the API only.

CREATE TABLE discounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  property_id uuid NOT NULL REFERENCES properties (id),
  label text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 80),
  effect_kind text NOT NULL CHECK (effect_kind IN ('percent', 'fixed')),
  effect_value integer NOT NULL CHECK (effect_value >= 0),
  conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  always_on boolean NOT NULL DEFAULT false,
  -- NULL = every house at the property.
  house_ids uuid[],
  combinable boolean NOT NULL DEFAULT false,
  priority integer NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  max_redemptions integer CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effect_kind <> 'percent' OR effect_value <= 100),
  -- No accidental "applies to everything": no conditions means the staff said so on purpose.
  CHECK (always_on OR jsonb_array_length(conditions) > 0)
);

CREATE INDEX discounts_property_idx ON discounts (property_id) WHERE active;

-- One row per confirmed stay that used a discount (for max redemptions and reporting).
CREATE TABLE discount_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discount_id uuid NOT NULL REFERENCES discounts (id) ON DELETE CASCADE,
  inventory_block_id uuid NOT NULL REFERENCES inventory_blocks (id) ON DELETE CASCADE,
  amount_cents integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (discount_id, inventory_block_id)
);

-- Samples for the seeded properties so discounts are visible out of the box.
INSERT INTO discounts (organization_id, property_id, label, effect_kind, effect_value, conditions, combinable, priority)
SELECT p.organization_id, p.id, 'Long stay: 7+ nights', 'percent', 10, '[{"kind":"min_nights","nights":7}]'::jsonb, false, 100
FROM properties p
WHERE p.id IN ('22222222-2222-2222-2222-222222222221', '22222222-2222-2222-2222-222222222222');

INSERT INTO discounts (organization_id, property_id, label, effect_kind, effect_value, conditions, combinable, priority)
SELECT p.organization_id, p.id, 'Welcome code', 'percent', 15, '[{"kind":"promo_code","code":"WELCOME15"}]'::jsonb, false, 100
FROM properties p
WHERE p.id IN ('22222222-2222-2222-2222-222222222221', '22222222-2222-2222-2222-222222222222');
