import { sql } from "drizzle-orm";
import {
  text,
  integer,
  check,
  index,
  unique,
  foreignKey,
} from "drizzle-orm/pg-core";
import { basin, id, reference, uint, time, obligationStatus } from "./common";
import { ApprovedPayee } from "./approved-payee";
import { ApprovedPayeeGeneration } from "./approved-payee-generation";
import { Organization } from "./organization";
import { OrganizationMember } from "./organization-member";

export const Obligation = basin.table(
  "obligation",
  {
    id: id(),
    obligation_id: text().notNull(),
    organization_id: reference()
      .references(() => Organization.id, { onDelete: "restrict" })
      .notNull(),
    organization_wallet_address: text().notNull(),
    approved_payee_id: reference()
      .references(() => ApprovedPayee.id, { onDelete: "restrict" })
      .notNull(),
    approved_payee_generation_id: reference()
      .references(() => ApprovedPayeeGeneration.id, { onDelete: "restrict" })
      .notNull(),
    max_amount_base_units: uint().notNull(),
    remaining_amount_base_units: uint().notNull(),
    asset_address: text().notNull(),
    purpose: text().notNull(),
    external_reference: text(),
    expected_at: time(),
    valid_until: time().notNull(),
    metadata_hash: text().notNull(),
    router_address: text().notNull(),
    router_version: text().notNull(),
    status: obligationStatus().notNull(),
    creation_transaction_hash: text(),
    creation_block_number: uint(),
    creation_log_index: integer(),
    created_by_member_id: reference().references(() => OrganizationMember.id, {
      onDelete: "restrict",
    }),
    created_at: time().defaultNow().notNull(),
    updated_at: time().defaultNow().notNull(),
  },
  (t) => [
    unique().on(t.obligation_id),
    unique().on(
      t.id,
      t.organization_id,
      t.approved_payee_id,
      t.approved_payee_generation_id,
    ),
    index().on(t.organization_id),
    index().on(t.approved_payee_id),
    index().on(t.approved_payee_generation_id),
    index().on(t.created_by_member_id),
    check(
      "obligation_obligation_id_shape",
      sql`${t.obligation_id} ~ '^0x[0-9a-f]{64}$'`,
    ),
    check(
      "obligation_organization_wallet_address_shape",
      sql`${t.organization_wallet_address} ~ '^0x[0-9a-f]{40}$'`,
    ),
    check(
      "obligation_max_amount_base_units_range",
      sql`${t.max_amount_base_units} > 0`,
    ),
    check(
      "obligation_remaining_amount_base_units_range",
      sql`${t.remaining_amount_base_units} >= 0`,
    ),
    check(
      "obligation_asset_address_shape",
      sql`${t.asset_address} ~ '^0x[0-9a-f]{40}$'`,
    ),
    check(
      "obligation_purpose_length",
      sql`length(${t.purpose}) <= 240 and length(btrim(${t.purpose})) > 0`,
    ),
    check(
      "obligation_external_reference_length",
      sql`length(${t.external_reference}) <= 160`,
    ),
    check(
      "obligation_metadata_hash_shape",
      sql`${t.metadata_hash} ~ '^0x[0-9a-f]{64}$'`,
    ),
    check(
      "obligation_router_address_shape",
      sql`${t.router_address} ~ '^0x[0-9a-f]{40}$'`,
    ),
    check(
      "obligation_router_version_length",
      sql`length(${t.router_version}) between 1 and 240`,
    ),
    check(
      "obligation_creation_transaction_hash_shape",
      sql`${t.creation_transaction_hash} ~ '^0x[0-9a-f]{64}$'`,
    ),
    check(
      "obligation_creation_block_number_range",
      sql`${t.creation_block_number} >= 0`,
    ),
    check(
      "obligation_creation_log_index_range",
      sql`${t.creation_log_index} >= 0`,
    ),
    foreignKey({
      columns: [t.approved_payee_id, t.organization_id],
      foreignColumns: [ApprovedPayee.id, ApprovedPayee.organization_id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.approved_payee_generation_id, t.approved_payee_id],
      foreignColumns: [
        ApprovedPayeeGeneration.id,
        ApprovedPayeeGeneration.approved_payee_id,
      ],
    }).onDelete("restrict"),
    check(
      "obligation_capacity",
      sql`${t.remaining_amount_base_units} <= ${t.max_amount_base_units} and (${t.status} != 'CONSUMED' or ${t.remaining_amount_base_units} = 0) and (${t.status} != 'ACTIVE' or (${t.remaining_amount_base_units} > 0 and ${t.creation_transaction_hash} is not null and ${t.creation_block_number} is not null and ${t.creation_log_index} is not null))`,
    ),
    index().on(t.organization_id, t.status, t.valid_until),
  ],
);
export type Obligation = typeof Obligation.$inferSelect;
export type NewObligation = typeof Obligation.$inferInsert;
