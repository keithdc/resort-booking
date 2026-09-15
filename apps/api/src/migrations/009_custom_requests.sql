-- 009: guests may send a free-text special request when staff enable it

ALTER TABLE properties
  ADD COLUMN custom_requests_enabled boolean NOT NULL DEFAULT true;
