import { sql } from "drizzle-orm";
import { text, integer, check, unique, foreignKey } from "drizzle-orm/pg-core";
import { basin, id, reference, uint, time } from "./common";
import { Payment } from "./payment";
import { PaymentAuthoritySnapshot } from "./payment-authority-snapshot";

export const Receipt = basin.table(
  "receipt",
  {
    id: id(),
    payment_id: reference()
      .references(() => Payment.id, { onDelete: "restrict" })
      .notNull(),
    authority_snapshot_id: reference()
      .references(() => PaymentAuthoritySnapshot.id, { onDelete: "restrict" })
      .notNull(),
    payer_organization_name: text().notNull(),
    payee_display_name: text().notNull(),
    amount_base_units: uint().notNull(),
    asset_address: text().notNull(),
    asset_symbol: text().notNull(),
    purpose: text().notNull(),
    external_reference: text(),
    obligation_protocol_id: text().notNull(),
    obligation_metadata_hash: text().notNull(),
    security_root_commitment: text().notNull(),
    transaction_hash: text().notNull(),
    chain_id: integer().notNull(),
    router_address: text().notNull(),
    router_version: text().notNull(),
    settled_at: time().notNull(),
    created_at: time().defaultNow().notNull(),
  },
  (t) => [
    unique().on(t.payment_id),
    unique().on(t.authority_snapshot_id),
    check(
      "receipt_payer_organization_name_length",
      sql`length(${t.payer_organization_name}) <= 120 and length(btrim(${t.payer_organization_name})) > 0`,
    ),
    check(
      "receipt_payee_display_name_length",
      sql`length(${t.payee_display_name}) <= 120 and length(btrim(${t.payee_display_name})) > 0`,
    ),
    check("receipt_amount_base_units_range", sql`${t.amount_base_units} > 0`),
    check(
      "receipt_asset_address_shape",
      sql`${t.asset_address} ~ '^0x[0-9a-f]{40}$'`,
    ),
    check(
      "receipt_asset_symbol_length",
      sql`length(${t.asset_symbol}) between 1 and 240`,
    ),
    check(
      "receipt_purpose_length",
      sql`length(${t.purpose}) <= 240 and length(btrim(${t.purpose})) > 0`,
    ),
    check(
      "receipt_external_reference_length",
      sql`length(${t.external_reference}) <= 160`,
    ),
    check(
      "receipt_obligation_protocol_id_shape",
      sql`${t.obligation_protocol_id} ~ '^0x[0-9a-f]{64}$'`,
    ),
    check(
      "receipt_obligation_metadata_hash_shape",
      sql`${t.obligation_metadata_hash} ~ '^0x[0-9a-f]{64}$'`,
    ),
    check(
      "receipt_security_root_commitment_shape",
      sql`${t.security_root_commitment} ~ '^0x[0-9a-f]{64}$'`,
    ),
    check(
      "receipt_transaction_hash_shape",
      sql`${t.transaction_hash} ~ '^0x[0-9a-f]{64}$'`,
    ),
    check("receipt_chain_id_range", sql`${t.chain_id} >= 0`),
    check(
      "receipt_router_address_shape",
      sql`${t.router_address} ~ '^0x[0-9a-f]{40}$'`,
    ),
    check(
      "receipt_router_version_length",
      sql`length(${t.router_version}) between 1 and 240`,
    ),
    foreignKey({
      columns: [t.authority_snapshot_id, t.payment_id],
      foreignColumns: [
        PaymentAuthoritySnapshot.id,
        PaymentAuthoritySnapshot.payment_id,
      ],
    }).onDelete("restrict"),
  ],
);
export type Receipt = typeof Receipt.$inferSelect;
export type NewReceipt = typeof Receipt.$inferInsert;
