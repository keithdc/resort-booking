-- 028: staff roles, an active flag, one-time invitations and an audit log.
--
-- Everyone who has an account today set it up themselves, so they all become admins. New accounts default to
-- the safer role (employee): an admin is only ever created by registration or by another admin.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name = 'staff_users' AND column_name = 'role'
  ) THEN
    ALTER TABLE staff_users
      ADD COLUMN role text NOT NULL DEFAULT 'employee' CHECK (role IN ('admin', 'employee'));
    UPDATE staff_users SET role = 'admin';
  END IF;
END $$;

ALTER TABLE staff_users
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

-- Emails are stored lower-case already; this makes "Ada@x.com" and "ada@x.com" the same account for good.
CREATE UNIQUE INDEX IF NOT EXISTS staff_users_email_lower_key ON staff_users (lower(email));
CREATE INDEX IF NOT EXISTS staff_users_org_idx ON staff_users (organization_id);

-- One-time invitation links. Only the hash of the token is stored; the token itself is shown once.
CREATE TABLE IF NOT EXISTS staff_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  email text NOT NULL CHECK (length(email) <= 254),
  full_name text NOT NULL CHECK (length(full_name) <= 120),
  role text NOT NULL CHECK (role IN ('admin', 'employee')),
  -- Set for an access-reset link: accepting it sets a new password for THIS existing account instead of
  -- creating one. Null for a normal invitation.
  staff_user_id uuid REFERENCES staff_users (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_by_staff_id uuid REFERENCES staff_users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- At most one open invitation per email and organization (a new one revokes the old one first).
CREATE UNIQUE INDEX IF NOT EXISTS staff_invites_open_email_key
  ON staff_invites (organization_id, lower(email))
  WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS staff_invites_org_idx ON staff_invites (organization_id, created_at DESC);

-- Who did what, when. Never holds passwords, tokens, bank details or plain emails: only names of things,
-- ids and hashes. organization_id is null only for sign-in attempts that matched no account.
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations (id),
  staff_user_id uuid REFERENCES staff_users (id) ON DELETE SET NULL,
  action text NOT NULL CHECK (length(action) <= 80),
  target_type text CHECK (target_type IS NULL OR length(target_type) <= 40),
  target_id text CHECK (target_id IS NULL OR length(target_id) <= 80),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_hash text,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_org_time_idx ON audit_log (organization_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS audit_log_org_action_idx ON audit_log (organization_id, action, created_at DESC);
