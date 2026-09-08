import { sql } from "drizzle-orm";
import { check, text, unique } from "drizzle-orm/pg-core";
import { basin, id, reference, time } from "./common";
import { Organization } from "./organization";

export const RoutineSignerSecret = basin.table("routine_signer_secret", {
  id: id(),
  organization_id: reference().references(() => Organization.id, { onDelete: "restrict" }).notNull(),
  public_key: text().notNull(),
  public_key_fingerprint: text().notNull(),
  ciphertext: text().notNull(),
  iv: text().notNull(),
  auth_tag: text().notNull(),
  key_version: text().notNull(),
  created_at: time().defaultNow().notNull(),
  updated_at: time().defaultNow().notNull(),
}, (t) => [
  unique().on(t.organization_id),
  unique().on(t.public_key_fingerprint),
  check("routine_signer_public_fingerprint", sql`${t.public_key_fingerprint} ~ '^0x[0-9a-f]{64}$'`),
]);
export type RoutineSignerSecret = typeof RoutineSignerSecret.$inferSelect;
