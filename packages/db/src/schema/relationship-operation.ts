import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { ApprovedPayee } from "./approved-payee";
import { BasinIdentity } from "./basin-identity";
import { basin, id, reference, time } from "./common";
import { Organization } from "./organization";
import { User } from "./user";
import { Workspace } from "./workspace";

export const relationshipOperationKind = basin.enum(
  "relationship_operation_kind",
  ["SETUP_NAMESPACE", "PROPOSE", "ACCEPT", "REVOKE"],
);
export const relationshipOperationStatus = basin.enum(
  "relationship_operation_status",
  [
    "PREPARED",
    "AWAITING_AUTHORIZATION",
    "SUBMITTED",
    "CONFIRMED",
    "FAILED",
    "NEEDS_ATTENTION",
  ],
);
export const relationshipOperationStep = basin.enum(
  "relationship_operation_step",
  [
    "REVIEWED",
    "AUTHORIZATION_REQUIRED",
    "NAMESPACE_SUBMITTED",
    "REGISTRATION_SUBMITTED",
    "ACCEPTANCE_SIGNED",
    "ACTIVATION_SUBMITTED",
    "REVOCATION_SUBMITTED",
    "VERIFYING",
    "COMPLETE",
  ],
);

export const RelationshipOperation = basin.table(
  "relationship_operation",
  {
    id: id(),
    kind: relationshipOperationKind().notNull(),
    organization_id: reference()
      .references(() => Organization.id, { onDelete: "restrict" })
      .notNull(),
    actor_user_id: reference()
      .references(() => User.id, { onDelete: "restrict" })
      .notNull(),
    actor_workspace_id: reference()
      .references(() => Workspace.id, { onDelete: "restrict" })
      .notNull(),
    approved_payee_id: reference().references(() => ApprovedPayee.id, {
      onDelete: "restrict",
    }),
    identity_id: reference().references(() => BasinIdentity.id, {
      onDelete: "restrict",
    }),
    idempotency_key: text().notNull(),
    request_hash: text().notNull(),
    status: relationshipOperationStatus().default("PREPARED").notNull(),
    step: relationshipOperationStep().default("REVIEWED").notNull(),
    review_snapshot: jsonb().$type<Record<string, unknown>>().notNull(),
    review_expires_at: time().notNull(),
    authorization_reference: text(),
    transaction_hashes: jsonb().$type<string[]>().default([]).notNull(),
    acceptance_payload: jsonb().$type<Record<string, unknown>>(),
    acceptance_signature: text(),
    last_error_code: text(),
    created_at: time().defaultNow().notNull(),
    updated_at: time().defaultNow().notNull(),
  },
  (t) => [
    unique().on(t.organization_id, t.actor_user_id, t.kind, t.idempotency_key),
    index().on(t.approved_payee_id, t.updated_at),
    uniqueIndex("relationship_operation_unresolved_relationship")
      .on(t.approved_payee_id)
      .where(
        sql`${t.approved_payee_id} is not null and ${t.status} in ('PREPARED', 'AWAITING_AUTHORIZATION', 'SUBMITTED', 'NEEDS_ATTENTION')`,
      ),
    check(
      "relationship_operation_request_hash_shape",
      sql`${t.request_hash} ~ '^0x[0-9a-f]{64}$'`,
    ),
    check(
      "relationship_operation_signature_shape",
      sql`${t.acceptance_signature} is null or ${t.acceptance_signature} ~ '^0x([0-9a-f]{128}|[0-9a-f]{130})$'`,
    ),
    check(
      "relationship_operation_target",
      sql`${t.kind} = 'SETUP_NAMESPACE' or (${t.approved_payee_id} is not null and ${t.identity_id} is not null)`,
    ),
  ],
);

export type RelationshipOperation = typeof RelationshipOperation.$inferSelect;
