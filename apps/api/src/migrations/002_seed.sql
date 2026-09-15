-- 002: two published properties with houses (never hardcode a single resort)

INSERT INTO organizations (id, name)
VALUES ('11111111-1111-1111-1111-111111111111', 'Atlantic Hospitality');

INSERT INTO properties (
  id, organization_id, slug, name, description,
  address_line, city, country_code, postal_code,
  latitude, longitude, phone, email, published, timezone
) VALUES
(
  '22222222-2222-2222-2222-222222222221',
  '11111111-1111-1111-1111-111111111111',
  'pine-coast',
  'Pine Coast Resort',
  'A small pine-forest resort on the Atlantic, with houses rather than a hotel corridor.',
  '12 Chemin des Pins',
  'Capbreton',
  'FR',
  '40130',
  43.640000,
  -1.430000,
  '+33500000001',
  'stay@pine-coast.example',
  true,
  'Europe/Paris'
),
(
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'alpine-lake',
  'Alpine Lake Houses',
  'Lakeside chalets in the mountains. Each house has its own calendar.',
  '8 Route du Lac',
  'Annecy',
  'FR',
  '74000',
  45.899000,
  6.129000,
  '+33400000002',
  'stay@alpine-lake.example',
  true,
  'Europe/Paris'
);

INSERT INTO houses (
  id, organization_id, property_id, slug, name, description,
  capacity, published, nightly_rate_cents, currency_code
) VALUES
(
  '33333333-3333-3333-3333-333333333331',
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222221',
  'dune-house',
  'Dune House',
  'Three-bedroom house a short walk from the beach path.',
  6,
  true,
  24000,
  'EUR'
),
(
  '33333333-3333-3333-3333-333333333332',
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222221',
  'cedar-cabin',
  'Cedar Cabin',
  'Two-bedroom cabin under the pines, with a terrace.',
  4,
  true,
  18000,
  'EUR'
),
(
  '33333333-3333-3333-3333-333333333333',
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  'lake-chalet',
  'Lake Chalet',
  'Four-bedroom chalet facing the water.',
  8,
  true,
  32000,
  'EUR'
),
(
  '33333333-3333-3333-3333-333333333334',
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  'spruce-studio',
  'Spruce Studio',
  'Compact lakeside studio for two.',
  2,
  true,
  14000,
  'EUR'
);

INSERT INTO property_photos (organization_id, property_id, url, alt_text, sort_order) VALUES
(
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222221',
  'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1600&q=80',
  'Atlantic coastline near Pine Coast Resort',
  0
),
(
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=1600&q=80',
  'Alpine lake and mountains',
  0
);

INSERT INTO house_photos (organization_id, property_id, house_id, url, alt_text, sort_order) VALUES
(
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222221',
  '33333333-3333-3333-3333-333333333331',
  'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1600&q=80',
  'Dune House exterior',
  0
),
(
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222221',
  '33333333-3333-3333-3333-333333333332',
  'https://images.unsplash.com/photo-1518780664697-55e3ad937233?auto=format&fit=crop&w=1600&q=80',
  'Cedar Cabin in the pines',
  0
),
(
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1600&q=80',
  'Lake Chalet at dusk',
  0
),
(
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333334',
  'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1600&q=80',
  'Spruce Studio interior',
  0
);
