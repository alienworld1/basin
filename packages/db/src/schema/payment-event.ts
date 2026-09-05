import { sql } from "drizzle-orm";
import { text, integer, jsonb, check, unique } from "drizzle-orm/pg-core";
import { basin, id, reference, time, eventType, paymentStatus } from "./common";
import { Payment } from "./payment";

export const PaymentEvent = basin.table(
  "payment_event",
  {
    id: id(),
    payment_id: reference()
      .references(() => Payment.id, { onDelete: "restrict" })
      .notNull(),
    sequence: integer().notNull(),
    type: eventType().notNull(),
    from_status: paymentStatus(),
    to_status: paymentStatus().notNull(),
    reason_code: text(),
    safe_metadata: jsonb().$type<{
      transaction_hash?: string;
      block_number?: string;
    }>(),
    occurred_at: time().notNull(),
    created_at: time().defaultNow().notNull(),
  },
  (t) => [
    unique().on(t.payment_id, t.sequence),
    check("payment_event_sequence_range", sql`${t.sequence} > 0`),
    check(
      "payment_event_reason_code_length",
      sql`length(${t.reason_code}) between 1 and 240`,
    ),
  ],
);
export type PaymentEvent = typeof PaymentEvent.$inferSelect;
export type NewPaymentEvent = typeof PaymentEvent.$inferInsert;
