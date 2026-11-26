-- 029: optional two-factor authentication (TOTP) for staff.
--
-- One row per person who started setup. The TOTP secret is stored ENCRYPTED (AES-256-GCM, key from
-- TWO_FACTOR_ENCRYPTION_KEY, never in the database). `enabled_at` stays null until the person proves they can
-- produce a code, so an abandoned setup protects nothing and blocks nothing.
-- `last_used_step` is the newest 30-second step already accepted: a code from that step or an older one is never
-- accepted again (replay protection). Recovery codes are stored only as hashes; using one removes it.
CREATE TABLE IF NOT EXISTS staff_two_factor (
  staff_user_id uuid PRIMARY KEY REFERENCES staff_users (id) ON DELETE CASCADE,
  secret_encrypted text NOT NULL CHECK (length(secret_encrypted) <= 500),
  enabled_at timestamptz,
  last_used_step bigint,
  recovery_code_hashes text[] NOT NULL DEFAULT '{}' CHECK (cardinality(recovery_code_hashes) <= 10),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- A correct password for a person with 2FA buys only one of these: a short-lived, single-purpose challenge, not
-- a session. Only the hash of the token is stored. Five wrong codes burn it.
CREATE TABLE IF NOT EXISTS staff_two_factor_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_user_id uuid NOT NULL REFERENCES staff_users (id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  failed_attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staff_two_factor_challenges_user_idx ON staff_two_factor_challenges (staff_user_id);
CREATE INDEX IF NOT EXISTS staff_two_factor_challenges_expiry_idx ON staff_two_factor_challenges (expires_at);
