-- 038: ledger of erasure requests (docs/10 S-24, docs/13 R2-23, docs/15).
--
-- GDPR Art. 17 has a trap: a backup taken BEFORE an erasure still holds the person. When such a backup is restored, the
-- erasure must be applied again. This table remembers WHO was erased without keeping the person: a keyed hash of the
-- normalised email (HMAC-SHA-256 with PRIVACY_HASH_SALT or IP_HASH_SALT), never the address itself. After a restore,
-- `npm run privacy:reapply-erasures` reads it and anonymises the matching bookings again. It also proves, to a regulator,
-- that a request was handled and when.
--
-- One row per request. Append-only for every role (the generic history guard of migration 032; the owner's maintenance
-- switch lifts it), and invisible to resort_app and resort_readonly: the API never needs it, the privacy commands run as
-- the owner (the app role's access is taken away by `restrictedTableStatements`, shared/database/roles.ts).
--
-- Safe on existing data (a new, empty table). Replayable: IF NOT EXISTS, DROP TRIGGER IF EXISTS.

CREATE TABLE IF NOT EXISTS privacy_erasure_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_kind text NOT NULL CHECK (subject_kind IN ('guest', 'staff')),
  subject_hash text NOT NULL CHECK (subject_hash ~ '^[0-9a-f]{64}$'),
  bookings_anonymised integer NOT NULL DEFAULT 0 CHECK (bookings_anonymised >= 0),
  forced boolean NOT NULL DEFAULT false,
  operator text NOT NULL CHECK (length(operator) BETWEEN 1 AND 80),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS privacy_erasure_ledger_subject_idx ON privacy_erasure_ledger (subject_kind, subject_hash);

DROP TRIGGER IF EXISTS privacy_erasure_ledger_append_only ON privacy_erasure_ledger;
CREATE TRIGGER privacy_erasure_ledger_append_only BEFORE UPDATE OR DELETE ON privacy_erasure_ledger
  FOR EACH ROW EXECUTE FUNCTION resort_guard_history();

DROP TRIGGER IF EXISTS privacy_erasure_ledger_no_truncate ON privacy_erasure_ledger;
CREATE TRIGGER privacy_erasure_ledger_no_truncate BEFORE TRUNCATE ON privacy_erasure_ledger
  FOR EACH STATEMENT EXECUTE FUNCTION resort_guard_history();
