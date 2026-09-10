import { sql } from "drizzle-orm";
import { check, integer, text, unique } from "drizzle-orm/pg-core";

import { BasinIdentity } from "./basin-identity";
import { basin, id, reference, time, uint } from "./common";
import { Organization } from "./organization";

export const OrganizationNamespace = basin.table(
  "organization_namespace",
  {
    id: id(),
    organization_id: reference()
      .references(() => Organization.id, { onDelete: "restrict" })
      .notNull(),
    basin_identity_id: reference()
      .references(() => BasinIdentity.id, { onDelete: "restrict" })
      .notNull(),
    chain_id: integer().notNull(),
    registry_address: text().notNull(),
    parent_name: text().notNull(),
    registry_implementation_address: text().notNull(),
    setup_operation_id: reference().notNull(),
    verification_block_number: uint().notNull(),
    verified_at: time().notNull(),
    created_at: time().defaultNow().notNull(),
  },
  (t) => [
    unique().on(t.organization_id),
    unique().on(t.registry_address),
    check("organization_namespace_chain", sql`${t.chain_id} = 11155111`),
    check(
      "organization_namespace_registry_address_shape",
      sql`${t.registry_address} ~ '^0x[0-9a-f]{40}$'`,
    ),
    check(
      "organization_namespace_implementation_address_shape",
      sql`${t.registry_implementation_address} ~ '^0x[0-9a-f]{40}$'`,
    ),
    check(
      "organization_namespace_verification_block_range",
      sql`${t.verification_block_number} >= 0`,
    ),
  ],
);

export type OrganizationNamespace = typeof OrganizationNamespace.$inferSelect;
