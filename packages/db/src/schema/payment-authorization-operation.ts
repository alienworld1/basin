import { check, index, text, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { basin, id, reference, time } from "./common";
import { ExpectedPayment } from "./expected-payment";
import { Organization } from "./organization";
import { OrganizationMember } from "./organization-member";

export const PaymentAuthorizationOperation = basin.table(
  "payment_authorization_operation",
  {
    id: id(),
    organization_id: reference().references(() => Organization.id, { onDelete: "restrict" }).notNull(),
    expected_payment_id: reference().references(() => ExpectedPayment.id, { onDelete: "restrict" }).notNull(),
    actor_member_id: reference().references(() => OrganizationMember.id, { onDelete: "restrict" }).notNull(),
    idempotency_key: text().notNull(),
    request_hash: text().notNull(),
    obligation_id: text().notNull(),
    metadata_hash: text().notNull(),
    valid_until: time().notNull(),
    status: text().$type<"PREPARED" | "AWAITING_APPROVAL" | "SUBMITTED" | "UNKNOWN_EXTERNAL_STATE" | "CONFIRMED" | "FAILED">().notNull().default("PREPARED"),
    privy_transaction_id: text(),
    transaction_hash: text(),
    failure_code: text(),
    created_at: time().notNull().defaultNow(),
    updated_at: time().notNull().defaultNow(),
    completed_at: time(),
  },
  (t) => [
    unique().on(t.organization_id, t.idempotency_key),
    unique().on(t.expected_payment_id),
    index().on(t.organization_id, t.status),
    check("payment_authorization_operation_request_hash", sql`${t.request_hash} ~ '^0x[0-9a-f]{64}$'`),
    check("payment_authorization_operation_obligation_id", sql`${t.obligation_id} ~ '^0x[0-9a-f]{64}$'`),
    check("payment_authorization_operation_metadata_hash", sql`${t.metadata_hash} ~ '^0x[0-9a-f]{64}$'`),
    check("payment_authorization_operation_transaction_hash", sql`${t.transaction_hash} is null or ${t.transaction_hash} ~ '^0x[0-9a-f]{64}$'`),
    check("payment_authorization_operation_status", sql`${t.status} in ('PREPARED', 'AWAITING_APPROVAL', 'SUBMITTED', 'UNKNOWN_EXTERNAL_STATE', 'CONFIRMED', 'FAILED')`),
  ],
);

export type PaymentAuthorizationOperation = typeof PaymentAuthorizationOperation.$inferSelect;
