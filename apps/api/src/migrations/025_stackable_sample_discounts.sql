-- The two seeded sample discounts ("Long stay: 7+ nights" and "Welcome code") start combinable, so a guest who
-- types the welcome code on a long stay gets both (one after the other, each on what is left).
-- Only rows still exactly as seeded are touched: label, effect and conditions must match, and combinable must
-- still be false, so a discount the operator edited or created themselves is never changed.
UPDATE discounts
SET combinable = true
WHERE combinable = false
  AND label = 'Long stay: 7+ nights'
  AND effect_kind = 'percent'
  AND effect_value = 10
  AND conditions = '[{"kind":"min_nights","nights":7}]'::jsonb;

UPDATE discounts
SET combinable = true
WHERE combinable = false
  AND label = 'Welcome code'
  AND effect_kind = 'percent'
  AND effect_value = 15
  AND conditions = '[{"kind":"promo_code","code":"WELCOME15"}]'::jsonb;
