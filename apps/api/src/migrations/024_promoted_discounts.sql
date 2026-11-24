-- 024: staff can choose which discounts are advertised on the guest site.
-- A promo-code discount advertised this way shows its code publicly: staff opt in per discount.

ALTER TABLE discounts ADD COLUMN promoted boolean NOT NULL DEFAULT false;

-- The seeded long-stay sample is the offer the guest site is meant to show out of the box.
UPDATE discounts SET promoted = true WHERE label = 'Long stay: 7+ nights';
