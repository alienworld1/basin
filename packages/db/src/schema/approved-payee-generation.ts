import { sql } from "drizzle-orm";
import { text, integer, check, unique, uniqueIndex } from "drizzle-orm/pg-core";
import { basin, id, reference, uint, time, endReason } from "./common";
import { ApprovedPayee } from "./approved-payee";

export const ApprovedPayeeGeneration = basin.table(
  "approved_payee_generation",
  {
    id: id(),
    approved_payee_id: reference()
      .references(() => ApprovedPayee.id, { onDelete: "restrict" })
      .notNull(),
    relationship_token_id: uint().notNull(),
    generation_number: integer().notNull(),
    registered_at: time().notNull(),
    expires_at: time().notNull(),
    ended_at: time(),
    end_reason: endReason(),
    relationship_namehash: text().notNull(),
    relationship_registry_address: text().notNull(),
    created_at: time().defaultNow().notNull(),
  },
  (t) => [
    unique().on(t.approved_payee_id, t.relationship_token_id),
    unique().on(t.approved_payee_id, t.generation_number),
    unique().on(t.id, t.approved_payee_id),
    check(
      "approved_payee_generation_relationship_token_id_range",
      sql`${t.relationship_token_id} >= 0`,
    ),
    check(
      "approved_payee_generation_generation_number_range",
      sql`${t.generation_number} > 0`,
    ),
    check(
      "approved_payee_generation_relationship_namehash_shape",
      sql`${t.relationship_namehash} ~ '^0x[0-9a-f]{64}$'`,
    ),
    check(
      "approved_payee_generation_relationship_registry_address_shape",
      sql`${t.relationship_registry_address} ~ '^0x[0-9a-f]{40}$'`,
    ),
    uniqueIndex()
      .on(t.approved_payee_id)
      .where(sql`${t.ended_at} is null`),
    check(
      "generation_ending",
      sql`(${t.ended_at} is null) = (${t.end_reason} is null)`,
    ),
    check("generation_expiry", sql`${t.expires_at} > ${t.registered_at}`),
  ],
);
export type ApprovedPayeeGeneration =
  typeof ApprovedPayeeGeneration.$inferSelect;
export type NewApprovedPayeeGeneration =
  typeof ApprovedPayeeGeneration.$inferInsert;
