-- 005: booking amounts, cancellation config, future/past test reservations

ALTER TABLE inventory_blocks
  ADD COLUMN total_cents integer,
  ADD COLUMN currency_code text NOT NULL DEFAULT 'EUR';

CREATE TABLE cancellation_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  property_id uuid NOT NULL REFERENCES properties (id),
  min_days_before_check_in integer NOT NULL CHECK (min_days_before_check_in >= 0),
  refund_percent integer NOT NULL CHECK (refund_percent BETWEEN 0 AND 100),
  UNIQUE (property_id, min_days_before_check_in)
);

CREATE TABLE property_rebook_settings (
  property_id uuid PRIMARY KEY REFERENCES properties (id),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  rebookable boolean NOT NULL DEFAULT false,
  rebook_fee_type text NOT NULL CHECK (rebook_fee_type IN ('none', 'fixed', 'percent')),
  rebook_fee_value numeric(10, 2) NOT NULL DEFAULT 0
);

INSERT INTO cancellation_tiers (organization_id, property_id, min_days_before_check_in, refund_percent)
SELECT '11111111-1111-1111-1111-111111111111', p.id, t.min_days, t.refund
FROM properties p
CROSS JOIN (
  VALUES (7, 100), (3, 75), (1, 25), (0, 0)
) AS t(min_days, refund);

INSERT INTO property_rebook_settings (property_id, organization_id, rebookable, rebook_fee_type, rebook_fee_value)
SELECT id, organization_id, false, 'none', 0
FROM properties;

-- Past stay (admin calendar must still show it)
INSERT INTO inventory_blocks (
  organization_id, property_id, house_id, kind, status,
  check_in, check_out, guest_count, payment_method,
  booker_name, booker_email, booker_phone, total_cents, currency_code
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222221',
  '33333333-3333-3333-3333-333333333331',
  'reservation',
  'confirmed',
  CURRENT_DATE - 21,
  CURRENT_DATE - 18,
  4,
  'card',
  'Claire Moreau',
  'claire.moreau@example.com',
  '+33611111111',
  72000,
  'EUR'
);

-- Future: Dune House in 10 nights
INSERT INTO inventory_blocks (
  organization_id, property_id, house_id, kind, status,
  check_in, check_out, guest_count, payment_method,
  booker_name, booker_email, booker_phone, total_cents, currency_code
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222221',
  '33333333-3333-3333-3333-333333333331',
  'reservation',
  'confirmed',
  CURRENT_DATE + 10,
  CURRENT_DATE + 14,
  5,
  'card',
  'Marie Dupont',
  'marie.dupont@example.com',
  '+33622222222',
  96000,
  'EUR'
);

-- Future: Cedar Cabin overlapping those dates (other house)
INSERT INTO inventory_blocks (
  organization_id, property_id, house_id, kind, status,
  check_in, check_out, guest_count, payment_method,
  booker_name, booker_email, booker_phone, total_cents, currency_code
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222221',
  '33333333-3333-3333-3333-333333333332',
  'reservation',
  'confirmed',
  CURRENT_DATE + 10,
  CURRENT_DATE + 12,
  2,
  'bank_transfer',
  'Jean Martin',
  'jean.martin@example.com',
  '+33633333333',
  36000,
  'EUR'
);

-- Future: Lake Chalet
INSERT INTO inventory_blocks (
  organization_id, property_id, house_id, kind, status,
  check_in, check_out, guest_count, payment_method,
  booker_name, booker_email, booker_phone, total_cents, currency_code
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  'reservation',
  'confirmed',
  CURRENT_DATE + 21,
  CURRENT_DATE + 28,
  6,
  'card',
  'Anna Rossi',
  'anna.rossi@example.com',
  '+33644444444',
  224000,
  'EUR'
);

-- Near-term: Spruce Studio
INSERT INTO inventory_blocks (
  organization_id, property_id, house_id, kind, status,
  check_in, check_out, guest_count, payment_method,
  booker_name, booker_email, booker_phone, total_cents, currency_code
) VALUES (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333334',
  'reservation',
  'confirmed',
  CURRENT_DATE + 3,
  CURRENT_DATE + 6,
  2,
  'card',
  'Luca Bianchi',
  'luca.bianchi@example.com',
  '+33655555555',
  42000,
  'EUR'
);
