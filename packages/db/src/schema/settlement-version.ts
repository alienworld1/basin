import { sql } from "drizzle-orm";
import {
  text,
  integer,
  check,
  index,
  unique,
  uniqueIndex,
  foreignKey,
} from "drizzle-orm/pg-core";
import { basin, id, reference, uint, time } from "./common";
import { ApprovedPayeeGeneration } from "./approved-payee-generation";
import { ApprovedSecurityRoot } from "./approved-security-root";

export const SettlementVersion = basin.table(
  "settlement_version",
  {
    id: id(),
    approved_payee_generation_id: reference()
      .references(() => ApprovedPayeeGeneration.id, { onDelete: "restrict" })
      .notNull(),
    approved_security_root_id: reference()
      .references(() => ApprovedSecurityRoot.id, { onDelete: "restrict" })
      .notNull(),
    settlement_epoch: uint().notNull(),
    commitment: text().notNull(),
    descriptor_version: integer().notNull(),
    chain_id: integer().notNull(),
    asset_address: text().notNull(),
    destination_ciphertext: text(),
    destination_fingerprint: text(),
    valid_from: time().notNull(),
    superseded_at: time(),
    created_at: time().defaultNow().notNull(),
  },
  (t) => [
    unique().on(t.approved_payee_generation_id, t.settlement_epoch),
    unique().on(
      t.id,
      t.approved_payee_generation_id,
      t.approved_security_root_id,
    ),
    index().on(t.approved_security_root_id),
    check(
      "settlement_version_settlement_epoch_range",
      sql`${t.settlement_epoch} >= 0`,
    ),
    check(
      "settlement_version_commitment_shape",
      sql`${t.commitment} ~ '^0x[0-9a-f]{64}$'`,
    ),
    check(
      "settlement_version_descriptor_version_range",
      sql`${t.descriptor_version} > 0`,
    ),
    check("settlement_version_chain_id_range", sql`${t.chain_id} >= 0`),
    check(
      "settlement_version_asset_address_shape",
      sql`${t.asset_address} ~ '^0x[0-9a-f]{40}$'`,
    ),
    check(
      "settlement_version_destination_ciphertext_length",
      sql`length(${t.destination_ciphertext}) between 1 and 240`,
    ),
    check(
      "settlement_version_destination_fingerprint_length",
      sql`length(${t.destination_fingerprint}) between 1 and 240`,
    ),
    uniqueIndex()
      .on(t.approved_payee_generation_id)
      .where(sql`${t.superseded_at} is null`),
    foreignKey({
      columns: [t.approved_security_root_id, t.approved_payee_generation_id],
      foreignColumns: [
        ApprovedSecurityRoot.id,
        ApprovedSecurityRoot.approved_payee_generation_id,
      ],
    }).onDelete("restrict"),
    check(
      "settlement_time",
      sql`${t.superseded_at} is null or ${t.superseded_at} >= ${t.valid_from}`,
    ),
  ],
);
export type SettlementVersion = typeof SettlementVersion.$inferSelect;
export type NewSettlementVersion = typeof SettlementVersion.$inferInsert;
