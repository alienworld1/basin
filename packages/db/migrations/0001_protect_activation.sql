-- A cached ACTIVE state still requires the complete, matching evidence graph.
-- Signature recovery and frozen-profile verification remain the protocol adapter's job.
CREATE FUNCTION basin.require_activation_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'ACTIVE' AND NOT EXISTS (
    SELECT 1 FROM basin.approved_payee_generation g
    JOIN basin.approved_security_root r ON r.approved_payee_generation_id = g.id
    JOIN basin.basin_identity i ON i.id = NEW.basin_identity_id
    WHERE g.approved_payee_id = NEW.id AND g.ended_at IS NULL
      AND g.expires_at > CURRENT_TIMESTAMP AND g.expires_at = NEW.expires_at
      AND NEW.relationship_name IS NOT NULL
      AND r.payee_id = i.payee_id AND r.identity_controller = i.controller_address
      AND r.identity_epoch = i.identity_epoch
      AND r.relationship_token_id = g.relationship_token_id
      AND r.relationship_registry_address = g.relationship_registry_address
      AND r.accepted_relationship_expiry = g.expires_at
  ) THEN RAISE EXCEPTION 'Activation history is required' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER require_activation_history AFTER INSERT OR UPDATE ON basin.approved_payee
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION basin.require_activation_history();
--> statement-breakpoint
CREATE FUNCTION basin.require_receipt_payment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM basin.payment p WHERE p.id = NEW.payment_id AND p.status = 'SETTLED') THEN
    RAISE EXCEPTION 'A receipt requires a settled payment' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER require_receipt_payment AFTER INSERT ON basin.receipt
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION basin.require_receipt_payment();
--> statement-breakpoint
REVOKE ALL ON FUNCTION basin.require_activation_history() FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON FUNCTION basin.require_receipt_payment() FROM PUBLIC;
