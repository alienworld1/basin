CREATE TABLE "basin"."payment_execution_operation" (
  "id" bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  "organization_id" bigint NOT NULL REFERENCES "basin"."organization"("id") ON DELETE RESTRICT,
  "expected_payment_id" bigint NOT NULL REFERENCES "basin"."expected_payment"("id") ON DELETE RESTRICT UNIQUE,
  "payment_id" bigint NOT NULL REFERENCES "basin"."payment"("id") ON DELETE RESTRICT,
  "actor_member_id" bigint NOT NULL REFERENCES "basin"."organization_member"("id") ON DELETE RESTRICT,
  "idempotency_key" text NOT NULL, "request_hash" text NOT NULL, "status" text NOT NULL DEFAULT 'PREPARED',
  "execution_path" text, "review_version" integer NOT NULL DEFAULT 1, "review_snapshot" text NOT NULL,
  "privy_transaction_id" text, "transaction_hash" text, "failure_code" text, "submitted_at" timestamptz, "completed_at" timestamptz, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE("organization_id", "idempotency_key"),
  CONSTRAINT "payment_execution_operation_hash" CHECK ("request_hash" ~ '^0x[0-9a-f]{64}$'),
  CONSTRAINT "payment_execution_operation_transaction_hash" CHECK ("transaction_hash" IS NULL OR "transaction_hash" ~ '^0x[0-9a-f]{64}$'),
  CONSTRAINT "payment_execution_operation_review_version" CHECK ("review_version" > 0),
  CONSTRAINT "payment_execution_operation_status" CHECK ("status" IN ('PREPARED','VALIDATING','READY','AWAITING_APPROVAL','SUBMITTING','SUBMITTED','UNKNOWN_EXTERNAL_STATE','CONFIRMED','FAILED'))
);
CREATE INDEX "payment_execution_operation_organization_status" ON "basin"."payment_execution_operation" ("organization_id", "status");
