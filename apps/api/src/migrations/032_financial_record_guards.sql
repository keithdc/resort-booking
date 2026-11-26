-- 032: financial records can only move forward (docs/13 R2-05).
--
-- The runtime role used to hold UPDATE and DELETE on every table, including the audit log and the money tables. This
-- migration adds the part that works for ANY role, even a superuser or the owner running a statement by mistake: triggers.
-- The privilege side (resort_app gets INSERT/SELECT on audit_log, no DELETE on payments or refunds, column-level UPDATE) is
-- applied by `restrictedTableStatements` in shared/database/roles.ts, which runs after every migration and in
-- `npm run db:setup-roles`; this file needs no role name.
--
--   audit_log   no UPDATE, no DELETE, no TRUNCATE. One narrow exception: the foreign key `staff_user_id ON DELETE SET
--               NULL` may blank the column (a staff account that is erased keeps its audit rows, minus the link).
--   payments    no DELETE. Amount, currency, provider, provider reference, organization, property, purpose and payload never
--               change. The booking link may move only on a succeeded payment (a date change moves the money to the new
--               booking). Status only moves: requires_payment -> succeeded | failed | cancelled, and failed | cancelled ->
--               succeeded (a LATE success reported by the provider, see docs/14). A succeeded payment never changes again.
--   refunds     no DELETE. Amount, percent, currency, links, kind, who created it and why never change. Status:
--               pending -> pending | succeeded | failed, failed -> failed | pending (retry) | succeeded, and a succeeded
--               refund never changes again. The provider can change only to 'manual' (staff paid it by hand).
--   booking_changes  no UPDATE, no DELETE (a history table).
--
-- Escape hatch for a retention or erasure job run by the owner, inside ONE transaction:
--     SET LOCAL resort.record_maintenance = 'on';
-- The setting is transaction-local, so it cannot be left on. It is only meaningful for a role that has the privilege in
-- the first place; resort_app has none of these privileges whatever it sets.
--
-- Safe on existing data: no row is read, rewritten or deleted. Replayable: CREATE OR REPLACE FUNCTION and
-- DROP TRIGGER IF EXISTS before each CREATE TRIGGER.

-- --- audit_log ------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION resort_guard_audit_log() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('resort.record_maintenance', true), '') = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    IF TG_OP = 'TRUNCATE' THEN RETURN NULL; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.staff_user_id IS NULL AND (to_jsonb(NEW) - 'staff_user_id') = (to_jsonb(OLD) - 'staff_user_id') THEN
      -- ON DELETE SET NULL of the staff account: the only change an audit row may ever get.
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'audit_log is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege',
      HINT = 'A retention or erasure job must run as the owner with SET LOCAL resort.record_maintenance = ''on'' (docs/11).';
END
$$;

DROP TRIGGER IF EXISTS audit_log_append_only ON audit_log;
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION resort_guard_audit_log();

DROP TRIGGER IF EXISTS audit_log_no_truncate ON audit_log;
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION resort_guard_audit_log();

-- --- payments -------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION resort_guard_payments() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('resort.record_maintenance', true), '') = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    IF TG_OP = 'TRUNCATE' THEN RETURN NULL; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'payments cannot be deleted: % is not allowed', TG_OP
      USING ERRCODE = 'insufficient_privilege',
        HINT = 'A retention job must run as the owner with SET LOCAL resort.record_maintenance = ''on'' (docs/11).';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.property_id IS DISTINCT FROM OLD.property_id
     OR NEW.provider IS DISTINCT FROM OLD.provider
     OR NEW.provider_ref IS DISTINCT FROM OLD.provider_ref
     OR NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
     OR NEW.currency_code IS DISTINCT FROM OLD.currency_code
     OR NEW.purpose IS DISTINCT FROM OLD.purpose
     OR NEW.payload IS DISTINCT FROM OLD.payload
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'a payment''s amount, currency, provider and links cannot be changed'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.inventory_block_id IS DISTINCT FROM OLD.inventory_block_id
     AND NOT (OLD.status = 'succeeded' AND NEW.status = 'succeeded') THEN
    RAISE EXCEPTION 'a payment can only move to another booking once it has succeeded'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      (OLD.status = 'requires_payment' AND NEW.status IN ('succeeded', 'failed', 'cancelled'))
      OR (OLD.status IN ('failed', 'cancelled') AND NEW.status = 'succeeded')
    ) THEN
      RAISE EXCEPTION 'payment status cannot go from % to %', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF OLD.status = 'succeeded'
        AND (NEW.failure_reason IS DISTINCT FROM OLD.failure_reason) THEN
    RAISE EXCEPTION 'a succeeded payment cannot be changed'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS payments_guard ON payments;
CREATE TRIGGER payments_guard BEFORE UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION resort_guard_payments();

DROP TRIGGER IF EXISTS payments_no_truncate ON payments;
CREATE TRIGGER payments_no_truncate BEFORE TRUNCATE ON payments
  FOR EACH STATEMENT EXECUTE FUNCTION resort_guard_payments();

-- --- refunds --------------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION resort_guard_refunds() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('resort.record_maintenance', true), '') = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    IF TG_OP = 'TRUNCATE' THEN RETURN NULL; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'refunds cannot be deleted: % is not allowed', TG_OP
      USING ERRCODE = 'insufficient_privilege',
        HINT = 'A retention job must run as the owner with SET LOCAL resort.record_maintenance = ''on'' (docs/11).';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.property_id IS DISTINCT FROM OLD.property_id
     OR NEW.inventory_block_id IS DISTINCT FROM OLD.inventory_block_id
     OR NEW.payment_id IS DISTINCT FROM OLD.payment_id
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
     OR NEW.percent IS DISTINCT FROM OLD.percent
     OR NEW.currency_code IS DISTINCT FROM OLD.currency_code
     OR NEW.reason IS DISTINCT FROM OLD.reason
     OR NEW.reason_code IS DISTINCT FROM OLD.reason_code
     OR NEW.initiated_by IS DISTINCT FROM OLD.initiated_by
     OR NEW.created_by_staff_id IS DISTINCT FROM OLD.created_by_staff_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'a refund''s amount, currency, links and reason cannot be changed'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.provider IS DISTINCT FROM OLD.provider AND NEW.provider <> 'manual' THEN
    RAISE EXCEPTION 'a refund''s provider can only change to manual'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.status = 'succeeded' AND to_jsonb(NEW) IS DISTINCT FROM to_jsonb(OLD) THEN
    RAISE EXCEPTION 'a succeeded refund cannot be changed'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'pending' AND NEW.status IN ('succeeded', 'failed'))
    OR (OLD.status = 'failed' AND NEW.status IN ('pending', 'succeeded'))
  ) THEN
    RAISE EXCEPTION 'refund status cannot go from % to %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS refunds_guard ON refunds;
CREATE TRIGGER refunds_guard BEFORE UPDATE OR DELETE ON refunds
  FOR EACH ROW EXECUTE FUNCTION resort_guard_refunds();

DROP TRIGGER IF EXISTS refunds_no_truncate ON refunds;
CREATE TRIGGER refunds_no_truncate BEFORE TRUNCATE ON refunds
  FOR EACH STATEMENT EXECUTE FUNCTION resort_guard_refunds();

-- --- booking_changes ------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION resort_guard_history() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('resort.record_maintenance', true), '') = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    IF TG_OP = 'TRUNCATE' THEN RETURN NULL; END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION '% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege',
      HINT = 'A retention job must run as the owner with SET LOCAL resort.record_maintenance = ''on'' (docs/11).';
END
$$;

DROP TRIGGER IF EXISTS booking_changes_append_only ON booking_changes;
CREATE TRIGGER booking_changes_append_only BEFORE UPDATE OR DELETE ON booking_changes
  FOR EACH ROW EXECUTE FUNCTION resort_guard_history();

DROP TRIGGER IF EXISTS booking_changes_no_truncate ON booking_changes;
CREATE TRIGGER booking_changes_no_truncate BEFORE TRUNCATE ON booking_changes
  FOR EACH STATEMENT EXECUTE FUNCTION resort_guard_history();
