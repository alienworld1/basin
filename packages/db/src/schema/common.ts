import { bigint, numeric, pgSchema, timestamp } from "drizzle-orm/pg-core";
import {
  workspaceTypes,
  memberRoles,
  memberStatuses,
  invitationStatuses,
  accessEventTypes,
  invitationOperationTypes,
  identityStatuses,
  payeeStatuses,
  obligationStatuses,
  paymentStatuses,
  eventTypes,
  endReasons,
  executionPaths,
  idempotencyStatuses,
} from "@basin/domain";
export const basin = pgSchema("basin");
export const id = () =>
  bigint({ mode: "bigint" }).primaryKey().generatedAlwaysAsIdentity();
export const reference = () => bigint({ mode: "bigint" });
export const uint = () => numeric({ precision: 78, scale: 0 });
export const time = () => timestamp({ withTimezone: true, mode: "date" });
export const workspaceType = basin.enum("workspace_type", workspaceTypes);
export const memberRole = basin.enum("member_role", memberRoles);
export const memberStatus = basin.enum("member_status", memberStatuses);
export const invitationStatus = basin.enum(
  "organization_invitation_status",
  invitationStatuses,
);
export const accessEventType = basin.enum(
  "organization_access_event_type",
  accessEventTypes,
);
export const invitationOperationType = basin.enum(
  "invitation_operation_type",
  invitationOperationTypes,
);
export const identityStatus = basin.enum("identity_status", identityStatuses);
export const payeeStatus = basin.enum("payee_status", payeeStatuses);
export const obligationStatus = basin.enum(
  "obligation_status",
  obligationStatuses,
);
export const paymentStatus = basin.enum("payment_status", paymentStatuses);
export const eventType = basin.enum("payment_event_type", eventTypes);
export const endReason = basin.enum("generation_end_reason", endReasons);
export const executionPath = basin.enum("execution_path", executionPaths);
export const idempotencyStatus = basin.enum(
  "idempotency_status",
  idempotencyStatuses,
);
export const idempotencyScope = basin.enum("idempotency_scope", [
  "CREATE_PAYMENT",
]);
export const treasuryStatus = basin.enum("treasury_status", [
  "NOT_STARTED",
  "PROVISIONING",
  "CONTROL_READY",
  "AWAITING_APPROVAL",
  "READY",
  "NEEDS_ATTENTION",
  "FAILED",
]);
export const treasuryOperationType = basin.enum("treasury_operation_type", [
  "PROVISION_TREASURY",
  "ATTACH_ROUTINE_POLICY",
  "RECONCILE_TREASURY",
  "PROCESS_INTENT",
]);
export const treasuryOperationStep = basin.enum("treasury_operation_step", [
  "STARTED",
  "OWNER_QUORUM_VERIFIED",
  "ORGANIZATION_VERIFIED",
  "WALLET_VERIFIED",
  "ROUTINE_SIGNER_VERIFIED",
  "POLICY_VERIFIED",
  "COMPLETE",
]);
export const treasuryOperationStatus = basin.enum("treasury_operation_status", [
  "IN_PROGRESS",
  "AWAITING_APPROVAL",
  "COMPLETED",
  "FAILED_RETRYABLE",
  "FAILED_FINAL",
]);
export const webhookProcessingStatus = basin.enum("webhook_processing_status", [
  "RECEIVED",
  "PROCESSED",
  "IGNORED",
  "FAILED_RETRYABLE",
]);
