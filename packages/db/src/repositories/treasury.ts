import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { DomainError, recordId } from "@basin/domain";
import type { Database } from "../client";
import { found, safely } from "../errors";
import {
  Organization,
  OrganizationTreasury,
  PrivyProvisioningOperation,
  PrivyWebhookReceipt,
  RoutineSignerSecret,
  OrganizationMember,
  User,
} from "../schema/tables";

const conflict = () =>
  new DomainError(
    "CONFLICT",
    "This setup request no longer matches. Check the current controls and try again.",
  );

export function treasuryRepository(db: Database) {
  return {
    byOrganization(organizationId: bigint) {
      return safely(async () => {
        recordId.parse(organizationId);
        return (
          (
            await db
              .select()
              .from(OrganizationTreasury)
              .where(eq(OrganizationTreasury.organization_id, organizationId))
          )[0] ?? null
        );
      });
    },
    routineSignerSecret(organizationId: bigint) {
      return safely(async () => {
        recordId.parse(organizationId);
        return (
          (
            await db
              .select()
              .from(RoutineSignerSecret)
              .where(eq(RoutineSignerSecret.organization_id, organizationId))
          )[0] ?? null
        );
      });
    },
    adminPrivyUserIds(organizationId: bigint) {
      return safely(async () =>
        (
          await db
            .select({ privyUserId: User.privy_user_id })
            .from(OrganizationMember)
            .innerJoin(User, eq(User.id, OrganizationMember.user_id))
            .where(
              and(
                eq(
                  OrganizationMember.organization_id,
                  recordId.parse(organizationId),
                ),
                eq(OrganizationMember.role, "ADMIN"),
                eq(OrganizationMember.status, "ACTIVE"),
              ),
            )
        ).map((row) => row.privyUserId),
      );
    },
    async byWorkspace(workspaceId: bigint) {
      return safely(async () => {
        recordId.parse(workspaceId);
        const [row] = await db
          .select({
            organization: Organization,
            treasury: OrganizationTreasury,
          })
          .from(Organization)
          .leftJoin(
            OrganizationTreasury,
            eq(OrganizationTreasury.organization_id, Organization.id),
          )
          .where(eq(Organization.workspace_id, workspaceId));
        return found(row);
      });
    },
    saveOrganizationMapping(
      organizationId: bigint,
      privyOrganizationId: string,
    ) {
      return safely(async () =>
        found(
          (
            await db
              .update(Organization)
              .set({
                privy_organization_id: privyOrganizationId,
                updated_at: new Date(),
              })
              .where(
                and(
                  eq(Organization.id, recordId.parse(organizationId)),
                  or(
                    eq(Organization.privy_organization_id, privyOrganizationId),
                    // The first verified external mapping is immutable through this path.
                    isNull(Organization.privy_organization_id),
                  ),
                ),
              )
              .returning()
          )[0],
        ),
      );
    },
    saveTreasury(values: typeof OrganizationTreasury.$inferInsert) {
      return safely(async () =>
        found(
          (
            await db
              .insert(OrganizationTreasury)
              .values(values)
              .onConflictDoUpdate({
                target: OrganizationTreasury.organization_id,
                set: { ...values, updated_at: new Date() },
              })
              .returning()
          )[0],
        ),
      );
    },
    operation(
      organizationId: bigint,
      operationType: typeof PrivyProvisioningOperation.$inferInsert.operation_type,
      idempotencyKey: string,
      requestFingerprint: string,
    ) {
      return safely(() =>
        db.transaction(async (tx) => {
          // Serialize only the short local operation claim; no provider request runs in this transaction.
          found(
            (
              await tx
                .select({ id: Organization.id })
                .from(Organization)
                .where(eq(Organization.id, organizationId))
                .for("update")
            )[0],
          );
          const [existing] = await tx
            .select()
            .from(PrivyProvisioningOperation)
            .where(
              and(
                eq(PrivyProvisioningOperation.organization_id, organizationId),
                eq(PrivyProvisioningOperation.operation_type, operationType),
                eq(PrivyProvisioningOperation.idempotency_key, idempotencyKey),
              ),
            )
            .for("update");
          if (existing) {
            if (existing.request_fingerprint !== requestFingerprint)
              throw conflict();
            return existing;
          }
          const [active] = await tx
            .select()
            .from(PrivyProvisioningOperation)
            .where(
              and(
                eq(PrivyProvisioningOperation.organization_id, organizationId),
                eq(PrivyProvisioningOperation.operation_type, operationType),
                inArray(PrivyProvisioningOperation.status, [
                  "IN_PROGRESS",
                  "AWAITING_APPROVAL",
                  "FAILED_RETRYABLE",
                ]),
              ),
            )
            .orderBy(
              desc(PrivyProvisioningOperation.updated_at),
              desc(PrivyProvisioningOperation.id),
            );
          if (active) {
            if (active.request_fingerprint !== requestFingerprint)
              throw conflict();
            return active;
          }
          return found(
            (
              await tx
                .insert(PrivyProvisioningOperation)
                .values({
                  organization_id: organizationId,
                  operation_type: operationType,
                  idempotency_key: idempotencyKey,
                  request_fingerprint: requestFingerprint,
                })
                .onConflictDoNothing()
                .returning()
            )[0] ??
              (
                await tx
                  .select()
                  .from(PrivyProvisioningOperation)
                  .where(
                    and(
                      eq(
                        PrivyProvisioningOperation.organization_id,
                        organizationId,
                      ),
                      eq(
                        PrivyProvisioningOperation.operation_type,
                        operationType,
                      ),
                      eq(
                        PrivyProvisioningOperation.idempotency_key,
                        idempotencyKey,
                      ),
                    ),
                  )
              )[0],
          );
        }),
      );
    },
    updateOperation(
      id: bigint,
      values: Partial<typeof PrivyProvisioningOperation.$inferInsert>,
    ) {
      return safely(async () =>
        found(
          (
            await db
              .update(PrivyProvisioningOperation)
              .set({ ...values, updated_at: new Date() })
              .where(eq(PrivyProvisioningOperation.id, id))
              .returning()
          )[0],
        ),
      );
    },
    latestOperation(organizationId: bigint) {
      return safely(
        async () =>
          (
            await db
              .select()
              .from(PrivyProvisioningOperation)
              .where(
                eq(PrivyProvisioningOperation.organization_id, organizationId),
              )
              .orderBy(
                desc(PrivyProvisioningOperation.updated_at),
                desc(PrivyProvisioningOperation.id),
              )
          )[0] ?? null,
      );
    },
    operationByIntent(intentId: string) {
      return safely(
        async () =>
          (
            await db
              .select()
              .from(PrivyProvisioningOperation)
              .where(eq(PrivyProvisioningOperation.privy_intent_id, intentId))
          )[0] ?? null,
      );
    },
    signerSecret(organizationId: bigint) {
      return safely(
        async () =>
          (
            await db
              .select()
              .from(RoutineSignerSecret)
              .where(eq(RoutineSignerSecret.organization_id, organizationId))
          )[0] ?? null,
      );
    },
    saveSignerSecret(values: typeof RoutineSignerSecret.$inferInsert) {
      return safely(async () => {
        const [existing] = await db
          .select()
          .from(RoutineSignerSecret)
          .where(
            eq(RoutineSignerSecret.organization_id, values.organization_id),
          );
        if (existing) {
          if (existing.public_key_fingerprint !== values.public_key_fingerprint)
            throw conflict();
          return existing;
        }
        return found(
          (await db.insert(RoutineSignerSecret).values(values).returning())[0],
        );
      });
    },
    receiveWebhook(values: typeof PrivyWebhookReceipt.$inferInsert) {
      return safely(async () => {
        const inserted = await db
          .insert(PrivyWebhookReceipt)
          .values(values)
          .onConflictDoNothing()
          .returning();
        if (inserted[0]) return { receipt: inserted[0], duplicate: false };
        const existing = found(
          (
            await db
              .select()
              .from(PrivyWebhookReceipt)
              .where(eq(PrivyWebhookReceipt.delivery_id, values.delivery_id))
          )[0],
        );
        if (existing.payload_hash !== values.payload_hash) throw conflict();
        return { receipt: existing, duplicate: true };
      });
    },
    updateWebhook(
      id: bigint,
      values: Partial<typeof PrivyWebhookReceipt.$inferInsert>,
    ) {
      return safely(async () =>
        found(
          (
            await db
              .update(PrivyWebhookReceipt)
              .set(values)
              .where(eq(PrivyWebhookReceipt.id, id))
              .returning()
          )[0],
        ),
      );
    },
  };
}
