ALTER TABLE "basin"."payment_execution_operation"
  ADD COLUMN IF NOT EXISTS "submission_block_number" text;

ALTER TABLE "basin"."payment_execution_operation"
  ADD CONSTRAINT "payment_execution_operation_submission_block"
  CHECK ("submission_block_number" IS NULL OR "submission_block_number" ~ '^[0-9]+$');
