-- 010: owner account, notification emails, staff login sessions

ALTER TABLE organizations
  ADD COLUMN owner_name text NOT NULL DEFAULT '',
  ADD COLUMN booking_email text NOT NULL DEFAULT '',
  ADD COLUMN guest_reply_email text NOT NULL DEFAULT '';

UPDATE organizations
SET
  owner_name = name,
  booking_email = contact_email,
  guest_reply_email = contact_email
WHERE booking_email = '';

CREATE TABLE staff_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  full_name text NOT NULL,
  email text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (email)
);

CREATE TABLE staff_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL REFERENCES staff_users (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX staff_sessions_user_idx ON staff_sessions (staff_user_id);
