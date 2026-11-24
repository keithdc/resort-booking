-- 023: the working brand name changes from "Atlantic" to the client's surname, "Humphreys".
-- Only values that still hold the original seed text are changed, so anything staff have already
-- edited is left alone. (The three seed descriptions about the Atlantic OCEAN are not the brand and stay.)
-- The dev login (owner@atlantic.example) is deliberately NOT touched: it lives in the staff table
-- and changing it would lock out existing dev databases.

UPDATE organizations SET name = 'Humphreys Hospitality' WHERE name = 'Atlantic Hospitality';
UPDATE organizations SET legal_name = 'Humphreys Hospitality SAS' WHERE legal_name = 'Atlantic Hospitality SAS';
UPDATE organizations SET bank_account_name = 'Humphreys Hospitality' WHERE bank_account_name = 'Atlantic Hospitality';
UPDATE organizations SET owner_name = 'Humphreys Hospitality' WHERE owner_name = 'Atlantic Hospitality';
UPDATE organizations SET contact_email = 'ops@humphreys.example' WHERE contact_email = 'ops@atlantic.example';
UPDATE organizations SET booking_email = 'ops@humphreys.example' WHERE booking_email = 'ops@atlantic.example';
UPDATE organizations SET guest_reply_email = 'ops@humphreys.example' WHERE guest_reply_email = 'ops@atlantic.example';

-- The seeded owner's display name (shown in "who did it" records).
UPDATE staff_users SET full_name = 'Humphreys Hospitality' WHERE full_name = 'Atlantic Hospitality';
