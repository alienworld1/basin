import { sql } from "drizzle-orm";
import { text, check, index, unique } from "drizzle-orm/pg-core";
import {
  basin,
  id,
  reference,
  time,
  idempotencyScope,
  idempotencyStatus,
} from "./common";
import { Organization } from "./organization";
import { Payment } from "./payment";

export const IdempotencyKey = basin.table(
  "idempotency_key",
  {
    id: id(),
    scope: idempotencyScope().notNull(),
    organization_id: reference()
      .references(() => Organization.id, { onDelete: "restrict" })
      .notNull(),
    key: text().notNull(),
    request_hash: text().notNull(),
    payment_id: reference().references(() => Payment.id, {
      onDelete: "restrict",
    }),
    status: idempotencyStatus().notNull(),
    expires_at: time(),
    created_at: time().defaultNow().notNull(),
    updated_at: time().defaultNow().notNull(),
  },
  (t) => [
    unique().on(t.organization_id, t.scope, t.key),
    index().on(t.payment_id),
    check(
      "idempotency_key_key_length",
      sql`length(${t.key}) between 1 and 240`,
    ),
    check(
      "idempotency_key_request_hash_shape",
      sql`${t.request_hash} ~ '^0x[0-9a-f]{64}$'`,
    ),
    check(
      "idempotency_completion",
      sql`${t.status} != 'COMPLETED' or ${t.payment_id} is not null`,
    ),
  ],
);
export type IdempotencyKey = typeof IdempotencyKey.$inferSelect;
export type NewIdempotencyKey = typeof IdempotencyKey.$inferInsert;
