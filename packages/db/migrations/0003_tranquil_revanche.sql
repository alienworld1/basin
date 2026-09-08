CREATE TYPE "basin"."treasury_operation_status" AS ENUM('IN_PROGRESS', 'AWAITING_APPROVAL', 'COMPLETED', 'FAILED_RETRYABLE', 'FAILED_FINAL');--> statement-breakpoint
CREATE TYPE "basin"."treasury_operation_step" AS ENUM('STARTED', 'OWNER_QUORUM_VERIFIED', 'ORGANIZATION_VERIFIED', 'WALLET_VERIFIED', 'ROUTINE_SIGNER_VERIFIED', 'POLICY_VERIFIED', 'COMPLETE');--> statement-breakpoint
CREATE TYPE "basin"."treasury_operation_type" AS ENUM('PROVISION_TREASURY', 'ATTACH_ROUTINE_POLICY', 'RECONCILE_TREASURY', 'PROCESS_INTENT');--> statement-breakpoint
CREATE TYPE "basin"."treasury_status" AS ENUM('NOT_STARTED', 'PROVISIONING', 'CONTROL_READY', 'AWAITING_APPROVAL', 'READY', 'NEEDS_ATTENTION', 'FAILED');--> statement-breakpoint
CREATE TYPE "basin"."webhook_processing_status" AS ENUM('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED_RETRYABLE');--> statement-breakpoint
CREATE TABLE "basin"."organization_treasury" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "basin"."organization_treasury_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" bigint NOT NULL,
	"status" "basin"."treasury_status" DEFAULT 'NOT_STARTED' NOT NULL,
	"privy_wallet_id" text,
	"wallet_address" text,
	"chain_type" text,
	"owner_quorum_id" text,
	"owner_quorum_threshold" integer,
	"routine_signer_id" text,
	"routine_policy_id" text,
	"routine_policy_owner_id" text,
	"routine_policy_fingerprint" text,
	"router_address" text,
	"router_version" text,
	"routine_per_tx_limit_base_units" numeric(78, 0),
	"last_verified_at" timestamp with time zone,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_treasury_organization_id_unique" UNIQUE("organization_id"),
	CONSTRAINT "organization_treasury_privy_wallet_id_unique" UNIQUE("privy_wallet_id"),
	CONSTRAINT "organization_treasury_wallet_address_unique" UNIQUE("wallet_address"),
	CONSTRAINT "organization_treasury_chain_type" CHECK ("basin"."organization_treasury"."chain_type" is null or "basin"."organization_treasury"."chain_type" = 'ethereum'),
	CONSTRAINT "organization_treasury_owner_threshold" CHECK ("basin"."organization_treasury"."owner_quorum_threshold" is null or "basin"."organization_treasury"."owner_quorum_threshold" > 0),
	CONSTRAINT "organization_treasury_wallet_address" CHECK ("basin"."organization_treasury"."wallet_address" is null or "basin"."organization_treasury"."wallet_address" ~ '^0x[0-9a-f]{40}$'),
	CONSTRAINT "organization_treasury_policy_fingerprint" CHECK ("basin"."organization_treasury"."routine_policy_fingerprint" is null or "basin"."organization_treasury"."routine_policy_fingerprint" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "organization_treasury_limit" CHECK ("basin"."organization_treasury"."routine_per_tx_limit_base_units" is null or "basin"."organization_treasury"."routine_per_tx_limit_base_units" > 0)
);
--> statement-breakpoint
CREATE TABLE "basin"."privy_provisioning_operation" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "basin"."privy_provisioning_operation_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" bigint NOT NULL,
	"idempotency_key" text NOT NULL,
	"operation_type" "basin"."treasury_operation_type" NOT NULL,
	"step" "basin"."treasury_operation_step" DEFAULT 'STARTED' NOT NULL,
	"status" "basin"."treasury_operation_status" DEFAULT 'IN_PROGRESS' NOT NULL,
	"privy_intent_id" text,
	"request_fingerprint" text NOT NULL,
	"safe_error_code" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "privy_provisioning_operation_organization_id_operation_type_idempotency_key_unique" UNIQUE("organization_id","operation_type","idempotency_key"),
	CONSTRAINT "privy_provisioning_operation_privy_intent_id_unique" UNIQUE("privy_intent_id"),
	CONSTRAINT "privy_operation_idempotency_length" CHECK (length("basin"."privy_provisioning_operation"."idempotency_key") between 16 and 160),
	CONSTRAINT "privy_operation_fingerprint" CHECK ("basin"."privy_provisioning_operation"."request_fingerprint" ~ '^0x[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "basin"."privy_webhook_receipt" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "basin"."privy_webhook_receipt_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"delivery_id" text NOT NULL,
	"event_type" text NOT NULL,
	"resource_id" text,
	"organization_id" bigint,
	"payload_hash" text NOT NULL,
	"processing_status" "basin"."webhook_processing_status" DEFAULT 'RECEIVED' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "privy_webhook_receipt_delivery_id_unique" UNIQUE("delivery_id"),
	CONSTRAINT "privy_webhook_delivery_length" CHECK (length("basin"."privy_webhook_receipt"."delivery_id") between 1 and 240),
	CONSTRAINT "privy_webhook_payload_hash" CHECK ("basin"."privy_webhook_receipt"."payload_hash" ~ '^0x[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "basin"."routine_signer_secret" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "basin"."routine_signer_secret_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" bigint NOT NULL,
	"public_key" text NOT NULL,
	"public_key_fingerprint" text NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"auth_tag" text NOT NULL,
	"key_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "routine_signer_secret_organization_id_unique" UNIQUE("organization_id"),
	CONSTRAINT "routine_signer_secret_public_key_fingerprint_unique" UNIQUE("public_key_fingerprint"),
	CONSTRAINT "routine_signer_public_fingerprint" CHECK ("basin"."routine_signer_secret"."public_key_fingerprint" ~ '^0x[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "basin"."organization_treasury" ADD CONSTRAINT "organization_treasury_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "basin"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."privy_provisioning_operation" ADD CONSTRAINT "privy_provisioning_operation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "basin"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."privy_webhook_receipt" ADD CONSTRAINT "privy_webhook_receipt_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "basin"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."routine_signer_secret" ADD CONSTRAINT "routine_signer_secret_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "basin"."organization"("id") ON DELETE restrict ON UPDATE no action;