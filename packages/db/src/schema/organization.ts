import { sql } from "drizzle-orm";
import { text, check, unique } from "drizzle-orm/pg-core";
import { basin, id, reference, time } from "./common";
import { BasinIdentity } from "./basin-identity";
import { Workspace } from "./workspace";

export const Organization = basin.table(
  "organization",
  {
    id: id(),
    workspace_id: reference()
      .references(() => Workspace.id, { onDelete: "restrict" })
      .notNull(),
    privy_organization_id: text(),
    basin_identity_id: reference().references(() => BasinIdentity.id, {
      onDelete: "restrict",
    }),
    created_at: time().defaultNow().notNull(),
    updated_at: time().defaultNow().notNull(),
  },
  (t) => [
    unique().on(t.workspace_id),
    unique().on(t.privy_organization_id),
    unique().on(t.basin_identity_id),
    check(
      "organization_privy_organization_id_length",
      sql`length(${t.privy_organization_id}) between 1 and 240`,
    ),
  ],
);
export type Organization = typeof Organization.$inferSelect;
export type NewOrganization = typeof Organization.$inferInsert;
