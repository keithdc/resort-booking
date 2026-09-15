-- 004: replace a dead Unsplash URL in the Dune House gallery

UPDATE house_photos
SET url = 'https://images.unsplash.com/photo-1600489000022-c2086d79f9d4?auto=format&fit=crop&w=1600&q=80'
WHERE house_id = '33333333-3333-3333-3333-333333333331'
  AND sort_order = 2;
