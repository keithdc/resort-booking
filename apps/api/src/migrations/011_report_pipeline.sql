-- 011: cancelled stays, rebook link, sample pipeline rows for reports

ALTER TABLE inventory_blocks
  DROP CONSTRAINT IF EXISTS inventory_blocks_status_check;

ALTER TABLE inventory_blocks
  ADD CONSTRAINT inventory_blocks_status_check
  CHECK (status IN ('active', 'expired', 'released', 'confirmed', 'cancelled'));

ALTER TABLE inventory_blocks
  ADD COLUMN IF NOT EXISTS rebook_of_id uuid REFERENCES inventory_blocks (id);

-- Past cancelled stay (does not occupy the house)
INSERT INTO inventory_blocks (
  organization_id, property_id, house_id, kind, status,
  check_in, check_out, guest_count, payment_method,
  booker_name, booker_email, booker_phone, total_cents, currency_code
)
SELECT
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222221',
  '33333333-3333-3333-3333-333333333331',
  'reservation',
  'cancelled',
  CURRENT_DATE - 12,
  CURRENT_DATE - 9,
  4,
  'card',
  'Cancelled guest',
  'cancelled.guest@example.com',
  '+33600000001',
  72000,
  'EUR'
WHERE NOT EXISTS (
  SELECT 1 FROM inventory_blocks WHERE booker_email = 'cancelled.guest@example.com'
);

-- Released hold = guest stopped before pay
INSERT INTO inventory_blocks (
  organization_id, property_id, house_id, kind, status,
  check_in, check_out, guest_count, payment_method,
  booker_name, booker_email, booker_phone, total_cents, currency_code
)
SELECT
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333334',
  'hold',
  'released',
  CURRENT_DATE - 6,
  CURRENT_DATE - 4,
  2,
  'card',
  'Released hold',
  'released.hold@example.com',
  '+33600000002',
  28000,
  'EUR'
WHERE NOT EXISTS (
  SELECT 1 FROM inventory_blocks WHERE booker_email = 'released.hold@example.com'
);

-- Bank transfer still waiting (visible in Next 90 days)
INSERT INTO inventory_blocks (
  organization_id, property_id, house_id, kind, status,
  check_in, check_out, guest_count, payment_method,
  expires_at,
  booker_name, booker_email, booker_phone, total_cents, currency_code
)
SELECT
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333334',
  'hold',
  'active',
  CURRENT_DATE + 40,
  CURRENT_DATE + 42,
  2,
  'bank_transfer',
  now() + interval '47 hours',
  'Pending transfer',
  'pending.transfer@example.com',
  '+33600000003',
  28000,
  'EUR'
WHERE NOT EXISTS (
  SELECT 1 FROM inventory_blocks WHERE booker_email = 'pending.transfer@example.com'
);

-- Unpaid hold in the last 30 days (so Last 30 days reports are not empty)
INSERT INTO inventory_blocks (
  organization_id, property_id, house_id, kind, status,
  check_in, check_out, guest_count, payment_method,
  expires_at,
  booker_name, booker_email, booker_phone, total_cents, currency_code
)
SELECT
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222221',
  '33333333-3333-3333-3333-333333333332',
  'hold',
  'active',
  CURRENT_DATE - 8,
  CURRENT_DATE - 5,
  2,
  'card',
  now() + interval '14 minutes',
  'Pending card',
  'pending.card@example.com',
  '+33600000005',
  36000,
  'EUR'
WHERE NOT EXISTS (
  SELECT 1 FROM inventory_blocks WHERE booker_email = 'pending.card@example.com'
);

-- Rebook of the cancelled stay (sample until guest date-change ships)
INSERT INTO inventory_blocks (
  organization_id, property_id, house_id, kind, status,
  check_in, check_out, guest_count, payment_method,
  booker_name, booker_email, booker_phone, total_cents, currency_code,
  rebook_of_id
)
SELECT
  cancelled.organization_id,
  cancelled.property_id,
  cancelled.house_id,
  'reservation',
  'confirmed',
  CURRENT_DATE - 4,
  CURRENT_DATE - 1,
  cancelled.guest_count,
  'card',
  'Rebooked guest',
  'rebook.guest@example.com',
  '+33600000004',
  72000,
  'EUR',
  cancelled.id
FROM inventory_blocks cancelled
WHERE cancelled.booker_email = 'cancelled.guest@example.com'
  AND cancelled.status = 'cancelled'
  AND NOT EXISTS (
    SELECT 1 FROM inventory_blocks existing WHERE existing.booker_email = 'rebook.guest@example.com'
  )
LIMIT 1;
