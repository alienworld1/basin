import { sql } from "drizzle-orm";
import { check, text, unique, uniqueIndex } from "drizzle-orm/pg-core";
import { basin, id, reference, time, uint } from "./common";
import { Workspace } from "./workspace";
import { BasinIdentity } from "./basin-identity";
import { ApprovedPayee } from "./approved-payee";
export const settlementOperationStatus = basin.enum(
  "settlement_operation_status",
  [
    "PREPARED",
    "SUBMITTED",
    "VERIFYING",
    "CONFIRMED",
    "FAILED",
    "UNKNOWN",
    "NEEDS_REVIEW",
  ],
);
export const SettlementOperation = basin.table(
  "settlement_operation",
  {
    id: id(),
    workspace_id: reference()
      .notNull()
      .references(() => Workspace.id, { onDelete: "restrict" }),
    identity_id: reference()
      .notNull()
      .references(() => BasinIdentity.id, { onDelete: "restrict" }),
    relationship_id: reference()
      .notNull()
      .references(() => ApprovedPayee.id, { onDelete: "restrict" }),
    relationship_token_id: uint().notNull(),
    identity_epoch: uint().notNull(),
    resolver: text().notNull(),
    profile_digest: text().notNull(),
    accepted_root_digest: text(),
    expected_record: text().notNull(),
    target_epoch: uint().notNull(),
    commitment: text().notNull(),
    descriptor_ciphertext: text().notNull(),
    key_version: text().notNull(),
    idempotency_key: text().notNull(),
    request_digest: text().notNull(),
    prepared_block: uint().notNull(),
    prepared_expiry: time().notNull(),
    status: settlementOperationStatus().notNull().default("PREPARED"),
    transaction_hash: text(),
    receipt_block_number: uint(),
    receipt_block_hash: text(),
    verified_at: time(),
    error_code: text(),
    created_at: time().notNull().defaultNow(),
    updated_at: time().notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.workspace_id, t.idempotency_key),
    uniqueIndex("settlement_operation_unresolved")
      .on(t.relationship_id)
      .where(sql`${t.status} not in ('CONFIRMED', 'FAILED')`),
    check(
      "settlement_operation_epochs",
      sql`${t.target_epoch} >= 0 and ${t.identity_epoch} >= 0 and ${t.relationship_token_id} >= 0`,
    ),
    check(
      "settlement_operation_hashes",
      sql`${t.commitment} ~ '^0x[0-9a-f]{64}$' and ${t.profile_digest} ~ '^0x[0-9a-f]{64}$' and ${t.request_digest} ~ '^0x[0-9a-f]{64}$'`,
    ),
    check(
      "settlement_operation_evidence",
      sql`${t.status} <> 'CONFIRMED' or (${t.transaction_hash} is not null and ${t.receipt_block_number} is not null and ${t.receipt_block_hash} is not null and ${t.verified_at} is not null)`,
    ),
  ],
);
export type SettlementOperation = typeof SettlementOperation.$inferSelect;
