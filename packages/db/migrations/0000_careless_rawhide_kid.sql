CREATE SCHEMA "basin";
--> statement-breakpoint
CREATE TYPE "basin"."generation_end_reason" AS ENUM('REVOKED', 'EXPIRED', 'REPLACED', 'SECURITY_ROOT_CHANGED');--> statement-breakpoint
CREATE TYPE "basin"."payment_event_type" AS ENUM('CREATED', 'AUTHORITY_VALIDATION_STARTED', 'BLOCKED', 'AUTHORITY_VALIDATED', 'APPROVAL_REQUESTED', 'EXECUTION_STARTED', 'EXECUTION_FAILED', 'SETTLEMENT_CONFIRMED');--> statement-breakpoint
CREATE TYPE "basin"."execution_path" AS ENUM('ROUTINE_SIGNER', 'PRIVY_INTENT');--> statement-breakpoint
CREATE TYPE "basin"."idempotency_scope" AS ENUM('CREATE_PAYMENT');--> statement-breakpoint
CREATE TYPE "basin"."idempotency_status" AS ENUM('IN_PROGRESS', 'COMPLETED', 'FAILED_RETRYABLE');--> statement-breakpoint
CREATE TYPE "basin"."identity_status" AS ENUM('PENDING', 'ACTIVE', 'FAILED', 'REAPPROVAL_REQUIRED');--> statement-breakpoint
CREATE TYPE "basin"."member_role" AS ENUM('ADMIN', 'PAYMENT_OPERATOR');--> statement-breakpoint
CREATE TYPE "basin"."obligation_status" AS ENUM('PENDING', 'ACTIVE', 'CONSUMED', 'CANCELLED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "basin"."payee_status" AS ENUM('PENDING', 'ACTIVE', 'EXPIRED', 'REVOKED', 'REAPPROVAL_REQUIRED');--> statement-breakpoint
CREATE TYPE "basin"."payment_status" AS ENUM('DRAFT', 'VALIDATING_AUTHORITY', 'BLOCKED', 'READY', 'AWAITING_APPROVAL', 'EXECUTING', 'FAILED', 'SETTLED');--> statement-breakpoint
CREATE TYPE "basin"."workspace_type" AS ENUM('PERSONAL', 'ORGANIZATION');--> statement-breakpoint
CREATE TABLE "basin"."user" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "basin"."user_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"privy_user_id" text NOT NULL,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_privy_user_id_unique" UNIQUE("privy_user_id"),
	CONSTRAINT "user_privy_user_id_length" CHECK (length("basin"."user"."privy_user_id") between 1 and 240),
	CONSTRAINT "user_display_name_length" CHECK (length("basin"."user"."display_name") <= 120 and length(btrim("basin"."user"."display_name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "basin"."workspace" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "basin"."workspace_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"type" "basin"."workspace_type" NOT NULL,
	"display_name" text NOT NULL,
	"owner_user_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_display_name_length" CHECK (length("basin"."workspace"."display_name") <= 120 and length(btrim("basin"."workspace"."display_name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "basin"."organization" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "basin"."organization_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"workspace_id" bigint NOT NULL,
	"privy_organization_id" text,
	"basin_identity_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_workspace_id_unique" UNIQUE("workspace_id"),
	CONSTRAINT "organization_privy_organization_id_unique" UNIQUE("privy_organization_id"),
	CONSTRAINT "organization_basin_identity_id_unique" UNIQUE("basin_identity_id"),
	CONSTRAINT "organization_privy_organization_id_length" CHECK (length("basin"."organization"."privy_organization_id") between 1 and 240)
);
--> statement-breakpoint
CREATE TABLE "basin"."organization_member" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "basin"."organization_member_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"role" "basin"."member_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_member_organization_id_user_id_unique" UNIQUE("organization_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "basin"."basin_identity" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "basin"."basin_identity_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"workspace_id" bigint NOT NULL,
	"payee_id" text NOT NULL,
	"label" text NOT NULL,
	"ens_name" text NOT NULL,
	"identity_epoch" numeric(78, 0) NOT NULL,
	"controller_address" text NOT NULL,
	"resolver_address" text NOT NULL,
	"protocol_status" "basin"."identity_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "basin_identity_workspace_id_unique" UNIQUE("workspace_id"),
	CONSTRAINT "basin_identity_payee_id_unique" UNIQUE("payee_id"),
	CONSTRAINT "basin_identity_ens_name_unique" UNIQUE("ens_name"),
	CONSTRAINT "basin_identity_payee_id_shape" CHECK ("basin"."basin_identity"."payee_id" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "basin_identity_identity_epoch_range" CHECK ("basin"."basin_identity"."identity_epoch" >= 0),
	CONSTRAINT "basin_identity_controller_address_shape" CHECK ("basin"."basin_identity"."controller_address" ~ '^0x[0-9a-f]{40}$'),
	CONSTRAINT "basin_identity_resolver_address_shape" CHECK ("basin"."basin_identity"."resolver_address" ~ '^0x[0-9a-f]{40}$')
);
--> statement-breakpoint
CREATE TABLE "basin"."identity_authority_version" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "basin"."identity_authority_version_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"basin_identity_id" bigint NOT NULL,
	"identity_epoch" numeric(78, 0) NOT NULL,
	"controller_address" text NOT NULL,
	"identity_resolver_address" text NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"superseded_at" timestamp with time zone,
	"evidence_transaction_hash" text,
	"evidence_block_number" numeric(78, 0) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identity_authority_version_basin_identity_id_identity_epoch_unique" UNIQUE("basin_identity_id","identity_epoch"),
	CONSTRAINT "identity_authority_version_identity_epoch_range" CHECK ("basin"."identity_authority_version"."identity_epoch" >= 0),
	CONSTRAINT "identity_authority_version_controller_address_shape" CHECK ("basin"."identity_authority_version"."controller_address" ~ '^0x[0-9a-f]{40}$'),
	CONSTRAINT "identity_authority_version_identity_resolver_address_shape" CHECK ("basin"."identity_authority_version"."identity_resolver_address" ~ '^0x[0-9a-f]{40}$'),
	CONSTRAINT "identity_authority_version_evidence_transaction_hash_shape" CHECK ("basin"."identity_authority_version"."evidence_transaction_hash" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "identity_authority_version_evidence_block_number_range" CHECK ("basin"."identity_authority_version"."evidence_block_number" >= 0),
	CONSTRAINT "identity_version_time" CHECK ("basin"."identity_authority_version"."superseded_at" is null or "basin"."identity_authority_version"."superseded_at" >= "basin"."identity_authority_version"."valid_from")
);
--> statement-breakpoint
CREATE TABLE "basin"."approved_payee" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "basin"."approved_payee_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" bigint NOT NULL,
	"basin_identity_id" bigint NOT NULL,
	"relationship_name" text,
	"status" "basin"."payee_status" NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revocation_cause" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approved_payee_organization_id_basin_identity_id_unique" UNIQUE("organization_id","basin_identity_id"),
	CONSTRAINT "approved_payee_id_organization_id_unique" UNIQUE("id","organization_id"),
	CONSTRAINT "approved_payee_revocation_cause_length" CHECK (length("basin"."approved_payee"."revocation_cause") between 1 and 240),
	CONSTRAINT "payee_revocation" CHECK (("basin"."approved_payee"."status" = 'REVOKED') = ("basin"."approved_payee"."revoked_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "basin"."approved_payee_generation" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "basin"."approved_payee_generation_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"approved_payee_id" bigint NOT NULL,
	"relationship_token_id" numeric(78, 0) NOT NULL,
	"generation_number" integer NOT NULL,
	"registered_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"end_reason" "basin"."generation_end_reason",
	"relationship_namehash" text NOT NULL,
	"relationship_registry_address" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approved_payee_generation_approved_payee_id_relationship_token_id_unique" UNIQUE("approved_payee_id","relationship_token_id"),
	CONSTRAINT "approved_payee_generation_approved_payee_id_generation_number_unique" UNIQUE("approved_payee_id","generation_number"),
	CONSTRAINT "approved_payee_generation_id_approved_payee_id_unique" UNIQUE("id","approved_payee_id"),
	CONSTRAINT "approved_payee_generation_relationship_token_id_range" CHECK ("basin"."approved_payee_generation"."relationship_token_id" >= 0),
	CONSTRAINT "approved_payee_generation_generation_number_range" CHECK ("basin"."approved_payee_generation"."generation_number" > 0),
	CONSTRAINT "approved_payee_generation_relationship_namehash_shape" CHECK ("basin"."approved_payee_generation"."relationship_namehash" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "approved_payee_generation_relationship_registry_address_shape" CHECK ("basin"."approved_payee_generation"."relationship_registry_address" ~ '^0x[0-9a-f]{40}$'),
	CONSTRAINT "generation_ending" CHECK (("basin"."approved_payee_generation"."ended_at" is null) = ("basin"."approved_payee_generation"."end_reason" is null)),
	CONSTRAINT "generation_expiry" CHECK ("basin"."approved_payee_generation"."expires_at" > "basin"."approved_payee_generation"."registered_at")
);
--> statement-breakpoint
CREATE TABLE "basin"."approved_security_root" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "basin"."approved_security_root_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"approved_payee_generation_id" bigint NOT NULL,
	"payee_id" text NOT NULL,
	"identity_controller" text NOT NULL,
	"identity_epoch" numeric(78, 0) NOT NULL,
	"organization_wallet_address" text NOT NULL,
	"relationship_registry_address" text NOT NULL,
	"relationship_token_id" numeric(78, 0) NOT NULL,
	"resolver_proxy_address" text NOT NULL,
	"resolver_implementation_address" text NOT NULL,
	"resolver_implementation_code_hash" text NOT NULL,
	"resolver_permission_profile_hash" text NOT NULL,
	"registry_permission_profile_hash" text NOT NULL,
	"security_root_commitment" text NOT NULL,
	"acceptance_chain_id" integer NOT NULL,
	"acceptance_verifying_contract" text NOT NULL,
	"acceptance_message_hash" text NOT NULL,
	"acceptance_nonce" numeric(78, 0) NOT NULL,
	"accepted_relationship_expiry" timestamp with time zone NOT NULL,
	"recipient_acceptance_signature" text NOT NULL,
	"activation_transaction_hash" text NOT NULL,
	"activation_block_number" numeric(78, 0) NOT NULL,
	"activation_log_index" integer NOT NULL,
	"activated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approved_security_root_approved_payee_generation_id_unique" UNIQUE("approved_payee_generation_id"),
	CONSTRAINT "approved_security_root_approved_payee_generation_id_security_root_commitment_unique" UNIQUE("approved_payee_generation_id","security_root_commitment"),
	CONSTRAINT "approved_security_root_activation_transaction_hash_activation_log_index_unique" UNIQUE("activation_transaction_hash","activation_log_index"),
	CONSTRAINT "approved_security_root_id_approved_payee_generation_id_unique" UNIQUE("id","approved_payee_generation_id"),
	CONSTRAINT "approved_security_root_payee_id_shape" CHECK ("basin"."approved_security_root"."payee_id" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "approved_security_root_identity_controller_shape" CHECK ("basin"."approved_security_root"."identity_controller" ~ '^0x[0-9a-f]{40}$'),
	CONSTRAINT "approved_security_root_identity_epoch_range" CHECK ("basin"."approved_security_root"."identity_epoch" >= 0),
	CONSTRAINT "approved_security_root_organization_wallet_address_shape" CHECK ("basin"."approved_security_root"."organization_wallet_address" ~ '^0x[0-9a-f]{40}$'),
	CONSTRAINT "approved_security_root_relationship_registry_address_shape" CHECK ("basin"."approved_security_root"."relationship_registry_address" ~ '^0x[0-9a-f]{40}$'),
	CONSTRAINT "approved_security_root_relationship_token_id_range" CHECK ("basin"."approved_security_root"."relationship_token_id" >= 0),
	CONSTRAINT "approved_security_root_resolver_proxy_address_shape" CHECK ("basin"."approved_security_root"."resolver_proxy_address" ~ '^0x[0-9a-f]{40}$'),
	CONSTRAINT "approved_security_root_resolver_implementation_address_shape" CHECK ("basin"."approved_security_root"."resolver_implementation_address" ~ '^0x[0-9a-f]{40}$'),
	CONSTRAINT "approved_security_root_resolver_implementation_code_hash_shape" CHECK ("basin"."approved_security_root"."resolver_implementation_code_hash" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "approved_security_root_resolver_permission_profile_hash_shape" CHECK ("basin"."approved_security_root"."resolver_permission_profile_hash" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "approved_security_root_registry_permission_profile_hash_shape" CHECK ("basin"."approved_security_root"."registry_permission_profile_hash" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "approved_security_root_security_root_commitment_shape" CHECK ("basin"."approved_security_root"."security_root_commitment" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "approved_security_root_acceptance_chain_id_range" CHECK ("basin"."approved_security_root"."acceptance_chain_id" >= 0),
	CONSTRAINT "approved_security_root_acceptance_verifying_contract_shape" CHECK ("basin"."approved_security_root"."acceptance_verifying_contract" ~ '^0x[0-9a-f]{40}$'),
	CONSTRAINT "approved_security_root_acceptance_message_hash_shape" CHECK ("basin"."approved_security_root"."acceptance_message_hash" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "approved_security_root_acceptance_nonce_range" CHECK ("basin"."approved_security_root"."acceptance_nonce" >= 0),
	CONSTRAINT "approved_security_root_recipient_acceptance_signature_shape" CHECK ("basin"."approved_security_root"."recipient_acceptance_signature" ~ '^0x([0-9a-f]{128}|[0-9a-f]{130})$'),
	CONSTRAINT "approved_security_root_activation_transaction_hash_shape" CHECK ("basin"."approved_security_root"."activation_transaction_hash" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "approved_security_root_activation_block_number_range" CHECK ("basin"."approved_security_root"."activation_block_number" >= 0),
	CONSTRAINT "approved_security_root_activation_log_index_range" CHECK ("basin"."approved_security_root"."activation_log_index" >= 0)
);
--> statement-breakpoint
CREATE TABLE "basin"."settlement_version" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "basin"."settlement_version_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"approved_payee_generation_id" bigint NOT NULL,
	"approved_security_root_id" bigint NOT NULL,
	"settlement_epoch" numeric(78, 0) NOT NULL,
	"commitment" text NOT NULL,
	"descriptor_version" integer NOT NULL,
	"chain_id" integer NOT NULL,
	"asset_address" text NOT NULL,
	"destination_ciphertext" text,
	"destination_fingerprint" text,
	"valid_from" timestamp with time zone NOT NULL,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settlement_version_approved_payee_generation_id_settlement_epoch_unique" UNIQUE("approved_payee_generation_id","settlement_epoch"),
	CONSTRAINT "settlement_version_id_approved_payee_generation_id_approved_security_root_id_unique" UNIQUE("id","approved_payee_generation_id","approved_security_root_id"),
	CONSTRAINT "settlement_version_settlement_epoch_range" CHECK ("basin"."settlement_version"."settlement_epoch" >= 0),
	CONSTRAINT "settlement_version_commitment_shape" CHECK ("basin"."settlement_version"."commitment" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "settlement_version_descriptor_version_range" CHECK ("basin"."settlement_version"."descriptor_version" > 0),
	CONSTRAINT "settlement_version_chain_id_range" CHECK ("basin"."settlement_version"."chain_id" >= 0),
	CONSTRAINT "settlement_version_asset_address_shape" CHECK ("basin"."settlement_version"."asset_address" ~ '^0x[0-9a-f]{40}$'),
	CONSTRAINT "settlement_version_destination_ciphertext_length" CHECK (length("basin"."settlement_version"."destination_ciphertext") between 1 and 240),
	CONSTRAINT "settlement_version_destination_fingerprint_length" CHECK (length("basin"."settlement_version"."destination_fingerprint") between 1 and 240),
	CONSTRAINT "settlement_time" CHECK ("basin"."settlement_version"."superseded_at" is null or "basin"."settlement_version"."superseded_at" >= "basin"."settlement_version"."valid_from")
);
--> statement-breakpoint
CREATE TABLE "basin"."obligation" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "basin"."obligation_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"obligation_id" text NOT NULL,
	"organization_id" bigint NOT NULL,
	"organization_wallet_address" text NOT NULL,
	"approved_payee_id" bigint NOT NULL,
	"approved_payee_generation_id" bigint NOT NULL,
	"max_amount_base_units" numeric(78, 0) NOT NULL,
	"remaining_amount_base_units" numeric(78, 0) NOT NULL,
	"asset_address" text NOT NULL,
	"purpose" text NOT NULL,
	"external_reference" text,
	"expected_at" timestamp with time zone,
	"valid_until" timestamp with time zone NOT NULL,
	"metadata_hash" text NOT NULL,
	"router_address" text NOT NULL,
	"router_version" text NOT NULL,
	"status" "basin"."obligation_status" NOT NULL,
	"creation_transaction_hash" text,
	"creation_block_number" numeric(78, 0),
	"creation_log_index" integer,
	"created_by_member_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "obligation_obligation_id_unique" UNIQUE("obligation_id"),
	CONSTRAINT "obligation_id_organization_id_approved_payee_id_approved_payee_generation_id_unique" UNIQUE("id","organization_id","approved_payee_id","approved_payee_generation_id"),
	CONSTRAINT "obligation_obligation_id_shape" CHECK ("basin"."obligation"."obligation_id" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "obligation_organization_wallet_address_shape" CHECK ("basin"."obligation"."organization_wallet_address" ~ '^0x[0-9a-f]{40}$'),
	CONSTRAINT "obligation_max_amount_base_units_range" CHECK ("basin"."obligation"."max_amount_base_units" > 0),
	CONSTRAINT "obligation_remaining_amount_base_units_range" CHECK ("basin"."obligation"."remaining_amount_base_units" >= 0),
	CONSTRAINT "obligation_asset_address_shape" CHECK ("basin"."obligation"."asset_address" ~ '^0x[0-9a-f]{40}$'),
	CONSTRAINT "obligation_purpose_length" CHECK (length("basin"."obligation"."purpose") <= 240 and length(btrim("basin"."obligation"."purpose")) > 0),
	CONSTRAINT "obligation_external_reference_length" CHECK (length("basin"."obligation"."external_reference") <= 160),
	CONSTRAINT "obligation_metadata_hash_shape" CHECK ("basin"."obligation"."metadata_hash" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "obligation_router_address_shape" CHECK ("basin"."obligation"."router_address" ~ '^0x[0-9a-f]{40}$'),
	CONSTRAINT "obligation_router_version_length" CHECK (length("basin"."obligation"."router_version") between 1 and 240),
	CONSTRAINT "obligation_creation_transaction_hash_shape" CHECK ("basin"."obligation"."creation_transaction_hash" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "obligation_creation_block_number_range" CHECK ("basin"."obligation"."creation_block_number" >= 0),
	CONSTRAINT "obligation_creation_log_index_range" CHECK ("basin"."obligation"."creation_log_index" >= 0),
	CONSTRAINT "obligation_capacity" CHECK ("basin"."obligation"."remaining_amount_base_units" <= "basin"."obligation"."max_amount_base_units" and ("basin"."obligation"."status" != 'CONSUMED' or "basin"."obligation"."remaining_amount_base_units" = 0) and ("basin"."obligation"."status" != 'ACTIVE' or ("basin"."obligation"."remaining_amount_base_units" > 0 and "basin"."obligation"."creation_transaction_hash" is not null and "basin"."obligation"."creation_block_number" is not null and "basin"."obligation"."creation_log_index" is not null)))
);
--> statement-breakpoint
CREATE TABLE "basin"."payment" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "basin"."payment_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"payment_id" text NOT NULL,
	"organization_id" bigint NOT NULL,
	"approved_payee_id" bigint NOT NULL,
	"approved_payee_generation_id" bigint NOT NULL,
	"obligation_record_id" bigint NOT NULL,
	"amount_base_units" numeric(78, 0) NOT NULL,
	"asset_address" text NOT NULL,
	"purpose" text NOT NULL,
	"external_reference" text,
	"status" "basin"."payment_status" NOT NULL,
	"blocked_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "payment_payment_id_unique" UNIQUE("payment_id"),
	CONSTRAINT "payment_payment_id_shape" CHECK ("basin"."payment"."payment_id" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "payment_amount_base_units_range" CHECK ("basin"."payment"."amount_base_units" > 0),
	CONSTRAINT "payment_asset_address_shape" CHECK ("basin"."payment"."asset_address" ~ '^0x[0-9a-f]{40}$'),
	CONSTRAINT "payment_purpose_length" CHECK (length("basin"."payment"."purpose") <= 240 and length(btrim("basin"."payment"."purpose")) > 0),
	CONSTRAINT "payment_external_reference_length" CHECK (length("basin"."payment"."external_reference") <= 160),
	CONSTRAINT "payment_blocked_reason_length" CHECK (length("basin"."payment"."blocked_reason") between 1 and 240),
	CONSTRAINT "payment_state_fields" CHECK (("basin"."payment"."status" = 'SETTLED') = ("basin"."payment"."settled_at" is not null) and ("basin"."payment"."status" != 'BLOCKED' or "basin"."payment"."blocked_reason" is not null))
);
--> statement-breakpoint
CREATE TABLE "basin"."payment_event" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "basin"."payment_event_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"payment_id" bigint NOT NULL,
	"sequence" integer NOT NULL,
	"type" "basin"."payment_event_type" NOT NULL,
	"from_status" "basin"."payment_status",
	"to_status" "basin"."payment_status" NOT NULL,
	"reason_code" text,
	"safe_metadata" jsonb,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_event_payment_id_sequence_unique" UNIQUE("payment_id","sequence"),
	CONSTRAINT "payment_event_sequence_range" CHECK ("basin"."payment_event"."sequence" > 0),
	CONSTRAINT "payment_event_reason_code_length" CHECK (length("basin"."payment_event"."reason_code") between 1 and 240)
);
--> statement-breakpoint
CREATE TABLE "basin"."payment_authority_snapshot" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "basin"."payment_authority_snapshot_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"payment_id" bigint NOT NULL,
	"approved_payee_generation_id" bigint NOT NULL,
	"approved_security_root_id" bigint NOT NULL,
	"settlement_version_id" bigint NOT NULL,
	"relationship_name" text NOT NULL,
	"relationship_token_id" numeric(78, 0) NOT NULL,
	"relationship_expiry" timestamp with time zone NOT NULL,
	"relationship_status" "basin"."payee_status" NOT NULL,
	"global_payee_name" text NOT NULL,
	"payee_id" text NOT NULL,
	"identity_controller" text NOT NULL,
	"identity_epoch" numeric(78, 0) NOT NULL,
	"relationship_registry_address" text NOT NULL,
	"resolver_proxy_address" text NOT NULL,
	"resolver_implementation_address" text NOT NULL,
	"resolver_implementation_code_hash" text NOT NULL,
	"resolver_permission_profile_hash" text NOT NULL,
	"registry_permission_profile_hash" text NOT NULL,
	"security_root_commitment" text NOT NULL,
	"settlement_epoch" numeric(78, 0) NOT NULL,
	"settlement_commitment" text NOT NULL,
	"obligation_protocol_id" text NOT NULL,
	"obligation_metadata_hash" text NOT NULL,
	"obligation_max_amount_base_units" numeric(78, 0) NOT NULL,
	"obligation_remaining_before_base_units" numeric(78, 0) NOT NULL,
	"obligation_remaining_after_base_units" numeric(78, 0) NOT NULL,
	"obligation_valid_until" timestamp with time zone NOT NULL,
	"organization_wallet_address" text NOT NULL,
	"router_address" text NOT NULL,
	"router_version" text NOT NULL,
	"execution_path" "basin"."execution_path" NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	CONSTRAINT "payment_authority_snapshot_payment_id_unique" UNIQUE("payment_id"),
	CONSTRAINT "payment_authority_snapshot_id_payment_id_unique" UNIQUE("id","payment_id"),
	CONSTRAINT "payment_authority_snapshot_relationship_token_id_range" CHECK ("basin"."payment_authority_snapshot"."relationship_token_id" >= 0),
	CONSTRAINT "payment_authority_snapshot_payee_id_shape" CHECK ("basin"."payment_authority_snapshot"."payee_id" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "payment_authority_snapshot_identity_controller_shape" CHECK ("basin"."payment_authority_snapshot"."identity_controller" ~ '^0x[0-9a-f]{40}$'),
	CONSTRAINT "payment_authority_snapshot_identity_epoch_range" CHECK ("basin"."payment_authority_snapshot"."identity_epoch" >= 0),
	CONSTRAINT "payment_authority_snapshot_relationship_registry_address_shape" CHECK ("basin"."payment_authority_snapshot"."relationship_registry_address" ~ '^0x[0-9a-f]{40}$'),
	CONSTRAINT "payment_authority_snapshot_resolver_proxy_address_shape" CHECK ("basin"."payment_authority_snapshot"."resolver_proxy_address" ~ '^0x[0-9a-f]{40}$'),
	CONSTRAINT "payment_authority_snapshot_resolver_implementation_address_shape" CHECK ("basin"."payment_authority_snapshot"."resolver_implementation_address" ~ '^0x[0-9a-f]{40}$'),
	CONSTRAINT "payment_authority_snapshot_resolver_implementation_code_hash_shape" CHECK ("basin"."payment_authority_snapshot"."resolver_implementation_code_hash" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "payment_authority_snapshot_resolver_permission_profile_hash_shape" CHECK ("basin"."payment_authority_snapshot"."resolver_permission_profile_hash" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "payment_authority_snapshot_registry_permission_profile_hash_shape" CHECK ("basin"."payment_authority_snapshot"."registry_permission_profile_hash" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "payment_authority_snapshot_security_root_commitment_shape" CHECK ("basin"."payment_authority_snapshot"."security_root_commitment" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "payment_authority_snapshot_settlement_epoch_range" CHECK ("basin"."payment_authority_snapshot"."settlement_epoch" >= 0),
	CONSTRAINT "payment_authority_snapshot_settlement_commitment_shape" CHECK ("basin"."payment_authority_snapshot"."settlement_commitment" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "payment_authority_snapshot_obligation_protocol_id_shape" CHECK ("basin"."payment_authority_snapshot"."obligation_protocol_id" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "payment_authority_snapshot_obligation_metadata_hash_shape" CHECK ("basin"."payment_authority_snapshot"."obligation_metadata_hash" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "payment_authority_snapshot_obligation_max_amount_base_units_range" CHECK ("basin"."payment_authority_snapshot"."obligation_max_amount_base_units" > 0),
	CONSTRAINT "payment_authority_snapshot_obligation_remaining_before_base_units_range" CHECK ("basin"."payment_authority_snapshot"."obligation_remaining_before_base_units" > 0),
	CONSTRAINT "payment_authority_snapshot_obligation_remaining_after_base_units_range" CHECK ("basin"."payment_authority_snapshot"."obligation_remaining_after_base_units" >= 0),
	CONSTRAINT "payment_authority_snapshot_organization_wallet_address_shape" CHECK ("basin"."payment_authority_snapshot"."organization_wallet_address" ~ '^0x[0-9a-f]{40}$'),
	CONSTRAINT "payment_authority_snapshot_router_address_shape" CHECK ("basin"."payment_authority_snapshot"."router_address" ~ '^0x[0-9a-f]{40}$'),
	CONSTRAINT "payment_authority_snapshot_router_version_length" CHECK (length("basin"."payment_authority_snapshot"."router_version") between 1 and 240),
	CONSTRAINT "snapshot_capacity" CHECK ("basin"."payment_authority_snapshot"."obligation_remaining_before_base_units" <= "basin"."payment_authority_snapshot"."obligation_max_amount_base_units" and "basin"."payment_authority_snapshot"."obligation_remaining_after_base_units" < "basin"."payment_authority_snapshot"."obligation_remaining_before_base_units")
);
--> statement-breakpoint
CREATE TABLE "basin"."receipt" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "basin"."receipt_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"payment_id" bigint NOT NULL,
	"authority_snapshot_id" bigint NOT NULL,
	"payer_organization_name" text NOT NULL,
	"payee_display_name" text NOT NULL,
	"amount_base_units" numeric(78, 0) NOT NULL,
	"asset_address" text NOT NULL,
	"asset_symbol" text NOT NULL,
	"purpose" text NOT NULL,
	"external_reference" text,
	"obligation_protocol_id" text NOT NULL,
	"obligation_metadata_hash" text NOT NULL,
	"security_root_commitment" text NOT NULL,
	"transaction_hash" text NOT NULL,
	"chain_id" integer NOT NULL,
	"router_address" text NOT NULL,
	"router_version" text NOT NULL,
	"settled_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receipt_payment_id_unique" UNIQUE("payment_id"),
	CONSTRAINT "receipt_authority_snapshot_id_unique" UNIQUE("authority_snapshot_id"),
	CONSTRAINT "receipt_payer_organization_name_length" CHECK (length("basin"."receipt"."payer_organization_name") <= 120 and length(btrim("basin"."receipt"."payer_organization_name")) > 0),
	CONSTRAINT "receipt_payee_display_name_length" CHECK (length("basin"."receipt"."payee_display_name") <= 120 and length(btrim("basin"."receipt"."payee_display_name")) > 0),
	CONSTRAINT "receipt_amount_base_units_range" CHECK ("basin"."receipt"."amount_base_units" > 0),
	CONSTRAINT "receipt_asset_address_shape" CHECK ("basin"."receipt"."asset_address" ~ '^0x[0-9a-f]{40}$'),
	CONSTRAINT "receipt_asset_symbol_length" CHECK (length("basin"."receipt"."asset_symbol") between 1 and 240),
	CONSTRAINT "receipt_purpose_length" CHECK (length("basin"."receipt"."purpose") <= 240 and length(btrim("basin"."receipt"."purpose")) > 0),
	CONSTRAINT "receipt_external_reference_length" CHECK (length("basin"."receipt"."external_reference") <= 160),
	CONSTRAINT "receipt_obligation_protocol_id_shape" CHECK ("basin"."receipt"."obligation_protocol_id" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "receipt_obligation_metadata_hash_shape" CHECK ("basin"."receipt"."obligation_metadata_hash" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "receipt_security_root_commitment_shape" CHECK ("basin"."receipt"."security_root_commitment" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "receipt_transaction_hash_shape" CHECK ("basin"."receipt"."transaction_hash" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "receipt_chain_id_range" CHECK ("basin"."receipt"."chain_id" >= 0),
	CONSTRAINT "receipt_router_address_shape" CHECK ("basin"."receipt"."router_address" ~ '^0x[0-9a-f]{40}$'),
	CONSTRAINT "receipt_router_version_length" CHECK (length("basin"."receipt"."router_version") between 1 and 240)
);
--> statement-breakpoint
CREATE TABLE "basin"."idempotency_key" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "basin"."idempotency_key_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"scope" "basin"."idempotency_scope" NOT NULL,
	"organization_id" bigint NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"payment_id" bigint,
	"status" "basin"."idempotency_status" NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_key_organization_id_scope_key_unique" UNIQUE("organization_id","scope","key"),
	CONSTRAINT "idempotency_key_key_length" CHECK (length("basin"."idempotency_key"."key") between 1 and 240),
	CONSTRAINT "idempotency_key_request_hash_shape" CHECK ("basin"."idempotency_key"."request_hash" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "idempotency_completion" CHECK ("basin"."idempotency_key"."status" != 'COMPLETED' or "basin"."idempotency_key"."payment_id" is not null)
);
--> statement-breakpoint
ALTER TABLE "basin"."workspace" ADD CONSTRAINT "workspace_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "basin"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."organization" ADD CONSTRAINT "organization_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "basin"."workspace"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."organization" ADD CONSTRAINT "organization_basin_identity_id_basin_identity_id_fk" FOREIGN KEY ("basin_identity_id") REFERENCES "basin"."basin_identity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."organization_member" ADD CONSTRAINT "organization_member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "basin"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."organization_member" ADD CONSTRAINT "organization_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "basin"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."basin_identity" ADD CONSTRAINT "basin_identity_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "basin"."workspace"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."identity_authority_version" ADD CONSTRAINT "identity_authority_version_basin_identity_id_basin_identity_id_fk" FOREIGN KEY ("basin_identity_id") REFERENCES "basin"."basin_identity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."approved_payee" ADD CONSTRAINT "approved_payee_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "basin"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."approved_payee" ADD CONSTRAINT "approved_payee_basin_identity_id_basin_identity_id_fk" FOREIGN KEY ("basin_identity_id") REFERENCES "basin"."basin_identity"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."approved_payee_generation" ADD CONSTRAINT "approved_payee_generation_approved_payee_id_approved_payee_id_fk" FOREIGN KEY ("approved_payee_id") REFERENCES "basin"."approved_payee"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."approved_security_root" ADD CONSTRAINT "approved_security_root_approved_payee_generation_id_approved_payee_generation_id_fk" FOREIGN KEY ("approved_payee_generation_id") REFERENCES "basin"."approved_payee_generation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."settlement_version" ADD CONSTRAINT "settlement_version_approved_payee_generation_id_approved_payee_generation_id_fk" FOREIGN KEY ("approved_payee_generation_id") REFERENCES "basin"."approved_payee_generation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."settlement_version" ADD CONSTRAINT "settlement_version_approved_security_root_id_approved_security_root_id_fk" FOREIGN KEY ("approved_security_root_id") REFERENCES "basin"."approved_security_root"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."settlement_version" ADD CONSTRAINT "settlement_version_approved_security_root_id_approved_payee_generation_id_approved_security_root_id_approved_payee_generation_id_fk" FOREIGN KEY ("approved_security_root_id","approved_payee_generation_id") REFERENCES "basin"."approved_security_root"("id","approved_payee_generation_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."obligation" ADD CONSTRAINT "obligation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "basin"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."obligation" ADD CONSTRAINT "obligation_approved_payee_id_approved_payee_id_fk" FOREIGN KEY ("approved_payee_id") REFERENCES "basin"."approved_payee"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."obligation" ADD CONSTRAINT "obligation_approved_payee_generation_id_approved_payee_generation_id_fk" FOREIGN KEY ("approved_payee_generation_id") REFERENCES "basin"."approved_payee_generation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."obligation" ADD CONSTRAINT "obligation_created_by_member_id_organization_member_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "basin"."organization_member"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."obligation" ADD CONSTRAINT "obligation_approved_payee_id_organization_id_approved_payee_id_organization_id_fk" FOREIGN KEY ("approved_payee_id","organization_id") REFERENCES "basin"."approved_payee"("id","organization_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."obligation" ADD CONSTRAINT "obligation_approved_payee_generation_id_approved_payee_id_approved_payee_generation_id_approved_payee_id_fk" FOREIGN KEY ("approved_payee_generation_id","approved_payee_id") REFERENCES "basin"."approved_payee_generation"("id","approved_payee_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."payment" ADD CONSTRAINT "payment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "basin"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."payment" ADD CONSTRAINT "payment_approved_payee_id_approved_payee_id_fk" FOREIGN KEY ("approved_payee_id") REFERENCES "basin"."approved_payee"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."payment" ADD CONSTRAINT "payment_approved_payee_generation_id_approved_payee_generation_id_fk" FOREIGN KEY ("approved_payee_generation_id") REFERENCES "basin"."approved_payee_generation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."payment" ADD CONSTRAINT "payment_obligation_record_id_obligation_id_fk" FOREIGN KEY ("obligation_record_id") REFERENCES "basin"."obligation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."payment" ADD CONSTRAINT "payment_obligation_record_id_organization_id_approved_payee_id_approved_payee_generation_id_obligation_id_organization_id_approved_payee_id_approved_payee_generation_id_fk" FOREIGN KEY ("obligation_record_id","organization_id","approved_payee_id","approved_payee_generation_id") REFERENCES "basin"."obligation"("id","organization_id","approved_payee_id","approved_payee_generation_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."payment_event" ADD CONSTRAINT "payment_event_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "basin"."payment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."payment_authority_snapshot" ADD CONSTRAINT "payment_authority_snapshot_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "basin"."payment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."payment_authority_snapshot" ADD CONSTRAINT "payment_authority_snapshot_approved_payee_generation_id_approved_payee_generation_id_fk" FOREIGN KEY ("approved_payee_generation_id") REFERENCES "basin"."approved_payee_generation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."payment_authority_snapshot" ADD CONSTRAINT "payment_authority_snapshot_approved_security_root_id_approved_security_root_id_fk" FOREIGN KEY ("approved_security_root_id") REFERENCES "basin"."approved_security_root"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."payment_authority_snapshot" ADD CONSTRAINT "payment_authority_snapshot_settlement_version_id_settlement_version_id_fk" FOREIGN KEY ("settlement_version_id") REFERENCES "basin"."settlement_version"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."payment_authority_snapshot" ADD CONSTRAINT "payment_authority_snapshot_approved_security_root_id_approved_payee_generation_id_approved_security_root_id_approved_payee_generation_id_fk" FOREIGN KEY ("approved_security_root_id","approved_payee_generation_id") REFERENCES "basin"."approved_security_root"("id","approved_payee_generation_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."payment_authority_snapshot" ADD CONSTRAINT "payment_authority_snapshot_settlement_version_id_approved_payee_generation_id_approved_security_root_id_settlement_version_id_approved_payee_generation_id_approved_security_root_id_fk" FOREIGN KEY ("settlement_version_id","approved_payee_generation_id","approved_security_root_id") REFERENCES "basin"."settlement_version"("id","approved_payee_generation_id","approved_security_root_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."receipt" ADD CONSTRAINT "receipt_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "basin"."payment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."receipt" ADD CONSTRAINT "receipt_authority_snapshot_id_payment_authority_snapshot_id_fk" FOREIGN KEY ("authority_snapshot_id") REFERENCES "basin"."payment_authority_snapshot"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."receipt" ADD CONSTRAINT "receipt_authority_snapshot_id_payment_id_payment_authority_snapshot_id_payment_id_fk" FOREIGN KEY ("authority_snapshot_id","payment_id") REFERENCES "basin"."payment_authority_snapshot"("id","payment_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."idempotency_key" ADD CONSTRAINT "idempotency_key_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "basin"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."idempotency_key" ADD CONSTRAINT "idempotency_key_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "basin"."payment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_owner_user_id_index" ON "basin"."workspace" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "organization_member_user_id_index" ON "basin"."organization_member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "identity_authority_version_basin_identity_id_index" ON "basin"."identity_authority_version" USING btree ("basin_identity_id") WHERE "basin"."identity_authority_version"."superseded_at" is null;--> statement-breakpoint
CREATE INDEX "approved_payee_basin_identity_id_index" ON "basin"."approved_payee" USING btree ("basin_identity_id");--> statement-breakpoint
CREATE INDEX "approved_payee_organization_id_status_expires_at_index" ON "basin"."approved_payee" USING btree ("organization_id","status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "approved_payee_generation_approved_payee_id_index" ON "basin"."approved_payee_generation" USING btree ("approved_payee_id") WHERE "basin"."approved_payee_generation"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "settlement_version_approved_security_root_id_index" ON "basin"."settlement_version" USING btree ("approved_security_root_id");--> statement-breakpoint
CREATE UNIQUE INDEX "settlement_version_approved_payee_generation_id_index" ON "basin"."settlement_version" USING btree ("approved_payee_generation_id") WHERE "basin"."settlement_version"."superseded_at" is null;--> statement-breakpoint
CREATE INDEX "obligation_organization_id_index" ON "basin"."obligation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "obligation_approved_payee_id_index" ON "basin"."obligation" USING btree ("approved_payee_id");--> statement-breakpoint
CREATE INDEX "obligation_approved_payee_generation_id_index" ON "basin"."obligation" USING btree ("approved_payee_generation_id");--> statement-breakpoint
CREATE INDEX "obligation_created_by_member_id_index" ON "basin"."obligation" USING btree ("created_by_member_id");--> statement-breakpoint
CREATE INDEX "obligation_organization_id_status_valid_until_index" ON "basin"."obligation" USING btree ("organization_id","status","valid_until");--> statement-breakpoint
CREATE INDEX "payment_organization_id_index" ON "basin"."payment" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "payment_approved_payee_id_index" ON "basin"."payment" USING btree ("approved_payee_id");--> statement-breakpoint
CREATE INDEX "payment_approved_payee_generation_id_index" ON "basin"."payment" USING btree ("approved_payee_generation_id");--> statement-breakpoint
CREATE INDEX "payment_obligation_record_id_index" ON "basin"."payment" USING btree ("obligation_record_id");--> statement-breakpoint
CREATE INDEX "payment_organization_id_status_created_at_index" ON "basin"."payment" USING btree ("organization_id","status","created_at");--> statement-breakpoint
CREATE INDEX "payment_authority_snapshot_approved_payee_generation_id_index" ON "basin"."payment_authority_snapshot" USING btree ("approved_payee_generation_id");--> statement-breakpoint
CREATE INDEX "payment_authority_snapshot_approved_security_root_id_index" ON "basin"."payment_authority_snapshot" USING btree ("approved_security_root_id");--> statement-breakpoint
CREATE INDEX "payment_authority_snapshot_settlement_version_id_index" ON "basin"."payment_authority_snapshot" USING btree ("settlement_version_id");--> statement-breakpoint
CREATE INDEX "idempotency_key_payment_id_index" ON "basin"."idempotency_key" USING btree ("payment_id");--> statement-breakpoint
-- History is insert-only, apart from one-time version closure. These triggers contain
-- no protocol verification; the repositories require evidence from verified adapters.
CREATE FUNCTION basin.protect_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'History is retained' USING ERRCODE = '23514'; END IF;
  IF TG_TABLE_NAME IN ('identity_authority_version', 'settlement_version') AND
     (to_jsonb(OLD)->>'superseded_at') IS NULL AND (to_jsonb(NEW)->>'superseded_at') IS NOT NULL AND
     (to_jsonb(NEW) - 'superseded_at') = (to_jsonb(OLD) - 'superseded_at') THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'approved_payee_generation' AND
     (to_jsonb(OLD)->>'ended_at') IS NULL AND (to_jsonb(NEW)->>'ended_at') IS NOT NULL AND
     (to_jsonb(NEW) - 'ended_at' - 'end_reason') = (to_jsonb(OLD) - 'ended_at' - 'end_reason') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'History is immutable' USING ERRCODE = '23514';
END $$;
--> statement-breakpoint
DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['approved_security_root', 'payment_authority_snapshot', 'receipt', 'payment_event', 'identity_authority_version', 'settlement_version', 'approved_payee_generation'] LOOP
    EXECUTE format('CREATE TRIGGER protect_history BEFORE UPDATE OR DELETE ON basin.%I FOR EACH ROW EXECUTE FUNCTION basin.protect_history()', table_name);
  END LOOP;
END $$;
--> statement-breakpoint
CREATE FUNCTION basin.protect_payment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'SETTLED' THEN RAISE EXCEPTION 'Settled payment is immutable' USING ERRCODE = '23514'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF (to_jsonb(NEW) - 'status' - 'blocked_reason' - 'updated_at' - 'settled_at') <>
     (to_jsonb(OLD) - 'status' - 'blocked_reason' - 'updated_at' - 'settled_at') THEN
    RAISE EXCEPTION 'Payment context is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER protect_payment BEFORE UPDATE OR DELETE ON basin.payment FOR EACH ROW EXECUTE FUNCTION basin.protect_payment();
--> statement-breakpoint
CREATE FUNCTION basin.require_settlement_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'SETTLED' AND NOT EXISTS (
    SELECT 1 FROM basin.payment_authority_snapshot s
    JOIN basin.receipt r ON r.authority_snapshot_id = s.id AND r.payment_id = s.payment_id
    WHERE s.payment_id = NEW.id AND r.transaction_hash IS NOT NULL
      AND s.approved_payee_generation_id = NEW.approved_payee_generation_id
      AND s.obligation_remaining_before_base_units - NEW.amount_base_units = s.obligation_remaining_after_base_units
      AND r.amount_base_units = NEW.amount_base_units AND r.asset_address = NEW.asset_address
      AND r.settled_at = NEW.settled_at
  ) THEN RAISE EXCEPTION 'Settlement history is required' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER require_settlement_history AFTER INSERT OR UPDATE ON basin.payment
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION basin.require_settlement_history();
--> statement-breakpoint
REVOKE ALL ON SCHEMA basin FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON ALL TABLES IN SCHEMA basin FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON ALL SEQUENCES IN SCHEMA basin FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA basin FROM PUBLIC;
--> statement-breakpoint
DO $$ DECLARE browser_role text; BEGIN
  FOREACH browser_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = browser_role) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA basin FROM %I', browser_role);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA basin FROM %I', browser_role);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA basin FROM %I', browser_role);
      EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA basin FROM %I', browser_role);
    END IF;
  END LOOP;
END $$;
