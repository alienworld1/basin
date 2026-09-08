import { sql } from "drizzle-orm";
import { check, index, integer, text, unique } from "drizzle-orm/pg-core";

import {
  accessEventType,
  basin,
  id,
  invitationOperationType,
  invitationStatus,
  memberRole,
  reference,
  time,
} from "./common";
import { Organization } from "./organization";
import { OrganizationMember } from "./organization-member";
import { User } from "./user";

export const OrganizationInvitation = basin.table(
  "organization_invitation",
  {
    id: id(),
    organization_id: reference()
      .references(() => Organization.id, { onDelete: "restrict" })
      .notNull(),
    role: memberRole().default("PAYMENT_OPERATOR").notNull(),
    invitee_label: text().notNull(),
    secret_version: integer().default(1).notNull(),
    secret_hash: text().notNull(),
    status: invitationStatus().default("PENDING").notNull(),
    expires_at: time().notNull(),
    created_by_user_id: reference()
      .references(() => User.id, { onDelete: "restrict" })
      .notNull(),
    accepted_by_user_id: reference().references(() => User.id, {
      onDelete: "restrict",
    }),
    accepted_at: time(),
    revoked_by_user_id: reference().references(() => User.id, {
      onDelete: "restrict",
    }),
    revoked_at: time(),
    created_at: time().defaultNow().notNull(),
    updated_at: time().defaultNow().notNull(),
  },
  (t) => [
    unique().on(t.secret_hash),
    index().on(t.organization_id, t.status, t.created_at),
    check("organization_invitation_role", sql`${t.role} = 'PAYMENT_OPERATOR'`),
    check(
      "organization_invitation_label_length",
      sql`length(${t.invitee_label}) between 1 and 120 and ${t.invitee_label} = btrim(${t.invitee_label})`,
    ),
    check(
      "organization_invitation_secret",
      sql`${t.secret_version} between 1 and 32767 and ${t.secret_hash} ~ '^0x[0-9a-f]{64}$'`,
    ),
    check(
      "organization_invitation_lifecycle",
      sql`(${t.status} in ('PENDING', 'EXPIRED') and ${t.accepted_by_user_id} is null and ${t.accepted_at} is null and ${t.revoked_by_user_id} is null and ${t.revoked_at} is null) or (${t.status} = 'ACCEPTED' and ${t.accepted_by_user_id} is not null and ${t.accepted_at} is not null and ${t.revoked_by_user_id} is null and ${t.revoked_at} is null) or (${t.status} = 'REVOKED' and ${t.accepted_by_user_id} is null and ${t.accepted_at} is null and ${t.revoked_by_user_id} is not null and ${t.revoked_at} is not null)`,
    ),
  ],
);

export const OrganizationAccessEvent = basin.table(
  "organization_access_event",
  {
    id: id(),
    organization_id: reference()
      .references(() => Organization.id, { onDelete: "restrict" })
      .notNull(),
    membership_id: reference().references(() => OrganizationMember.id, {
      onDelete: "restrict",
    }),
    invitation_id: reference().references(() => OrganizationInvitation.id, {
      onDelete: "restrict",
    }),
    actor_user_id: reference().references(() => User.id, {
      onDelete: "restrict",
    }),
    subject_user_id: reference().references(() => User.id, {
      onDelete: "restrict",
    }),
    type: accessEventType().notNull(),
    created_at: time().defaultNow().notNull(),
  },
  (t) => [
    index().on(t.organization_id, t.created_at),
    check(
      "organization_access_event_reference",
      sql`${t.membership_id} is not null or ${t.invitation_id} is not null`,
    ),
  ],
);

export const InvitationOperation = basin.table(
  "invitation_operation",
  {
    id: id(),
    organization_id: reference()
      .references(() => Organization.id, { onDelete: "restrict" })
      .notNull(),
    actor_user_id: reference()
      .references(() => User.id, { onDelete: "restrict" })
      .notNull(),
    operation_type: invitationOperationType().notNull(),
    idempotency_key: text().notNull(),
    request_fingerprint: text().notNull(),
    invitation_id: reference()
      .references(() => OrganizationInvitation.id, { onDelete: "restrict" })
      .notNull(),
    created_at: time().defaultNow().notNull(),
  },
  (t) => [
    unique().on(
      t.organization_id,
      t.actor_user_id,
      t.operation_type,
      t.idempotency_key,
    ),
    check(
      "invitation_operation_idempotency_length",
      sql`length(${t.idempotency_key}) between 16 and 160`,
    ),
    check(
      "invitation_operation_fingerprint",
      sql`${t.request_fingerprint} ~ '^0x[0-9a-f]{64}$'`,
    ),
  ],
);

export type OrganizationInvitation = typeof OrganizationInvitation.$inferSelect;
export type OrganizationAccessEvent =
  typeof OrganizationAccessEvent.$inferSelect;
