import { sql } from "drizzle-orm";
import {
  check,
  integer,
  jsonb,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { ApprovedPayee } from "./approved-payee";
import { ApprovedPayeeGeneration } from "./approved-payee-generation";
import { basin, id, reference, time } from "./common";
import { RelationshipOperation } from "./relationship-operation";
import { User } from "./user";

export const relationshipEventType = basin.enum("relationship_event_type", [
  "PROPOSAL_REGISTERED",
  "ACCEPTANCE_ACTIVATED",
  "REVOCATION_CONFIRMED",
  "EXPIRY_OBSERVED",
  "SECURITY_CHANGE_OBSERVED",
  "GENERATION_REPLACED",
]);

export const RelationshipEvent = basin.table(
  "relationship_event",
  {
    id: id(),
    operation_id: reference()
      .references(() => RelationshipOperation.id, { onDelete: "restrict" }),
    approved_payee_id: reference()
      .references(() => ApprovedPayee.id, { onDelete: "restrict" })
      .notNull(),
    generation_id: reference().references(() => ApprovedPayeeGeneration.id, {
      onDelete: "restrict",
    }),
    event_type: relationshipEventType().notNull(),
    actor_user_id: reference().references(() => User.id, {
      onDelete: "restrict",
    }),
    occurred_at: time().notNull(),
    evidence: jsonb().$type<Record<string, unknown>>().notNull(),
    transaction_hash: text(),
    log_index: integer(),
    observation_key: text(),
    created_at: time().defaultNow().notNull(),
  },
  (t) => [
    unique().on(t.operation_id, t.event_type),
    unique().on(t.transaction_hash, t.log_index),
    uniqueIndex("relationship_event_observation_key_unique")
      .on(t.observation_key)
      .where(sql`${t.observation_key} is not null`),
    check(
      "relationship_event_origin",
      sql`(${t.operation_id} is not null and ${t.observation_key} is null) or (${t.operation_id} is null and ${t.observation_key} is not null and ${t.event_type} in ('EXPIRY_OBSERVED', 'SECURITY_CHANGE_OBSERVED', 'GENERATION_REPLACED'))`,
    ),
  ],
);

export type RelationshipEvent = typeof RelationshipEvent.$inferSelect;
