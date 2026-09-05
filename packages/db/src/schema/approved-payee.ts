import { sql } from "drizzle-orm";
import { text, check, index, unique } from "drizzle-orm/pg-core";
import { basin, id, reference, time, payeeStatus } from "./common";
import { BasinIdentity } from "./basin-identity";
import { Organization } from "./organization";

export const ApprovedPayee = basin.table(
  "approved_payee",
  {
    id: id(),
    organization_id: reference()
      .references(() => Organization.id, { onDelete: "restrict" })
      .notNull(),
    basin_identity_id: reference()
      .references(() => BasinIdentity.id, { onDelete: "restrict" })
      .notNull(),
    relationship_name: text(),
    status: payeeStatus().notNull(),
    expires_at: time(),
    revoked_at: time(),
    revocation_cause: text(),
    created_at: time().defaultNow().notNull(),
    updated_at: time().defaultNow().notNull(),
  },
  (t) => [
    unique().on(t.organization_id, t.basin_identity_id),
    unique().on(t.id, t.organization_id),
    index().on(t.basin_identity_id),
    check(
      "approved_payee_revocation_cause_length",
      sql`length(${t.revocation_cause}) between 1 and 240`,
    ),
    check(
      "payee_revocation",
      sql`(${t.status} = 'REVOKED') = (${t.revoked_at} is not null)`,
    ),
    index().on(t.organization_id, t.status, t.expires_at),
  ],
);
export type ApprovedPayee = typeof ApprovedPayee.$inferSelect;
export type NewApprovedPayee = typeof ApprovedPayee.$inferInsert;
