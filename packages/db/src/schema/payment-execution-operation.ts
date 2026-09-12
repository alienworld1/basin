import { sql } from "drizzle-orm";
import { check, index, integer, text, unique } from "drizzle-orm/pg-core";
import { basin, id, reference, time } from "./common";
import { Organization } from "./organization";
import { OrganizationMember } from "./organization-member";
import { ExpectedPayment } from "./expected-payment";
import { Payment } from "./payment";
import { SettlementVersion } from "./settlement-version";

export const PaymentExecutionOperation = basin.table(
  "payment_execution_operation",
  {
    id: id(),
    organization_id: reference()
      .references(() => Organization.id, { onDelete: "restrict" })
      .notNull(),
    expected_payment_id: reference()
      .references(() => ExpectedPayment.id, { onDelete: "restrict" })
      .notNull(),
    payment_id: reference()
      .references(() => Payment.id, { onDelete: "restrict" })
      .notNull(),
    actor_member_id: reference()
      .references(() => OrganizationMember.id, { onDelete: "restrict" })
      .notNull(),
    idempotency_key: text().notNull(),
    request_hash: text().notNull(),
    status: text()
      .$type<
        | "PREPARED"
        | "VALIDATING"
        | "READY"
        | "AWAITING_APPROVAL"
        | "SUBMITTING"
        | "SUBMITTED"
        | "UNKNOWN_EXTERNAL_STATE"
        | "BLOCKED"
        | "CONFIRMED"
        | "FAILED"
      >()
      .notNull()
      .default("PREPARED"),
    validation_step: text().$type<
      | "APPROVED_PAYEE"
      | "RECEIVING_AUTHORITY"
      | "PAYMENT_ACCESS"
      | "SETTLEMENT_CONFIRMATION"
    >(),
    execution_path: text().$type<"ROUTINE_SIGNER" | "PRIVY_INTENT">(),
    review_version: integer().notNull().default(1),
    review_snapshot: text().notNull(),
    review_expires_at: time(),
    settlement_version_id: reference().references(() => SettlementVersion.id, {
      onDelete: "restrict",
    }),
    privy_transaction_id: text(),
    transaction_hash: text(),
    submission_block_number: text(),
    failure_code: text(),
    submitted_at: time(),
    completed_at: time(),
    created_at: time().defaultNow().notNull(),
    updated_at: time().defaultNow().notNull(),
  },
  (t) => [
    unique().on(t.expected_payment_id),
    unique().on(t.organization_id, t.idempotency_key),
    index().on(t.organization_id, t.status),
    check(
      "payment_execution_operation_hash",
      sql`${t.request_hash} ~ '^0x[0-9a-f]{64}$'`,
    ),
    check(
      "payment_execution_operation_transaction_hash",
      sql`${t.transaction_hash} is null or ${t.transaction_hash} ~ '^0x[0-9a-f]{64}$'`,
    ),
    check(
      "payment_execution_operation_submission_block",
      sql`${t.submission_block_number} is null or ${t.submission_block_number} ~ '^[0-9]+$'`,
    ),
    check(
      "payment_execution_operation_review_version",
      sql`${t.review_version} > 0`,
    ),
    check(
      "payment_execution_operation_status",
      sql`${t.status} in ('PREPARED','VALIDATING','READY','AWAITING_APPROVAL','SUBMITTING','SUBMITTED','UNKNOWN_EXTERNAL_STATE','BLOCKED','CONFIRMED','FAILED')`,
    ),
    check(
      "payment_execution_operation_step",
      sql`${t.validation_step} is null or ${t.validation_step} in ('APPROVED_PAYEE','RECEIVING_AUTHORITY','PAYMENT_ACCESS','SETTLEMENT_CONFIRMATION')`,
    ),
  ],
);
export type PaymentExecutionOperation =
  typeof PaymentExecutionOperation.$inferSelect;
