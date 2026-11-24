-- 019: guest cancellation and refunds.
-- A booking keeps the cancellation policy it was made under (policy_snapshot); cancelling uses
-- THAT, never today's admin edits. 'cancelled' is already an allowed status (migration 011).

ALTER TABLE inventory_blocks
  ADD COLUMN IF NOT EXISTS policy_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- One refund per booking. A second cancel can never create a second refund.
CREATE TABLE refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations (id),
  property_id uuid NOT NULL REFERENCES properties (id),
  inventory_block_id uuid NOT NULL UNIQUE REFERENCES inventory_blocks (id),
  -- The payment being refunded. Null when the booking has no online payment (refunded by hand).
  payment_id uuid REFERENCES payments (id),
  -- 'mock' / later 'stripe', or 'manual' when the operator must refund outside the app.
  provider text NOT NULL,
  provider_ref text NOT NULL DEFAULT '',
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  percent integer NOT NULL CHECK (percent BETWEEN 0 AND 100),
  currency_code text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed')),
  failure_reason text,
  reason text NOT NULL DEFAULT '',
  initiated_by text NOT NULL CHECK (initiated_by IN ('guest', 'staff')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX refunds_property_idx ON refunds (property_id, status);
