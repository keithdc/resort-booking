-- 016: the seed phone numbers were obvious placeholders (+33400000002 is not a real number;
-- some others happen to pass). Phones are now validated (E.164 + libphonenumber), so every
-- placeholder becomes a clearly valid example number.
-- Only rows still holding the old placeholder are touched; staff edits are never overwritten.

UPDATE properties SET phone = '+33559123456' WHERE phone = '+33500000001';
UPDATE properties SET phone = '+33450123456' WHERE phone = '+33400000002';
UPDATE organizations SET contact_phone = '+33142685300' WHERE contact_phone = '+33500000000';
