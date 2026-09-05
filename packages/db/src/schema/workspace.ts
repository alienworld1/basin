import { sql } from "drizzle-orm";
import { text, check, index } from "drizzle-orm/pg-core";
import { basin, id, reference, time, workspaceType } from "./common";
import { User } from "./user";

export const Workspace = basin.table(
  "workspace",
  {
    id: id(),
    type: workspaceType().notNull(),
    display_name: text().notNull(),
    owner_user_id: reference()
      .references(() => User.id, { onDelete: "restrict" })
      .notNull(),
    created_at: time().defaultNow().notNull(),
    updated_at: time().defaultNow().notNull(),
  },
  (t) => [
    index().on(t.owner_user_id),
    check(
      "workspace_display_name_length",
      sql`length(${t.display_name}) <= 120 and length(btrim(${t.display_name})) > 0`,
    ),
  ],
);
export type Workspace = typeof Workspace.$inferSelect;
export type NewWorkspace = typeof Workspace.$inferInsert;
