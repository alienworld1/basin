import { z } from "zod";
import { createInsertSchema } from "drizzle-zod";
import {
  recordId,
  address,
  hash,
  signature,
  chainInteger,
  amount,
  ensName,
  displayName,
  purpose,
  externalReference,
} from "@basin/domain";
import * as t from "./schema/tables";

export const userInput = createInsertSchema(t.User, {
  privy_user_id: z.string().trim().min(1).max(240),
  display_name: displayName.nullish(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
})
  .omit({ created_at: true, updated_at: true })
  .strict();

export const workspaceInput = createInsertSchema(t.Workspace, {
  display_name: displayName,
  owner_user_id: recordId,
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
})
  .omit({ created_at: true, updated_at: true })
  .strict();

export const organizationInput = createInsertSchema(t.Organization, {
  workspace_id: recordId,
  privy_organization_id: z.string().trim().min(1).max(240).nullish(),
  basin_identity_id: recordId.nullish(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
})
  .omit({ created_at: true, updated_at: true })
  .strict();

export const organizationMemberInput = createInsertSchema(
  t.OrganizationMember,
  {
    organization_id: recordId,
    user_id: recordId,
    created_at: z.date().optional(),
    updated_at: z.date().optional(),
  },
)
  .omit({
    status: true,
    activated_at: true,
    removed_at: true,
    removed_by_user_id: true,
    left_at: true,
    created_at: true,
    updated_at: true,
  })
  .strict();

export const basinIdentityInput = createInsertSchema(t.BasinIdentity, {
  workspace_id: recordId,
  payee_id: hash,
  label: ensName,
  ens_name: ensName,
  identity_epoch: chainInteger,
  controller_address: address,
  resolver_address: address,
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
})
  .omit({ created_at: true, updated_at: true })
  .strict();

export const identityAuthorityVersionInput = createInsertSchema(
  t.IdentityAuthorityVersion,
  {
    basin_identity_id: recordId,
    identity_epoch: chainInteger,
    controller_address: address,
    identity_resolver_address: address,
    valid_from: z.date(),
    superseded_at: z.date().nullish(),
    evidence_transaction_hash: hash.nullish(),
    evidence_block_number: chainInteger,
    created_at: z.date().optional(),
  },
)
  .omit({ created_at: true })
  .strict();

export const approvedPayeeInput = createInsertSchema(t.ApprovedPayee, {
  organization_id: recordId,
  basin_identity_id: recordId,
  relationship_name: ensName.nullish(),
  expires_at: z.date().nullish(),
  revoked_at: z.date().nullish(),
  revocation_cause: z.string().trim().min(1).max(240).nullish(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
})
  .omit({ created_at: true, updated_at: true })
  .strict();

export const approvedPayeeGenerationInput = createInsertSchema(
  t.ApprovedPayeeGeneration,
  {
    approved_payee_id: recordId,
    relationship_token_id: chainInteger,
    generation_number: z.number().int().positive().max(2147483647),
    registered_at: z.date(),
    expires_at: z.date(),
    ended_at: z.date().nullish(),
    relationship_namehash: hash,
    relationship_registry_address: address,
    created_at: z.date().optional(),
  },
)
  .omit({ created_at: true })
  .strict();

export const approvedSecurityRootInput = createInsertSchema(
  t.ApprovedSecurityRoot,
  {
    approved_payee_generation_id: recordId,
    payee_id: hash,
    identity_controller: address,
    identity_epoch: chainInteger,
    organization_wallet_address: address,
    relationship_registry_address: address,
    relationship_token_id: chainInteger,
    resolver_proxy_address: address,
    resolver_implementation_address: address,
    resolver_implementation_code_hash: hash,
    resolver_permission_profile_hash: hash,
    registry_permission_profile_hash: hash,
    security_root_commitment: hash,
    acceptance_chain_id: z.number().int().nonnegative().max(2147483647),
    acceptance_verifying_contract: address,
    acceptance_message_hash: hash,
    acceptance_nonce: chainInteger,
    accepted_relationship_expiry: z.date(),
    recipient_acceptance_signature: signature,
    activation_transaction_hash: hash,
    activation_block_number: chainInteger,
    activation_log_index: z.number().int().nonnegative().max(2147483647),
    activated_at: z.date(),
    created_at: z.date().optional(),
  },
)
  .omit({ created_at: true })
  .strict();

export const settlementVersionInput = createInsertSchema(t.SettlementVersion, {
  approved_payee_generation_id: recordId,
  approved_security_root_id: recordId,
  settlement_epoch: chainInteger,
  commitment: hash,
  descriptor_version: z.number().int().positive().max(2147483647),
  chain_id: z.number().int().nonnegative().max(2147483647),
  asset_address: address,
  destination_ciphertext: z.string().trim().min(1).max(240).nullish(),
  destination_fingerprint: z.string().trim().min(1).max(240).nullish(),
  valid_from: z.date(),
  superseded_at: z.date().nullish(),
  created_at: z.date().optional(),
})
  .omit({ created_at: true })
  .strict();

export const obligationInput = createInsertSchema(t.Obligation, {
  obligation_id: hash,
  organization_id: recordId,
  organization_wallet_address: address,
  approved_payee_id: recordId,
  approved_payee_generation_id: recordId,
  max_amount_base_units: amount,
  remaining_amount_base_units: chainInteger,
  asset_address: address,
  purpose: purpose,
  external_reference: externalReference.nullish(),
  expected_at: z.date().nullish(),
  valid_until: z.date(),
  metadata_hash: hash,
  router_address: address,
  router_version: z.string().trim().min(1).max(240),
  creation_transaction_hash: hash.nullish(),
  creation_block_number: chainInteger.nullish(),
  creation_log_index: z.number().int().nonnegative().max(2147483647).nullish(),
  created_by_member_id: recordId.nullish(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
})
  .omit({ created_at: true, updated_at: true })
  .strict();

export const expectedPaymentInput = createInsertSchema(t.ExpectedPayment, {
  organization_id: recordId,
  approved_payee_id: recordId,
  approved_payee_generation_id: recordId,
  amount_base_units: amount,
  asset_address: address,
  purpose,
  external_reference: externalReference.nullish(),
  obligation_record_id: recordId.nullish(),
  payment_record_id: recordId.nullish(),
  created_by_member_id: recordId,
  cancelled_by_member_id: recordId.nullish(),
  cancelled_at: z.date().nullish(),
  satisfied_at: z.date().nullish(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
})
  .omit({
    status: true,
    status_reason_code: true,
    obligation_record_id: true,
    payment_record_id: true,
    cancelled_by_member_id: true,
    cancelled_at: true,
    satisfied_at: true,
    created_at: true,
    updated_at: true,
  })
  .strict();

export const paymentInput = createInsertSchema(t.Payment, {
  payment_id: hash,
  organization_id: recordId,
  approved_payee_id: recordId,
  approved_payee_generation_id: recordId,
  obligation_record_id: recordId,
  amount_base_units: amount,
  asset_address: address,
  purpose: purpose,
  external_reference: externalReference.nullish(),
  blocked_reason: z.string().trim().min(1).max(240).nullish(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
  settled_at: z.date().nullish(),
})
  .omit({ created_at: true, updated_at: true })
  .strict();

export const paymentEventInput = createInsertSchema(t.PaymentEvent, {
  payment_id: recordId,
  sequence: z.number().int().positive().max(2147483647),
  reason_code: z.string().trim().min(1).max(240).nullish(),
  safe_metadata: z
    .strictObject({
      transaction_hash: hash.optional(),
      block_number: chainInteger.optional(),
    })
    .nullish(),
  occurred_at: z.date(),
  created_at: z.date().optional(),
})
  .omit({ created_at: true })
  .strict();

export const paymentAuthoritySnapshotInput = createInsertSchema(
  t.PaymentAuthoritySnapshot,
  {
    payment_id: recordId,
    approved_payee_generation_id: recordId,
    approved_security_root_id: recordId,
    settlement_version_id: recordId,
    relationship_name: ensName,
    relationship_token_id: chainInteger,
    relationship_expiry: z.date(),
    global_payee_name: ensName,
    payee_id: hash,
    identity_controller: address,
    identity_epoch: chainInteger,
    relationship_registry_address: address,
    resolver_proxy_address: address,
    resolver_implementation_address: address,
    resolver_implementation_code_hash: hash,
    resolver_permission_profile_hash: hash,
    registry_permission_profile_hash: hash,
    security_root_commitment: hash,
    settlement_epoch: chainInteger,
    settlement_commitment: hash,
    obligation_protocol_id: hash,
    obligation_metadata_hash: hash,
    obligation_max_amount_base_units: amount,
    obligation_remaining_before_base_units: amount,
    obligation_remaining_after_base_units: chainInteger,
    obligation_valid_until: z.date(),
    organization_wallet_address: address,
    router_address: address,
    router_version: z.string().trim().min(1).max(240),
    captured_at: z.date(),
  },
)
  .omit({})
  .strict();

export const receiptInput = createInsertSchema(t.Receipt, {
  payment_id: recordId,
  authority_snapshot_id: recordId,
  payer_organization_name: displayName,
  payee_display_name: displayName,
  amount_base_units: amount,
  asset_address: address,
  asset_symbol: z.string().trim().min(1).max(240),
  purpose: purpose,
  external_reference: externalReference.nullish(),
  obligation_protocol_id: hash,
  obligation_metadata_hash: hash,
  security_root_commitment: hash,
  transaction_hash: hash,
  chain_id: z.number().int().nonnegative().max(2147483647),
  router_address: address,
  router_version: z.string().trim().min(1).max(240),
  settled_at: z.date(),
  created_at: z.date().optional(),
})
  .omit({ created_at: true })
  .strict();

export const idempotencyKeyInput = createInsertSchema(t.IdempotencyKey, {
  organization_id: recordId,
  key: z.string().trim().min(1).max(240),
  request_hash: hash,
  payment_id: recordId.nullish(),
  expires_at: z.date().nullish(),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
})
  .omit({ created_at: true, updated_at: true })
  .strict();
