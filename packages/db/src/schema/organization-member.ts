import { sql } from "drizzle-orm";
import { check, index, unique } from "drizzle-orm/pg-core";
import { basin, id, reference, time, memberRole, memberStatus } from "./common";
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
    status: memberStatus().default("ACTIVE").notNull(),
    activated_at: time().defaultNow().notNull(),
    removed_at: time(),
    removed_by_user_id: reference().references(() => User.id, {
      onDelete: "restrict",
    }),
    left_at: time(),
    created_at: time().defaultNow().notNull(),
    updated_at: time().defaultNow().notNull(),
  },
  (t) => [
    unique().on(t.organization_id, t.user_id),
    index().on(t.user_id, t.status),
    check(
      "organization_member_lifecycle",
      sql`(${t.status} = 'ACTIVE' and ${t.removed_at} is null and ${t.removed_by_user_id} is null and ${t.left_at} is null) or (${t.status} = 'REMOVED' and ${t.removed_at} is not null and ${t.removed_by_user_id} is not null and ${t.left_at} is null) or (${t.status} = 'LEFT' and ${t.left_at} is not null and ${t.removed_at} is null and ${t.removed_by_user_id} is null)`,
    ),
    check(
      "organization_admin_stays_active",
      sql`${t.role} != 'ADMIN' or ${t.status} = 'ACTIVE'`,
    ),
  ],
);
export type OrganizationMember = typeof OrganizationMember.$inferSelect;
export type NewOrganizationMember = typeof OrganizationMember.$inferInsert;
