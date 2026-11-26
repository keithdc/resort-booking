-- 031: per-member "can handle refunds and money actions" permission (docs/13 R2-01, owner decision).
--
-- Admins always have money access; an employee has it only when an admin grants it. The flag lives on the account
-- (staff_users) and on the invitation (staff_invites) so it can be granted at invite time and is copied to the new
-- account when the invitation is accepted. The API reads it on EVERY request (no session cache), so a grant or a
-- removal applies from the next request.
--
-- Safe on existing data: nothing is dropped or rewritten. Every existing account and invitation gets `false`, so no
-- employee gains anything by this migration, and the flag means nothing for an admin (the API treats an admin as
-- allowed whatever the column says, and clears the column whenever an account becomes an admin). Replayable:
-- ADD COLUMN IF NOT EXISTS. No new table, so no new grants: `resort_app` already has its rights on both tables.

ALTER TABLE staff_users
  ADD COLUMN IF NOT EXISTS can_manage_refunds boolean NOT NULL DEFAULT false;

ALTER TABLE staff_invites
  ADD COLUMN IF NOT EXISTS can_manage_refunds boolean NOT NULL DEFAULT false;
