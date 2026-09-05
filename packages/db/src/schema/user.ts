import { sql } from "drizzle-orm";
import { text, check, unique } from "drizzle-orm/pg-core";
import { basin, id, time } from "./common";

export const User = basin.table(
  "user",
  {
    id: id(),
    privy_user_id: text().notNull(),
    display_name: text(),
    created_at: time().defaultNow().notNull(),
    updated_at: time().defaultNow().notNull(),
  },
  (t) => [
    unique().on(t.privy_user_id),
    check(
      "user_privy_user_id_length",
      sql`length(${t.privy_user_id}) between 1 and 240`,
    ),
    check(
      "user_display_name_length",
      sql`length(${t.display_name}) <= 120 and length(btrim(${t.display_name})) > 0`,
    ),
  ],
);
export type User = typeof User.$inferSelect;
export type NewUser = typeof User.$inferInsert;
