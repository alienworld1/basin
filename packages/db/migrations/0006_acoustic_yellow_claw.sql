CREATE TYPE "basin"."expected_payment_reason_code" AS ENUM('RELATIONSHIP_CHANGED', 'RELATIONSHIP_INACTIVE', 'AUTHORIZATION_UNAVAILABLE', 'OBLIGATION_UNAVAILABLE', 'PAYMENT_FAILED');--> statement-breakpoint
CREATE TYPE "basin"."expected_payment_status" AS ENUM('EXPECTED', 'READY', 'PROCESSING', 'SATISFIED', 'ATTENTION', 'CANCELLED');--> statement-breakpoint
ALTER TYPE "basin"."idempotency_scope" ADD VALUE 'CREATE_EXPECTED_PAYMENT';--> statement-breakpoint
ALTER TYPE "basin"."idempotency_scope" ADD VALUE 'CANCEL_EXPECTED_PAYMENT';--> statement-breakpoint
CREATE TABLE "basin"."expected_payment" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "basin"."expected_payment_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" bigint NOT NULL,
	"approved_payee_id" bigint NOT NULL,
	"approved_payee_generation_id" bigint NOT NULL,
	"amount_base_units" numeric(78, 0) NOT NULL,
	"asset_address" text NOT NULL,
	"purpose" text NOT NULL,
	"external_reference" text,
	"status" "basin"."expected_payment_status" DEFAULT 'EXPECTED' NOT NULL,
	"status_reason_code" "basin"."expected_payment_reason_code",
	"obligation_record_id" bigint,
	"payment_record_id" bigint,
	"created_by_member_id" bigint NOT NULL,
	"cancelled_by_member_id" bigint,
	"cancelled_at" timestamp with time zone,
	"satisfied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expected_payment_id_organization_id_approved_payee_id_approved_payee_generation_id_unique" UNIQUE("id","organization_id","approved_payee_id","approved_payee_generation_id"),
	CONSTRAINT "expected_payment_obligation_record_id_unique" UNIQUE("obligation_record_id"),
	CONSTRAINT "expected_payment_payment_record_id_unique" UNIQUE("payment_record_id"),
	CONSTRAINT "expected_payment_amount_positive" CHECK ("basin"."expected_payment"."amount_base_units" > 0),
	CONSTRAINT "expected_payment_asset_address_shape" CHECK ("basin"."expected_payment"."asset_address" ~ '^0x[0-9a-f]{40}$'),
	CONSTRAINT "expected_payment_purpose_length" CHECK (length("basin"."expected_payment"."purpose") <= 240 and length(btrim("basin"."expected_payment"."purpose")) > 0),
	CONSTRAINT "expected_payment_reference_length" CHECK ("basin"."expected_payment"."external_reference" is null or (length("basin"."expected_payment"."external_reference") between 1 and 160 and length(btrim("basin"."expected_payment"."external_reference")) > 0)),
	CONSTRAINT "expected_payment_attention_reason" CHECK (("basin"."expected_payment"."status" = 'ATTENTION') = ("basin"."expected_payment"."status_reason_code" is not null)),
	CONSTRAINT "expected_payment_cancellation" CHECK (("basin"."expected_payment"."status" = 'CANCELLED') = ("basin"."expected_payment"."cancelled_at" is not null and "basin"."expected_payment"."cancelled_by_member_id" is not null) and ("basin"."expected_payment"."status" != 'CANCELLED' or ("basin"."expected_payment"."obligation_record_id" is null and "basin"."expected_payment"."payment_record_id" is null))),
	CONSTRAINT "expected_payment_satisfaction" CHECK (("basin"."expected_payment"."status" = 'SATISFIED') = ("basin"."expected_payment"."satisfied_at" is not null)),
	CONSTRAINT "expected_payment_lifecycle_links" CHECK (("basin"."expected_payment"."status" != 'READY' or "basin"."expected_payment"."obligation_record_id" is not null) and ("basin"."expected_payment"."status" != 'PROCESSING' or "basin"."expected_payment"."payment_record_id" is not null) and ("basin"."expected_payment"."status" != 'SATISFIED' or "basin"."expected_payment"."payment_record_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "basin"."expected_payment_operation" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "basin"."expected_payment_operation_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" bigint NOT NULL,
	"action" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"expected_payment_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "expected_payment_operation_organization_id_action_idempotency_key_unique" UNIQUE("organization_id","action","idempotency_key"),
	CONSTRAINT "expected_payment_operation_action" CHECK ("basin"."expected_payment_operation"."action" in ('CREATE', 'CANCEL')),
	CONSTRAINT "expected_payment_operation_key_length" CHECK (length("basin"."expected_payment_operation"."idempotency_key") between 1 and 240),
	CONSTRAINT "expected_payment_operation_hash_shape" CHECK ("basin"."expected_payment_operation"."request_hash" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "expected_payment_operation_completion" CHECK (("basin"."expected_payment_operation"."completed_at" is null) = ("basin"."expected_payment_operation"."expected_payment_id" is null))
);
--> statement-breakpoint
ALTER TABLE "basin"."expected_payment" ADD CONSTRAINT "expected_payment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "basin"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."expected_payment" ADD CONSTRAINT "expected_payment_approved_payee_id_approved_payee_id_fk" FOREIGN KEY ("approved_payee_id") REFERENCES "basin"."approved_payee"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."expected_payment" ADD CONSTRAINT "expected_payment_approved_payee_generation_id_approved_payee_generation_id_fk" FOREIGN KEY ("approved_payee_generation_id") REFERENCES "basin"."approved_payee_generation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."expected_payment" ADD CONSTRAINT "expected_payment_obligation_record_id_obligation_id_fk" FOREIGN KEY ("obligation_record_id") REFERENCES "basin"."obligation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."expected_payment" ADD CONSTRAINT "expected_payment_payment_record_id_payment_id_fk" FOREIGN KEY ("payment_record_id") REFERENCES "basin"."payment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."expected_payment" ADD CONSTRAINT "expected_payment_created_by_member_id_organization_member_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "basin"."organization_member"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."expected_payment" ADD CONSTRAINT "expected_payment_cancelled_by_member_id_organization_member_id_fk" FOREIGN KEY ("cancelled_by_member_id") REFERENCES "basin"."organization_member"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."expected_payment" ADD CONSTRAINT "expected_payment_approved_payee_id_organization_id_approved_payee_id_organization_id_fk" FOREIGN KEY ("approved_payee_id","organization_id") REFERENCES "basin"."approved_payee"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."expected_payment" ADD CONSTRAINT "expected_payment_approved_payee_generation_id_approved_payee_id_approved_payee_generation_id_approved_payee_id_fk" FOREIGN KEY ("approved_payee_generation_id","approved_payee_id") REFERENCES "basin"."approved_payee_generation"("id","approved_payee_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."expected_payment" ADD CONSTRAINT "expected_payment_obligation_record_id_organization_id_approved_payee_id_approved_payee_generation_id_obligation_id_organization_id_approved_payee_id_approved_payee_generation_id_fk" FOREIGN KEY ("obligation_record_id","organization_id","approved_payee_id","approved_payee_generation_id") REFERENCES "basin"."obligation"("id","organization_id","approved_payee_id","approved_payee_generation_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."expected_payment_operation" ADD CONSTRAINT "expected_payment_operation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "basin"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."expected_payment_operation" ADD CONSTRAINT "expected_payment_operation_expected_payment_id_expected_payment_id_fk" FOREIGN KEY ("expected_payment_id") REFERENCES "basin"."expected_payment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expected_payment_organization_id_status_created_at_id_index" ON "basin"."expected_payment" USING btree ("organization_id","status","created_at","id");--> statement-breakpoint
CREATE INDEX "expected_payment_approved_payee_id_created_at_id_index" ON "basin"."expected_payment" USING btree ("approved_payee_id","created_at","id");--> statement-breakpoint
CREATE INDEX "expected_payment_operation_expected_payment_id_index" ON "basin"."expected_payment_operation" USING btree ("expected_payment_id");