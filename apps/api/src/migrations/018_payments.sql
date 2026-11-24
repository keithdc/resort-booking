-- 018: payments. One row per payment attempt for a hold. `provider` is 'mock' now and 'stripe'
-- later; the booking logic never depends on which one it is.

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  property_id uuid NOT NULL REFERENCES properties (id),
  inventory_block_id uuid NOT NULL REFERENCES inventory_blocks (id),
  provider text NOT NULL,
  provider_ref text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  currency_code text NOT NULL,
  status text NOT NULL CHECK (status IN ('requires_payment', 'succeeded', 'failed', 'cancelled')),
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_ref)
);

CREATE INDEX payments_block_idx ON payments (inventory_block_id);

-- A stay is paid once, and only one attempt is open at a time (two taps cannot start two charges).
CREATE UNIQUE INDEX payments_one_success_per_stay ON payments (inventory_block_id) WHERE status = 'succeeded';
CREATE UNIQUE INDEX payments_one_open_per_stay ON payments (inventory_block_id) WHERE status = 'requires_payment';
