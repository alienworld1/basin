CREATE TYPE "basin"."settlement_operation_status" AS ENUM('PREPARED', 'SUBMITTED', 'VERIFYING', 'CONFIRMED', 'FAILED', 'UNKNOWN', 'NEEDS_REVIEW');--> statement-breakpoint
CREATE TABLE "basin"."receiving_preference" (
	"workspace_id" bigint PRIMARY KEY NOT NULL,
	"identity_id" bigint NOT NULL,
	"destination_ciphertext" text NOT NULL,
	"key_version" text NOT NULL,
	"revision" numeric(78, 0) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receiving_preference_revision" CHECK ("basin"."receiving_preference"."revision" >= 0),
	CONSTRAINT "receiving_preference_ciphertext" CHECK (length("basin"."receiving_preference"."destination_ciphertext") between 1 and 240)
);
--> statement-breakpoint
CREATE TABLE "basin"."settlement_operation" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "basin"."settlement_operation_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"workspace_id" bigint NOT NULL,
	"identity_id" bigint NOT NULL,
	"relationship_id" bigint NOT NULL,
	"relationship_token_id" numeric(78, 0) NOT NULL,
	"identity_epoch" numeric(78, 0) NOT NULL,
	"resolver" text NOT NULL,
	"profile_digest" text NOT NULL,
	"accepted_root_digest" text,
	"expected_record" text NOT NULL,
	"target_epoch" numeric(78, 0) NOT NULL,
	"commitment" text NOT NULL,
	"descriptor_ciphertext" text NOT NULL,
	"key_version" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_digest" text NOT NULL,
	"prepared_block" numeric(78, 0) NOT NULL,
	"prepared_expiry" timestamp with time zone NOT NULL,
	"status" "basin"."settlement_operation_status" DEFAULT 'PREPARED' NOT NULL,
	"transaction_hash" text,
	"receipt_block_number" numeric(78, 0),
	"receipt_block_hash" text,
	"verified_at" timestamp with time zone,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settlement_operation_workspace_id_idempotency_key_unique" UNIQUE("workspace_id","idempotency_key"),
	CONSTRAINT "settlement_operation_epochs" CHECK ("basin"."settlement_operation"."target_epoch" >= 0 and "basin"."settlement_operation"."identity_epoch" >= 0 and "basin"."settlement_operation"."relationship_token_id" >= 0),
	CONSTRAINT "settlement_operation_hashes" CHECK ("basin"."settlement_operation"."commitment" ~ '^0x[0-9a-f]{64}$' and "basin"."settlement_operation"."profile_digest" ~ '^0x[0-9a-f]{64}$' and "basin"."settlement_operation"."request_digest" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "settlement_operation_evidence" CHECK ("basin"."settlement_operation"."status" <> 'CONFIRMED' or ("basin"."settlement_operation"."transaction_hash" is not null and "basin"."settlement_operation"."receipt_block_number" is not null and "basin"."settlement_operation"."receipt_block_hash" is not null and "basin"."settlement_operation"."verified_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "basin"."receiving_preference" ADD CONSTRAINT "receiving_preference_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "basin"."workspace"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."receiving_preference" ADD CONSTRAINT "receiving_preference_identity_id_basin_identity_id_fk" FOREIGN KEY ("identity_id") REFERENCES "basin"."basin_identity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."settlement_operation" ADD CONSTRAINT "settlement_operation_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "basin"."workspace"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."settlement_operation" ADD CONSTRAINT "settlement_operation_identity_id_basin_identity_id_fk" FOREIGN KEY ("identity_id") REFERENCES "basin"."basin_identity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."settlement_operation" ADD CONSTRAINT "settlement_operation_relationship_id_approved_payee_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "basin"."approved_payee"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_operation_unresolved" ON "basin"."settlement_operation" USING btree ("relationship_id") WHERE "basin"."settlement_operation"."status" not in ('CONFIRMED', 'FAILED');