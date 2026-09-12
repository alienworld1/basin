ALTER TYPE "basin"."expected_payment_reason_code" ADD VALUE IF NOT EXISTS 'SETTLEMENT_UPDATED';
ALTER TYPE "basin"."expected_payment_reason_code" ADD VALUE IF NOT EXISTS 'SETTLEMENT_UNAVAILABLE';
ALTER TYPE "basin"."expected_payment_reason_code" ADD VALUE IF NOT EXISTS 'REAPPROVAL_REQUIRED';
ALTER TYPE "basin"."expected_payment_reason_code" ADD VALUE IF NOT EXISTS 'TREASURY_BLOCKED';
ALTER TYPE "basin"."expected_payment_reason_code" ADD VALUE IF NOT EXISTS 'INSUFFICIENT_FUNDS';
ALTER TYPE "basin"."expected_payment_reason_code" ADD VALUE IF NOT EXISTS 'PAYMENT_UNCONFIRMED';

ALTER TABLE "basin"."payment_execution_operation"
  ADD COLUMN IF NOT EXISTS "validation_step" text,
  ADD COLUMN IF NOT EXISTS "review_expires_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "settlement_version_id" bigint REFERENCES "basin"."settlement_version"("id") ON DELETE RESTRICT;

ALTER TABLE "basin"."payment_execution_operation" DROP CONSTRAINT IF EXISTS "payment_execution_operation_status";
ALTER TABLE "basin"."payment_execution_operation" ADD CONSTRAINT "payment_execution_operation_status" CHECK ("status" IN ('PREPARED','VALIDATING','READY','AWAITING_APPROVAL','SUBMITTING','SUBMITTED','UNKNOWN_EXTERNAL_STATE','BLOCKED','CONFIRMED','FAILED'));
ALTER TABLE "basin"."payment_execution_operation" ADD CONSTRAINT "payment_execution_operation_step" CHECK ("validation_step" IS NULL OR "validation_step" IN ('APPROVED_PAYEE','RECEIVING_AUTHORITY','PAYMENT_ACCESS','SETTLEMENT_CONFIRMATION'));
