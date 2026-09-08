import { sql } from "drizzle-orm";
import { check, text } from "drizzle-orm/pg-core";
import { basin, reference, time, uint } from "./common";
import { Workspace } from "./workspace";
import { BasinIdentity } from "./basin-identity";
export const ReceivingPreference = basin.table(
  "receiving_preference",
  {
    workspace_id: reference()
      .primaryKey()
      .references(() => Workspace.id, { onDelete: "restrict" }),
    identity_id: reference()
      .notNull()
      .references(() => BasinIdentity.id, { onDelete: "restrict" }),
    destination_ciphertext: text().notNull(),
    key_version: text().notNull(),
    revision: uint().notNull(),
    created_at: time().notNull().defaultNow(),
    updated_at: time().notNull().defaultNow(),
  },
  (t) => [
    check("receiving_preference_revision", sql`${t.revision} >= 0`),
    check(
      "receiving_preference_ciphertext",
      sql`length(${t.destination_ciphertext}) between 1 and 240`,
    ),
  ],
);
