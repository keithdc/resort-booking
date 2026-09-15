-- 012: last-30 unpaid hold + sample rebook (safe if 011 already ran)

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
