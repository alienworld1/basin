import { sql } from "drizzle-orm";
import { check, index, text, unique } from "drizzle-orm/pg-core";
import { basin, id, reference, time } from "./common";
import { ExpectedPayment } from "./expected-payment";
import { Organization } from "./organization";

export const ExpectedPaymentOperation = basin.table(
  "expected_payment_operation",
  {
    id: id(),
    organization_id: reference()
      .references(() => Organization.id, { onDelete: "restrict" })
      .notNull(),
    action: text()
      .$type<"CREATE" | "CANCEL" | "REFRESH_RELATIONSHIP">()
      .notNull(),
    idempotency_key: text().notNull(),
    request_hash: text().notNull(),
    expected_payment_id: reference().references(() => ExpectedPayment.id, {
      onDelete: "restrict",
    }),
    created_at: time().defaultNow().notNull(),
    completed_at: time(),
  },
  (t) => [
    unique().on(t.organization_id, t.action, t.idempotency_key),
    index().on(t.expected_payment_id),
    check(
      "expected_payment_operation_action",
      sql`${t.action} in ('CREATE', 'CANCEL', 'REFRESH_RELATIONSHIP')`,
    ),
    check(
      "expected_payment_operation_key_length",
      sql`length(${t.idempotency_key}) between 1 and 240`,
    ),
    check(
      "expected_payment_operation_hash_shape",
      sql`${t.request_hash} ~ '^0x[0-9a-f]{64}$'`,
    ),
    check(
      "expected_payment_operation_completion",
      sql`(${t.completed_at} is null) = (${t.expected_payment_id} is null)`,
    ),
  ],
);
