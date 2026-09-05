import { sql } from "drizzle-orm";
import { text, check, index, unique, foreignKey } from "drizzle-orm/pg-core";
import {
  basin,
  id,
  reference,
  uint,
  time,
  executionPath,
  payeeStatus,
} from "./common";
import { ApprovedPayeeGeneration } from "./approved-payee-generation";
import { ApprovedSecurityRoot } from "./approved-security-root";
import { Payment } from "./payment";
import { SettlementVersion } from "./settlement-version";

export const PaymentAuthoritySnapshot = basin.table(
  "payment_authority_snapshot",
  {
    id: id(),
    payment_id: reference()
      .references(() => Payment.id, { onDelete: "restrict" })
      .notNull(),
    approved_payee_generation_id: reference()
      .references(() => ApprovedPayeeGeneration.id, { onDelete: "restrict" })
      .notNull(),
    approved_security_root_id: reference()
      .references(() => ApprovedSecurityRoot.id, { onDelete: "restrict" })
      .notNull(),
    settlement_version_id: reference()
      .references(() => SettlementVersion.id, { onDelete: "restrict" })
      .notNull(),
    relationship_name: text().notNull(),
    relationship_token_id: uint().notNull(),
    relationship_expiry: time().notNull(),
    relationship_status: payeeStatus().notNull(),
    global_payee_name: text().notNull(),
    payee_id: text().notNull(),
    identity_controller: text().notNull(),
    identity_epoch: uint().notNull(),
    relationship_registry_address: text().notNull(),
    resolver_proxy_address: text().notNull(),
    resolver_implementation_address: text().notNull(),
    resolver_implementation_code_hash: text().notNull(),
    resolver_permission_profile_hash: text().notNull(),
    registry_permission_profile_hash: text().notNull(),
    security_root_commitment: text().notNull(),
    settlement_epoch: uint().notNull(),
    settlement_commitment: text().notNull(),
    obligation_protocol_id: text().notNull(),
    obligation_metadata_hash: text().notNull(),
    obligation_max_amount_base_units: uint().notNull(),
    obligation_remaining_before_base_units: uint().notNull(),
    obligation_remaining_after_base_units: uint().notNull(),
    obligation_valid_until: time().notNull(),
    organization_wallet_address: text().notNull(),
    router_address: text().notNull(),
    router_version: text().notNull(),
    execution_path: executionPath().notNull(),
    captured_at: time().notNull(),
  },
  (t) => [
    unique().on(t.payment_id),
    unique().on(t.id, t.payment_id),
    index().on(t.approved_payee_generation_id),
    index().on(t.approved_security_root_id),
    index().on(t.settlement_version_id),
    check(
      "payment_authority_snapshot_relationship_token_id_range",
      sql`${t.relationship_token_id} >= 0`,
    ),
    check(
      "payment_authority_snapshot_payee_id_shape",
      sql`${t.payee_id} ~ '^0x[0-9a-f]{64}$'`,
    ),
    check(
      "payment_authority_snapshot_identity_controller_shape",
      sql`${t.identity_controller} ~ '^0x[0-9a-f]{40}$'`,
    ),
    check(
      "payment_authority_snapshot_identity_epoch_range",
      sql`${t.identity_epoch} >= 0`,
    ),
    check(
      "payment_authority_snapshot_relationship_registry_address_shape",
      sql`${t.relationship_registry_address} ~ '^0x[0-9a-f]{40}$'`,
    ),
    check(
      "payment_authority_snapshot_resolver_proxy_address_shape",
      sql`${t.resolver_proxy_address} ~ '^0x[0-9a-f]{40}$'`,
    ),
    check(
      "payment_authority_snapshot_resolver_implementation_address_shape",
      sql`${t.resolver_implementation_address} ~ '^0x[0-9a-f]{40}$'`,
    ),
    check(
      "payment_authority_snapshot_resolver_implementation_code_hash_shape",
      sql`${t.resolver_implementation_code_hash} ~ '^0x[0-9a-f]{64}$'`,
    ),
    check(
      "payment_authority_snapshot_resolver_permission_profile_hash_shape",
      sql`${t.resolver_permission_profile_hash} ~ '^0x[0-9a-f]{64}$'`,
    ),
    check(
      "payment_authority_snapshot_registry_permission_profile_hash_shape",
      sql`${t.registry_permission_profile_hash} ~ '^0x[0-9a-f]{64}$'`,
    ),
    check(
      "payment_authority_snapshot_security_root_commitment_shape",
      sql`${t.security_root_commitment} ~ '^0x[0-9a-f]{64}$'`,
    ),
    check(
      "payment_authority_snapshot_settlement_epoch_range",
      sql`${t.settlement_epoch} >= 0`,
    ),
    check(
      "payment_authority_snapshot_settlement_commitment_shape",
      sql`${t.settlement_commitment} ~ '^0x[0-9a-f]{64}$'`,
    ),
    check(
      "payment_authority_snapshot_obligation_protocol_id_shape",
      sql`${t.obligation_protocol_id} ~ '^0x[0-9a-f]{64}$'`,
    ),
    check(
      "payment_authority_snapshot_obligation_metadata_hash_shape",
      sql`${t.obligation_metadata_hash} ~ '^0x[0-9a-f]{64}$'`,
    ),
    check(
      "payment_authority_snapshot_obligation_max_amount_base_units_range",
      sql`${t.obligation_max_amount_base_units} > 0`,
    ),
    check(
      "payment_authority_snapshot_obligation_remaining_before_base_units_range",
      sql`${t.obligation_remaining_before_base_units} > 0`,
    ),
    check(
      "payment_authority_snapshot_obligation_remaining_after_base_units_range",
      sql`${t.obligation_remaining_after_base_units} >= 0`,
    ),
    check(
      "payment_authority_snapshot_organization_wallet_address_shape",
      sql`${t.organization_wallet_address} ~ '^0x[0-9a-f]{40}$'`,
    ),
    check(
      "payment_authority_snapshot_router_address_shape",
      sql`${t.router_address} ~ '^0x[0-9a-f]{40}$'`,
    ),
    check(
      "payment_authority_snapshot_router_version_length",
      sql`length(${t.router_version}) between 1 and 240`,
    ),
    foreignKey({
      columns: [t.approved_security_root_id, t.approved_payee_generation_id],
      foreignColumns: [
        ApprovedSecurityRoot.id,
        ApprovedSecurityRoot.approved_payee_generation_id,
      ],
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        t.settlement_version_id,
        t.approved_payee_generation_id,
        t.approved_security_root_id,
      ],
      foreignColumns: [
        SettlementVersion.id,
        SettlementVersion.approved_payee_generation_id,
        SettlementVersion.approved_security_root_id,
      ],
    }).onDelete("restrict"),
    check(
      "snapshot_capacity",
      sql`${t.obligation_remaining_before_base_units} <= ${t.obligation_max_amount_base_units} and ${t.obligation_remaining_after_base_units} < ${t.obligation_remaining_before_base_units}`,
    ),
  ],
);
export type PaymentAuthoritySnapshot =
  typeof PaymentAuthoritySnapshot.$inferSelect;
export type NewPaymentAuthoritySnapshot =
  typeof PaymentAuthoritySnapshot.$inferInsert;
