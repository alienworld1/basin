import { index, unique } from "drizzle-orm/pg-core";
import { basin, id, reference, time, memberRole } from "./common";
import { Organization } from "./organization";
import { User } from "./user";

export const OrganizationMember = basin.table(
  "organization_member",
  {
    id: id(),
    organization_id: reference()
      .references(() => Organization.id, { onDelete: "restrict" })
      .notNull(),
    user_id: reference()
      .references(() => User.id, { onDelete: "restrict" })
      .notNull(),
    role: memberRole().notNull(),
    created_at: time().defaultNow().notNull(),
    updated_at: time().defaultNow().notNull(),
  },
  (t) => [unique().on(t.organization_id, t.user_id), index().on(t.user_id)],
);
export type OrganizationMember = typeof OrganizationMember.$inferSelect;
export type NewOrganizationMember = typeof OrganizationMember.$inferInsert;
