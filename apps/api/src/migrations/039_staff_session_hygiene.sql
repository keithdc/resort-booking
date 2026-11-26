-- 039: server-side session hygiene (docs/13 R2-08): last use, a coarse device label and a hash of the sign-in address.
--
-- `last_used_at` powers the server-side IDLE timeout (the API refuses a session that was not used for
-- STAFF_SESSION_IDLE_MINUTES); `expires_at` stays the ABSOLUTE lifetime. `device_label` is a coarse label such as
-- "Chrome on macOS" worked out from the User-Agent at sign-in: the raw User-Agent is not stored. `created_ip_hash` is the salted
-- hash of the sign-in IP (never the IP itself), the same hash the audit log uses.
--
-- Safe on existing data: nothing is dropped or rewritten. Existing sessions get last_used_at = now(), so nobody is
-- signed out by this migration. Replayable: every statement is guarded. No new table, so no new grants.

ALTER TABLE staff_sessions
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS device_label text,
  ADD COLUMN IF NOT EXISTS created_ip_hash text;

CREATE INDEX IF NOT EXISTS staff_sessions_last_used_idx ON staff_sessions (last_used_at);
