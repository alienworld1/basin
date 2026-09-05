import { sql } from "drizzle-orm";
import { text, integer, check, unique } from "drizzle-orm/pg-core";
import { basin, id, reference, uint, time } from "./common";
import { ApprovedPayeeGeneration } from "./approved-payee-generation";

export const ApprovedSecurityRoot = basin.table(
  "approved_security_root",
  {
    id: id(),
    approved_payee_generation_id: reference()
      .references(() => ApprovedPayeeGeneration.id, { onDelete: "restrict" })
      .notNull(),
    payee_id: text().notNull(),
    identity_controller: text().notNull(),
    identity_epoch: uint().notNull(),
    organization_wallet_address: text().notNull(),
    relationship_registry_address: text().notNull(),
    relationship_token_id: uint().notNull(),
    resolver_proxy_address: text().notNull(),
    resolver_implementation_address: text().notNull(),
    resolver_implementation_code_hash: text().notNull(),
    resolver_permission_profile_hash: text().notNull(),
    registry_permission_profile_hash: text().notNull(),
    security_root_commitment: text().notNull(),
    acceptance_chain_id: integer().notNull(),
    acceptance_verifying_contract: text().notNull(),
    acceptance_message_hash: text().notNull(),
    acceptance_nonce: uint().notNull(),
    accepted_relationship_expiry: time().notNull(),
    recipient_acceptance_signature: text().notNull(),
    activation_transaction_hash: text().notNull(),
    activation_block_number: uint().notNull(),
    activation_log_index: integer().notNull(),
    activated_at: time().notNull(),
    created_at: time().defaultNow().notNull(),
  },
  (t) => [
    unique().on(t.approved_payee_generation_id),
    unique().on(t.approved_payee_generation_id, t.security_root_commitment),
    unique().on(t.activation_transaction_hash, t.activation_log_index),
    unique().on(t.id, t.approved_payee_generation_id),
    check(
      "approved_security_root_payee_id_shape",
      sql`${t.payee_id} ~ '^0x[0-9a-f]{64}$'`,
    ),
    check(
      "approved_security_root_identity_controller_shape",
      sql`${t.identity_controller} ~ '^0x[0-9a-f]{40}$'`,
    ),
    check(
      "approved_security_root_identity_epoch_range",
      sql`${t.identity_epoch} >= 0`,
    ),
    check(
      "approved_security_root_organization_wallet_address_shape",
      sql`${t.organization_wallet_address} ~ '^0x[0-9a-f]{40}$'`,
    ),
    check(
      "approved_security_root_relationship_registry_address_shape",
      sql`${t.relationship_registry_address} ~ '^0x[0-9a-f]{40}$'`,
    ),
    check(
      "approved_security_root_relationship_token_id_range",
      sql`${t.relationship_token_id} >= 0`,
    ),
    check(
      "approved_security_root_resolver_proxy_address_shape",
      sql`${t.resolver_proxy_address} ~ '^0x[0-9a-f]{40}$'`,
    ),
    check(
      "approved_security_root_resolver_implementation_address_shape",
      sql`${t.resolver_implementation_address} ~ '^0x[0-9a-f]{40}$'`,
    ),
    check(
      "approved_security_root_resolver_implementation_code_hash_shape",
      sql`${t.resolver_implementation_code_hash} ~ '^0x[0-9a-f]{64}$'`,
    ),
    check(
      "approved_security_root_resolver_permission_profile_hash_shape",
      sql`${t.resolver_permission_profile_hash} ~ '^0x[0-9a-f]{64}$'`,
    ),
    check(
      "approved_security_root_registry_permission_profile_hash_shape",
      sql`${t.registry_permission_profile_hash} ~ '^0x[0-9a-f]{64}$'`,
    ),
    check(
      "approved_security_root_security_root_commitment_shape",
      sql`${t.security_root_commitment} ~ '^0x[0-9a-f]{64}$'`,
    ),
    check(
      "approved_security_root_acceptance_chain_id_range",
      sql`${t.acceptance_chain_id} >= 0`,
    ),
    check(
      "approved_security_root_acceptance_verifying_contract_shape",
      sql`${t.acceptance_verifying_contract} ~ '^0x[0-9a-f]{40}$'`,
    ),
    check(
      "approved_security_root_acceptance_message_hash_shape",
      sql`${t.acceptance_message_hash} ~ '^0x[0-9a-f]{64}$'`,
    ),
    check(
      "approved_security_root_acceptance_nonce_range",
      sql`${t.acceptance_nonce} >= 0`,
    ),
    check(
      "approved_security_root_recipient_acceptance_signature_shape",
      sql`${t.recipient_acceptance_signature} ~ '^0x([0-9a-f]{128}|[0-9a-f]{130})$'`,
    ),
    check(
      "approved_security_root_activation_transaction_hash_shape",
      sql`${t.activation_transaction_hash} ~ '^0x[0-9a-f]{64}$'`,
    ),
    check(
      "approved_security_root_activation_block_number_range",
      sql`${t.activation_block_number} >= 0`,
    ),
    check(
      "approved_security_root_activation_log_index_range",
      sql`${t.activation_log_index} >= 0`,
    ),
  ],
);
export type ApprovedSecurityRoot = typeof ApprovedSecurityRoot.$inferSelect;
export type NewApprovedSecurityRoot = typeof ApprovedSecurityRoot.$inferInsert;
