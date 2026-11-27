-- 046: a coupon can be limited to one use per guest, checked by email (docs/04 discounts, docs/13 section 13).
--
-- Guests have no accounts, so "one per guest" can only mean "one per email address given at checkout". It stops a
-- guest reusing a welcome code by mistake or on purpose with the same address; someone who types a different address
-- can still reuse it (accepted residual risk, docs/13 R7-02).
--
--   discounts.once_per_guest              the switch. Only a promo-code discount (a coupon) can have it on (CHECK below).
--   discount_redemptions.email_key        keyed hash (HMAC-SHA-256, 64 hex characters) of the NORMALISED booking email,
--                                         written only for a discount with the switch on. Never the address itself. It is
--                                         personal data in hashed form: the privacy tools clear it (docs/15).
--   discount_redemptions_one_use_per_email_key
--                                         a unique partial index on (discount_id, email_key): two checkouts racing with
--                                         the same address cannot both be recorded, whatever the application code did.
--
-- Safe on existing data: one boolean with a default of false and one nullable column. No row is rewritten and no
-- existing discount changes. Replayable: IF NOT EXISTS, and DROP ... IF EXISTS before each constraint.

ALTER TABLE discounts ADD COLUMN IF NOT EXISTS once_per_guest boolean NOT NULL DEFAULT false;

ALTER TABLE discounts DROP CONSTRAINT IF EXISTS discounts_once_per_guest_coupon_check;
ALTER TABLE discounts
  ADD CONSTRAINT discounts_once_per_guest_coupon_check
  CHECK (NOT once_per_guest OR conditions @> '[{"kind":"promo_code"}]'::jsonb);

ALTER TABLE discount_redemptions ADD COLUMN IF NOT EXISTS email_key text;

ALTER TABLE discount_redemptions DROP CONSTRAINT IF EXISTS discount_redemptions_email_key_check;
ALTER TABLE discount_redemptions
  ADD CONSTRAINT discount_redemptions_email_key_check
  CHECK (email_key IS NULL OR email_key ~ '^[0-9a-f]{64}$');

CREATE UNIQUE INDEX IF NOT EXISTS discount_redemptions_one_use_per_email_key
  ON discount_redemptions (discount_id, email_key)
  WHERE email_key IS NOT NULL;
