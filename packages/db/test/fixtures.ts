import { createPersistence } from "../src/index";
import type { Payment } from "../src/schema/tables";
import { fixtureEvidence as verified } from "./evidence";

export const hex = (value: number) =>
  `0x${value.toString(16).padStart(64, "0")}`;
export const address = (value: number) =>
  `0x${value.toString(16).padStart(40, "0")}`;
export const past = new Date(Date.now() - 60000);
export const future = new Date(Date.now() + 86400000);
export type Persistence = ReturnType<typeof createPersistence>;
export async function fixtureOrganization(api: Persistence, name: string) {
  const user = await api.workspaces.findOrCreateUser({
    privy_user_id: `fixture:${name}`,
    display_name: name,
  });
  const workspace = await api.workspaces.createWorkspace({
    type: "ORGANIZATION",
    display_name: name,
    owner_user_id: user.id,
  });
  const organization = await api.workspaces.createOrganization(
    user.id,
    workspace.id,
  );
  return { user, workspace, organization };
}
export async function fixtureIdentity(api: Persistence) {
  const user = await api.workspaces.findOrCreateUser({
    privy_user_id: "fixture:alice",
    display_name: "Alice",
  });
  const workspace = await api.workspaces.createWorkspace({
    type: "PERSONAL",
    display_name: "Alice",
    owner_user_id: user.id,
  });
  const identity = await api.identities.create(
    workspace.id,
    verified("identity", {
      workspace_id: workspace.id,
      payee_id: hex(1),
      label: "alice",
      ens_name: "alice.basin.eth",
      identity_epoch: "0",
      controller_address: address(1),
      resolver_address: address(2),
      protocol_status: "ACTIVE" as const,
    }),
  );
  await api.identities.appendAuthority(
    workspace.id,
    verified("identityAuthority", {
      basin_identity_id: identity.id,
      identity_epoch: "0",
      controller_address: address(1),
      identity_resolver_address: address(2),
      valid_from: past,
      evidence_block_number: "1",
    }),
  );
  return {
    user,
    workspace,
    identity: await api.identities.findByPayeeId(identity.payee_id),
  };
}
export async function fixtureRelationship(
  api: Persistence,
  org: Awaited<ReturnType<typeof fixtureOrganization>>,
  person: Awaited<ReturnType<typeof fixtureIdentity>>,
  seed: number,
  activate = true,
) {
  const relationship = await api.relationships.findOrCreate(
    org.organization.id,
    person.identity.id,
  );
  const generation = await api.relationships.appendGeneration(
    org.organization.id,
    verified("generation", {
      approved_payee_id: relationship.id,
      generation_number: 1,
      relationship_token_id: String(seed),
      registered_at: past,
      expires_at: future,
      relationship_namehash: hex(seed),
      relationship_registry_address: address(seed),
      relationship_name: `alice.${org.workspace.display_name.toLowerCase()}.basin.eth`,
    }),
  );
  const rootEvidence = verified("activation", {
    approved_payee_generation_id: generation.id,
    payee_id: person.identity.payee_id,
    identity_controller: person.identity.controller_address,
    identity_epoch: person.identity.identity_epoch,
    organization_wallet_address: address(seed + 1),
    relationship_registry_address: generation.relationship_registry_address,
    relationship_token_id: generation.relationship_token_id,
    resolver_proxy_address: address(seed + 2),
    resolver_implementation_address: address(seed + 3),
    resolver_implementation_code_hash: hex(seed + 4),
    resolver_permission_profile_hash: hex(seed + 5),
    registry_permission_profile_hash: hex(seed + 6),
    security_root_commitment: hex(seed + 7),
    acceptance_chain_id: 11155111,
    acceptance_verifying_contract: address(100),
    acceptance_message_hash: hex(seed + 8),
    acceptance_nonce: "0",
    accepted_relationship_expiry: future,
    recipient_acceptance_signature: `0x${"ab".repeat(65)}`,
    activation_transaction_hash: hex(seed + 9),
    activation_block_number: "10",
    activation_log_index: 0,
    activated_at: past,
  });
  const root = activate
    ? await api.relationships.acceptRoot(org.organization.id, rootEvidence)
    : undefined;
  return { relationship, generation, rootEvidence, root };
}
export async function fixtureEnvelope(
  api: Persistence,
  org: Awaited<ReturnType<typeof fixtureOrganization>>,
  person: Awaited<ReturnType<typeof fixtureIdentity>>,
  seed: number,
) {
  const relationship = await fixtureRelationship(api, org, person, seed);
  const root = relationship.root!;
  const settlement = await api.relationships.appendSettlement(
    org.organization.id,
    verified("settlementVersion", {
      approved_payee_generation_id: relationship.generation.id,
      approved_security_root_id: root.id,
      settlement_epoch: "0",
      commitment: hex(seed + 10),
      descriptor_version: 1,
      chain_id: 11155111,
      asset_address: address(200),
      valid_from: past,
    }),
  );
  const obligation = await api.obligations.createFromRouter(
    org.organization.id,
    verified("obligation", {
      obligation_id: hex(seed + 11),
      organization_id: org.organization.id,
      organization_wallet_address: root.organization_wallet_address,
      approved_payee_id: relationship.relationship.id,
      approved_payee_generation_id: relationship.generation.id,
      max_amount_base_units: "100",
      remaining_amount_base_units: "100",
      asset_address: address(200),
      purpose: "Design services",
      external_reference: "INV-01",
      valid_until: future,
      metadata_hash: hex(seed + 12),
      router_address: address(100),
      router_version: "1",
      status: "ACTIVE" as const,
      creation_transaction_hash: hex(seed + 13),
      creation_block_number: "11",
      creation_log_index: 0,
    }),
  );
  return { ...relationship, root, settlement, obligation, org, person };
}
export type Envelope = Awaited<ReturnType<typeof fixtureEnvelope>>;
export function paymentRequest(envelope: Envelope, key: string, amount = "60") {
  return {
    key,
    obligation_record_id: envelope.obligation.id,
    approved_payee_id: envelope.relationship.id,
    approved_payee_generation_id: envelope.generation.id,
    amount_base_units: amount,
    asset_address: envelope.obligation.asset_address,
    purpose: envelope.obligation.purpose,
    external_reference: envelope.obligation.external_reference,
  };
}
export async function executing(
  api: Persistence,
  organizationId: bigint,
  payment: Payment,
) {
  await api.payments.transition(organizationId, {
    payment_id: payment.id,
    expected_status: "DRAFT",
    to_status: "VALIDATING_AUTHORITY",
  });
  await api.payments.transition(organizationId, {
    payment_id: payment.id,
    expected_status: "VALIDATING_AUTHORITY",
    to_status: "READY",
  });
  return api.payments.beginExecution(
    organizationId,
    verified("execution", {
      payment_id: payment.id,
      execution_path: "ROUTINE_SIGNER" as const,
    }),
  );
}
export function settlementEvidence(
  envelope: Envelope,
  payment: Payment,
  before = "100",
  transaction = 900,
) {
  const { root, generation, person, settlement, obligation } = envelope;
  const snapshot = {
    payment_id: payment.id,
    approved_payee_generation_id: generation.id,
    approved_security_root_id: root.id,
    settlement_version_id: settlement.id,
    relationship_name: `alice.${envelope.org.workspace.display_name.toLowerCase()}.basin.eth`,
    relationship_token_id: generation.relationship_token_id,
    relationship_expiry: generation.expires_at,
    relationship_status: "ACTIVE" as const,
    global_payee_name: person.identity.ens_name,
    payee_id: root.payee_id,
    identity_controller: root.identity_controller,
    identity_epoch: root.identity_epoch,
    relationship_registry_address: root.relationship_registry_address,
    resolver_proxy_address: root.resolver_proxy_address,
    resolver_implementation_address: root.resolver_implementation_address,
    resolver_implementation_code_hash: root.resolver_implementation_code_hash,
    resolver_permission_profile_hash: root.resolver_permission_profile_hash,
    registry_permission_profile_hash: root.registry_permission_profile_hash,
    security_root_commitment: root.security_root_commitment,
    settlement_epoch: settlement.settlement_epoch,
    settlement_commitment: settlement.commitment,
    obligation_protocol_id: obligation.obligation_id,
    obligation_metadata_hash: obligation.metadata_hash,
    obligation_max_amount_base_units: obligation.max_amount_base_units,
    obligation_remaining_before_base_units: before,
    obligation_remaining_after_base_units: (
      BigInt(before) - BigInt(payment.amount_base_units)
    ).toString(),
    obligation_valid_until: obligation.valid_until,
    organization_wallet_address: root.organization_wallet_address,
    router_address: obligation.router_address,
    router_version: obligation.router_version,
    execution_path: "ROUTINE_SIGNER" as const,
    captured_at: new Date(),
  };
  return verified("settlement", {
    payment_id: payment.id,
    snapshot,
    transaction_hash: hex(transaction),
    block_number: "20",
    settled_at: new Date(),
    chain_id: 11155111,
    payer_organization_name: envelope.org.workspace.display_name,
    payee_display_name: "Alice",
    asset_symbol: "USDC",
  });
}
