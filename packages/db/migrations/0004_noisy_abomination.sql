CREATE TYPE "basin"."organization_access_event_type" AS ENUM('INVITED', 'INVITATION_REVOKED', 'INVITATION_EXPIRED', 'JOINED', 'REINSTATED', 'REMOVED', 'LEFT');--> statement-breakpoint
CREATE TYPE "basin"."invitation_operation_type" AS ENUM('CREATE_INVITATION', 'REPLACE_INVITATION');--> statement-breakpoint
CREATE TYPE "basin"."organization_invitation_status" AS ENUM('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "basin"."member_status" AS ENUM('ACTIVE', 'REMOVED', 'LEFT');--> statement-breakpoint
CREATE TABLE "basin"."invitation_operation" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "basin"."invitation_operation_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" bigint NOT NULL,
	"actor_user_id" bigint NOT NULL,
	"operation_type" "basin"."invitation_operation_type" NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"invitation_id" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_operation_organization_id_actor_user_id_operation_type_idempotency_key_unique" UNIQUE("organization_id","actor_user_id","operation_type","idempotency_key"),
	CONSTRAINT "invitation_operation_idempotency_length" CHECK (length("basin"."invitation_operation"."idempotency_key") between 16 and 160),
	CONSTRAINT "invitation_operation_fingerprint" CHECK ("basin"."invitation_operation"."request_fingerprint" ~ '^0x[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "basin"."organization_access_event" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "basin"."organization_access_event_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" bigint NOT NULL,
	"membership_id" bigint,
	"invitation_id" bigint,
	"actor_user_id" bigint,
	"subject_user_id" bigint,
	"type" "basin"."organization_access_event_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_access_event_reference" CHECK ("basin"."organization_access_event"."membership_id" is not null or "basin"."organization_access_event"."invitation_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "basin"."organization_invitation" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "basin"."organization_invitation_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"organization_id" bigint NOT NULL,
	"role" "basin"."member_role" DEFAULT 'PAYMENT_OPERATOR' NOT NULL,
	"invitee_label" text NOT NULL,
	"secret_version" integer DEFAULT 1 NOT NULL,
	"secret_hash" text NOT NULL,
	"status" "basin"."organization_invitation_status" DEFAULT 'PENDING' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_by_user_id" bigint NOT NULL,
	"accepted_by_user_id" bigint,
	"accepted_at" timestamp with time zone,
	"revoked_by_user_id" bigint,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_invitation_secret_hash_unique" UNIQUE("secret_hash"),
	CONSTRAINT "organization_invitation_role" CHECK ("basin"."organization_invitation"."role" = 'PAYMENT_OPERATOR'),
	CONSTRAINT "organization_invitation_label_length" CHECK (length("basin"."organization_invitation"."invitee_label") between 1 and 120 and "basin"."organization_invitation"."invitee_label" = btrim("basin"."organization_invitation"."invitee_label")),
	CONSTRAINT "organization_invitation_secret" CHECK ("basin"."organization_invitation"."secret_version" between 1 and 32767 and "basin"."organization_invitation"."secret_hash" ~ '^0x[0-9a-f]{64}$'),
	CONSTRAINT "organization_invitation_lifecycle" CHECK (("basin"."organization_invitation"."status" in ('PENDING', 'EXPIRED') and "basin"."organization_invitation"."accepted_by_user_id" is null and "basin"."organization_invitation"."accepted_at" is null and "basin"."organization_invitation"."revoked_by_user_id" is null and "basin"."organization_invitation"."revoked_at" is null) or ("basin"."organization_invitation"."status" = 'ACCEPTED' and "basin"."organization_invitation"."accepted_by_user_id" is not null and "basin"."organization_invitation"."accepted_at" is not null and "basin"."organization_invitation"."revoked_by_user_id" is null and "basin"."organization_invitation"."revoked_at" is null) or ("basin"."organization_invitation"."status" = 'REVOKED' and "basin"."organization_invitation"."accepted_by_user_id" is null and "basin"."organization_invitation"."accepted_at" is null and "basin"."organization_invitation"."revoked_by_user_id" is not null and "basin"."organization_invitation"."revoked_at" is not null))
);
--> statement-breakpoint
DROP INDEX "basin"."organization_member_user_id_index";--> statement-breakpoint
ALTER TABLE "basin"."organization_member" ADD COLUMN "status" "basin"."member_status" DEFAULT 'ACTIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE "basin"."organization_member" ADD COLUMN "activated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "basin"."organization_member" ADD COLUMN "removed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "basin"."organization_member" ADD COLUMN "removed_by_user_id" bigint;--> statement-breakpoint
ALTER TABLE "basin"."organization_member" ADD COLUMN "left_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "basin"."invitation_operation" ADD CONSTRAINT "invitation_operation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "basin"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."invitation_operation" ADD CONSTRAINT "invitation_operation_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "basin"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."invitation_operation" ADD CONSTRAINT "invitation_operation_invitation_id_organization_invitation_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "basin"."organization_invitation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."organization_access_event" ADD CONSTRAINT "organization_access_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "basin"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."organization_access_event" ADD CONSTRAINT "organization_access_event_membership_id_organization_member_id_fk" FOREIGN KEY ("membership_id") REFERENCES "basin"."organization_member"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."organization_access_event" ADD CONSTRAINT "organization_access_event_invitation_id_organization_invitation_id_fk" FOREIGN KEY ("invitation_id") REFERENCES "basin"."organization_invitation"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."organization_access_event" ADD CONSTRAINT "organization_access_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "basin"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."organization_access_event" ADD CONSTRAINT "organization_access_event_subject_user_id_user_id_fk" FOREIGN KEY ("subject_user_id") REFERENCES "basin"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."organization_invitation" ADD CONSTRAINT "organization_invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "basin"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."organization_invitation" ADD CONSTRAINT "organization_invitation_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "basin"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."organization_invitation" ADD CONSTRAINT "organization_invitation_accepted_by_user_id_user_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "basin"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "basin"."organization_invitation" ADD CONSTRAINT "organization_invitation_revoked_by_user_id_user_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "basin"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organization_access_event_organization_id_created_at_index" ON "basin"."organization_access_event" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "organization_invitation_organization_id_status_created_at_index" ON "basin"."organization_invitation" USING btree ("organization_id","status","created_at");--> statement-breakpoint
ALTER TABLE "basin"."organization_member" ADD CONSTRAINT "organization_member_removed_by_user_id_user_id_fk" FOREIGN KEY ("removed_by_user_id") REFERENCES "basin"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organization_member_user_id_status_index" ON "basin"."organization_member" USING btree ("user_id","status");--> statement-breakpoint
ALTER TABLE "basin"."organization_member" ADD CONSTRAINT "organization_member_lifecycle" CHECK (("basin"."organization_member"."status" = 'ACTIVE' and "basin"."organization_member"."removed_at" is null and "basin"."organization_member"."removed_by_user_id" is null and "basin"."organization_member"."left_at" is null) or ("basin"."organization_member"."status" = 'REMOVED' and "basin"."organization_member"."removed_at" is not null and "basin"."organization_member"."removed_by_user_id" is not null and "basin"."organization_member"."left_at" is null) or ("basin"."organization_member"."status" = 'LEFT' and "basin"."organization_member"."left_at" is not null and "basin"."organization_member"."removed_at" is null and "basin"."organization_member"."removed_by_user_id" is null));--> statement-breakpoint
ALTER TABLE "basin"."organization_member" ADD CONSTRAINT "organization_admin_stays_active" CHECK ("basin"."organization_member"."role" != 'ADMIN' or "basin"."organization_member"."status" = 'ACTIVE');