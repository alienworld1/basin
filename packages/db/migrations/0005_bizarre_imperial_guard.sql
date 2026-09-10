CREATE TYPE "basin"."relationship_operation_kind" AS ENUM('SETUP_NAMESPACE', 'PROPOSE', 'ACCEPT', 'REVOKE');--> statement-breakpoint
CREATE TYPE "basin"."relationship_operation_status" AS ENUM('PREPARED', 'AWAITING_AUTHORIZATION', 'SUBMITTED', 'CONFIRMED', 'FAILED', 'NEEDS_ATTENTION');--> statement-breakpoint
CREATE TYPE "basin"."relationship_operation_step" AS ENUM('REVIEWED', 'AUTHORIZATION_REQUIRED', 'NAMESPACE_SUBMITTED', 'REGISTRATION_SUBMITTED', 'ACCEPTANCE_SIGNED', 'ACTIVATION_SUBMITTED', 'REVOCATION_SUBMITTED', 'VERIFYING', 'COMPLETE');--> statement-breakpoint
CREATE TYPE "basin"."relationship_event_type" AS ENUM('PROPOSAL_REGISTERED', 'ACCEPTANCE_ACTIVATED', 'REVOCATION_CONFIRMED', 'EXPIRY_OBSERVED', 'SECURITY_CHANGE_OBSERVED', 'GENERATION_REPLACED');--> statement-breakpoint
CREATE TABLE "basin"."organization_namespace" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "basin"."organization_namespace_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" bigint NOT NULL,
	"basin_identity_id" bigint NOT NULL,
	"chain_id" integer NOT NULL,
	"registry_address" text NOT NULL,
	"parent_name" text NOT NULL,
	"registry_implementation_address" text NOT NULL,
	"setup_operation_id" bigint NOT NULL,
	"verification_block_number" numeric(78, 0) NOT NULL,
	"verified_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_namespace_organization_id_unique" UNIQUE("organization_id"),
	CONSTRAINT "organization_namespace_registry_address_unique" UNIQUE("registry_address"),
	CONSTRAINT "organization_namespace_chain" CHECK ("basin"."organization_namespace"."chain_id" = 11155111),
	CONSTRAINT "organization_namespace_registry_address_shape" CHECK ("basin"."organization_namespace"."registry_address" ~ '^0x[0-9a-f]{40}$'),
	CONSTRAINT "organization_namespace_implementation_address_shape" CHECK ("basin"."organization_namespace"."registry_implementation_address" ~ '^0x[0-9a-f]{40}$'),
	CONSTRAINT "organization_namespace_verification_block_range" CHECK ("basin"."organization_namespace"."verification_block_number" >= 0)
);
--> statement-breakpoint
CREATE TABLE "basin"."relationship_operation" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "basin"."relationship_operation_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"kind" "basin"."relationship_operation_kind" NOT NULL,
	"organization_id" bigint NOT NULL,
	"actor_user_id" bigint NOT NULL,
	"actor_workspace_id" bigint NOT NULL,
	"approved_payee_id" bigint,
	"identity_id" bigint,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"status" "basin"."relationship_operation_status" DEFAULT 'PREPARED' NOT NULL,
	"step" "basin"."relationship_operation_step" DEFAULT 'REVIEWED' NOT NULL,
	"review_snapshot" jsonb NOT NULL,
	"review_expires_at" timestamp with time zone NOT NULL,
	"authorization_reference" text,
	"transaction_hashes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"acceptance_payload" jsonb,
	"acceptance_signature" text,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "relationship_operation_organization_id_actor_user_id_kind_idempotency_key_unique" UNIQUE("organization_id","actor_user_id","kind","idempotency_key"),
	CONSTRAINT "relationship_operation_request_hash_shape" CHECK ("basin"."relationship_operation"."request_hash" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "relationship_operation_signature_shape" CHECK ("basin"."relationship_operation"."acceptance_signature" is null or "basin"."relationship_operation"."acceptance_signature" ~ '^0x([0-9a-f]{128}|[0-9a-f]{130})$'),
	CONSTRAINT "relationship_operation_target" CHECK ("basin"."relationship_operation"."kind" = 'SETUP_NAMESPACE' or ("basin"."relationship_operation"."approved_payee_id" is not null and "basin"."relationship_operation"."identity_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "basin"."relationship_event" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "basin"."relationship_event_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"operation_id" bigint NOT NULL,
	"approved_payee_id" bigint NOT NULL,
	"generation_id" bigint,
	"event_type" "basin"."relationship_event_type" NOT NULL,
	"actor_user_id" bigint,
	"occurred_at" timestamp with time zone NOT NULL,
	"evidence" jsonb NOT NULL,
	"transaction_hash" text,
	"log_index" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "relationship_event_operation_id_event_type_unique" UNIQUE("operation_id","event_type"),
	CONSTRAINT "relationship_event_transaction_hash_log_index_unique" UNIQUE("transaction_hash","log_index")
);
--> statement-breakpoint
ALTER TABLE "basin"."organization_namespace" ADD CONSTRAINT "organization_namespace_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "basin"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."organization_namespace" ADD CONSTRAINT "organization_namespace_basin_identity_id_basin_identity_id_fk" FOREIGN KEY ("basin_identity_id") REFERENCES "basin"."basin_identity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."relationship_operation" ADD CONSTRAINT "relationship_operation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "basin"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."relationship_operation" ADD CONSTRAINT "relationship_operation_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "basin"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."relationship_operation" ADD CONSTRAINT "relationship_operation_actor_workspace_id_workspace_id_fk" FOREIGN KEY ("actor_workspace_id") REFERENCES "basin"."workspace"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."relationship_operation" ADD CONSTRAINT "relationship_operation_approved_payee_id_approved_payee_id_fk" FOREIGN KEY ("approved_payee_id") REFERENCES "basin"."approved_payee"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."relationship_operation" ADD CONSTRAINT "relationship_operation_identity_id_basin_identity_id_fk" FOREIGN KEY ("identity_id") REFERENCES "basin"."basin_identity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."relationship_event" ADD CONSTRAINT "relationship_event_operation_id_relationship_operation_id_fk" FOREIGN KEY ("operation_id") REFERENCES "basin"."relationship_operation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."relationship_event" ADD CONSTRAINT "relationship_event_approved_payee_id_approved_payee_id_fk" FOREIGN KEY ("approved_payee_id") REFERENCES "basin"."approved_payee"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."relationship_event" ADD CONSTRAINT "relationship_event_generation_id_approved_payee_generation_id_fk" FOREIGN KEY ("generation_id") REFERENCES "basin"."approved_payee_generation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."relationship_event" ADD CONSTRAINT "relationship_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "basin"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "relationship_operation_approved_payee_id_updated_at_index" ON "basin"."relationship_operation" USING btree ("approved_payee_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "relationship_operation_unresolved_relationship" ON "basin"."relationship_operation" USING btree ("approved_payee_id") WHERE "basin"."relationship_operation"."approved_payee_id" is not null and "basin"."relationship_operation"."status" in ('PREPARED', 'AWAITING_AUTHORIZATION', 'SUBMITTED', 'NEEDS_ATTENTION');
