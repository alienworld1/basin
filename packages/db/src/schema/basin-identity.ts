import { sql } from "drizzle-orm";
import { text, check, unique } from "drizzle-orm/pg-core";
import { basin, id, reference, uint, time, identityStatus } from "./common";
import { Workspace } from "./workspace";

export const BasinIdentity = basin.table(
  "basin_identity",
  {
    id: id(),
    workspace_id: reference()
      .references(() => Workspace.id, { onDelete: "restrict" })
      .notNull(),
    payee_id: text().notNull(),
    label: text().notNull(),
    ens_name: text().notNull(),
    identity_epoch: uint().notNull(),
    controller_address: text().notNull(),
    resolver_address: text().notNull(),
    protocol_status: identityStatus().notNull(),
    created_at: time().defaultNow().notNull(),
    updated_at: time().defaultNow().notNull(),
  },
  (t) => [
    unique().on(t.workspace_id),
    unique().on(t.payee_id),
    unique().on(t.ens_name),
    check(
      "basin_identity_payee_id_shape",
      sql`${t.payee_id} ~ '^0x[0-9a-f]{64}$'`,
    ),
    check("basin_identity_identity_epoch_range", sql`${t.identity_epoch} >= 0`),
    check(
      "basin_identity_controller_address_shape",
      sql`${t.controller_address} ~ '^0x[0-9a-f]{40}$'`,
    ),
    check(
      "basin_identity_resolver_address_shape",
      sql`${t.resolver_address} ~ '^0x[0-9a-f]{40}$'`,
    ),
  ],
);
export type BasinIdentity = typeof BasinIdentity.$inferSelect;
export type NewBasinIdentity = typeof BasinIdentity.$inferInsert;
