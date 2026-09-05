import { sql } from "drizzle-orm";
import { text, check, unique, uniqueIndex } from "drizzle-orm/pg-core";
import { basin, id, reference, uint, time } from "./common";
import { BasinIdentity } from "./basin-identity";

export const IdentityAuthorityVersion = basin.table(
  "identity_authority_version",
  {
    id: id(),
    basin_identity_id: reference()
      .references(() => BasinIdentity.id, { onDelete: "restrict" })
      .notNull(),
    identity_epoch: uint().notNull(),
    controller_address: text().notNull(),
    identity_resolver_address: text().notNull(),
    valid_from: time().notNull(),
    superseded_at: time(),
    evidence_transaction_hash: text(),
    evidence_block_number: uint().notNull(),
    created_at: time().defaultNow().notNull(),
  },
  (t) => [
    unique().on(t.basin_identity_id, t.identity_epoch),
    check(
      "identity_authority_version_identity_epoch_range",
      sql`${t.identity_epoch} >= 0`,
    ),
    check(
      "identity_authority_version_controller_address_shape",
      sql`${t.controller_address} ~ '^0x[0-9a-f]{40}$'`,
    ),
    check(
      "identity_authority_version_identity_resolver_address_shape",
      sql`${t.identity_resolver_address} ~ '^0x[0-9a-f]{40}$'`,
    ),
    check(
      "identity_authority_version_evidence_transaction_hash_shape",
      sql`${t.evidence_transaction_hash} ~ '^0x[0-9a-f]{64}$'`,
    ),
    check(
      "identity_authority_version_evidence_block_number_range",
      sql`${t.evidence_block_number} >= 0`,
    ),
    uniqueIndex()
      .on(t.basin_identity_id)
      .where(sql`${t.superseded_at} is null`),
    check(
      "identity_version_time",
      sql`${t.superseded_at} is null or ${t.superseded_at} >= ${t.valid_from}`,
    ),
  ],
);
export type IdentityAuthorityVersion =
  typeof IdentityAuthorityVersion.$inferSelect;
export type NewIdentityAuthorityVersion =
  typeof IdentityAuthorityVersion.$inferInsert;
