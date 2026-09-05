import type {
  ApprovedPayeeGeneration,
  ApprovedSecurityRoot,
  BasinIdentity,
  Obligation,
  Payment,
  PaymentAuthoritySnapshot,
  SettlementVersion,
} from "../schema/tables";
import { requireMatch } from "../errors";

type Snapshot = Omit<PaymentAuthoritySnapshot, "id">;
export function validateSettlementSnapshot(
  snapshot: Snapshot,
  payment: Payment,
  obligation: Obligation,
  generation: ApprovedPayeeGeneration,
  root: ApprovedSecurityRoot,
  settlement: SettlementVersion,
  identity: BasinIdentity,
  settledAt: Date,
) {
  requireMatch(
    snapshot.payment_id === payment.id &&
      snapshot.approved_payee_generation_id ===
        payment.approved_payee_generation_id,
  );
  requireMatch(
    generation.id === payment.approved_payee_generation_id &&
      generation.approved_payee_id === payment.approved_payee_id,
  );
  requireMatch(
    root.approved_payee_generation_id === generation.id &&
      settlement.approved_payee_generation_id === generation.id &&
      settlement.approved_security_root_id === root.id,
  );
  requireMatch(
    snapshot.approved_security_root_id === root.id &&
      snapshot.settlement_version_id === settlement.id,
  );
  requireMatch(
    snapshot.relationship_token_id === generation.relationship_token_id &&
      snapshot.relationship_expiry.getTime() ===
        generation.expires_at.getTime() &&
      snapshot.relationship_status === "ACTIVE",
  );
  requireMatch(
    snapshot.payee_id === identity.payee_id &&
      snapshot.global_payee_name === identity.ens_name,
  );
  const rootFields = [
    "payee_id",
    "identity_controller",
    "identity_epoch",
    "organization_wallet_address",
    "relationship_registry_address",
    "relationship_token_id",
    "resolver_proxy_address",
    "resolver_implementation_address",
    "resolver_implementation_code_hash",
    "resolver_permission_profile_hash",
    "registry_permission_profile_hash",
    "security_root_commitment",
  ] as const;
  for (const field of rootFields) requireMatch(snapshot[field] === root[field]);
  requireMatch(
    snapshot.settlement_epoch === settlement.settlement_epoch &&
      snapshot.settlement_commitment === settlement.commitment &&
      settlement.asset_address === payment.asset_address,
  );
  requireMatch(
    snapshot.obligation_protocol_id === obligation.obligation_id &&
      snapshot.obligation_metadata_hash === obligation.metadata_hash &&
      snapshot.obligation_max_amount_base_units ===
        obligation.max_amount_base_units &&
      snapshot.obligation_valid_until.getTime() ===
        obligation.valid_until.getTime(),
  );
  requireMatch(
    snapshot.router_address === obligation.router_address &&
      snapshot.router_version === obligation.router_version &&
      snapshot.organization_wallet_address ===
        obligation.organization_wallet_address &&
      root.acceptance_verifying_contract === snapshot.router_address,
  );
  requireMatch(
    BigInt(snapshot.obligation_remaining_before_base_units) <=
      BigInt(obligation.max_amount_base_units) &&
      BigInt(snapshot.obligation_remaining_before_base_units) -
        BigInt(payment.amount_base_units) ===
        BigInt(snapshot.obligation_remaining_after_base_units),
  );
  // Reconciliation uses the verified execution time, not today's mutable projection.
  requireMatch(
    settledAt >= root.activated_at &&
      settledAt >= settlement.valid_from &&
      settledAt < generation.expires_at &&
      settledAt < obligation.valid_until,
  );
  requireMatch(!generation.ended_at || settledAt <= generation.ended_at);
  requireMatch(
    !settlement.superseded_at || settledAt <= settlement.superseded_at,
  );
}
