import { sql } from "drizzle-orm";
import { check, text, unique } from "drizzle-orm/pg-core";
import { basin, id, reference, time, treasuryOperationStatus, treasuryOperationStep, treasuryOperationType } from "./common";
import { Organization } from "./organization";

export const PrivyProvisioningOperation = basin.table("privy_provisioning_operation", {
  id: id(),
  organization_id: reference().references(() => Organization.id, { onDelete: "restrict" }).notNull(),
  idempotency_key: text().notNull(),
  operation_type: treasuryOperationType().notNull(),
  step: treasuryOperationStep().default("STARTED").notNull(),
  status: treasuryOperationStatus().default("IN_PROGRESS").notNull(),
  privy_intent_id: text(),
  request_fingerprint: text().notNull(),
  safe_error_code: text(),
  expires_at: time(),
  created_at: time().defaultNow().notNull(),
  updated_at: time().defaultNow().notNull(),
}, (t) => [
  unique().on(t.organization_id, t.operation_type, t.idempotency_key),
  unique().on(t.privy_intent_id),
  check("privy_operation_idempotency_length", sql`length(${t.idempotency_key}) between 16 and 160`),
  check("privy_operation_fingerprint", sql`${t.request_fingerprint} ~ '^0x[0-9a-f]{64}$'`),
]);
export type PrivyProvisioningOperation = typeof PrivyProvisioningOperation.$inferSelect;
