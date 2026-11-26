-- 034: payment webhook events (docs/13 R2-28, S-27).
--
-- One row per event a payment provider sent us, inserted BEFORE anything is applied, so an event is processed once even
-- when the provider delivers it twice (UNIQUE (provider, provider_event_id)). The row is finished in the same
-- transaction as the change it caused. It keeps the event id, its type, a SHA-256 of the body and a short error code,
-- never the body itself: no card data, no personal data, no signature, no secret.
--
-- status: received (being processed, or the process died), processed, ignored (a type or payment we do not act on),
--         failed (processing threw: the provider's retry or the next delivery tries again).
--
-- Privileges: the runtime role gets SELECT, INSERT and UPDATE of the status columns only (applied by
-- restrictedTableStatements in shared/database/roles.ts after every migration, and by db:setup-roles).
--
-- Replayable: IF NOT EXISTS everywhere.

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (length(provider) BETWEEN 1 AND 40),
  provider_event_id text NOT NULL CHECK (length(provider_event_id) BETWEEN 1 AND 255),
  type text NOT NULL CHECK (length(type) BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processed', 'ignored', 'failed')),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  attempts integer NOT NULL DEFAULT 1 CHECK (attempts >= 1),
  error text CHECK (error IS NULL OR length(error) <= 200),
  received_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS payment_webhook_events_open_idx
  ON payment_webhook_events (received_at) WHERE status IN ('received', 'failed');
