ALTER TABLE "basin"."expected_payment_operation"
  DROP CONSTRAINT IF EXISTS "expected_payment_operation_action";

ALTER TABLE "basin"."expected_payment_operation"
  ADD CONSTRAINT "expected_payment_operation_action"
  CHECK ("action" IN ('CREATE', 'CANCEL', 'REFRESH_RELATIONSHIP'));
