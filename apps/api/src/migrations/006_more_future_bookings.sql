-- 006: extra future stays so staff can page into Oct–Dec occupancy

-- Mid-November: Dune House
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
  CURRENT_DATE + 60,
  CURRENT_DATE + 67,
  4,
  'card',
  'Sofia Alvarez',
  'sofia.alvarez@example.com',
  '+33666666666',
  168000,
  'EUR'
);

-- Late November: Cedar Cabin
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
  CURRENT_DATE + 70,
  CURRENT_DATE + 74,
  3,
  'card',
  'Tom Hughes',
  'tom.hughes@example.com',
  '+33677777777',
  72000,
  'EUR'
);

-- December: Lake Chalet
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
  CURRENT_DATE + 95,
  CURRENT_DATE + 102,
  8,
  'card',
  'Elena Petrov',
  'elena.petrov@example.com',
  '+33688888888',
  256000,
  'EUR'
);
