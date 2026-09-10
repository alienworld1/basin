import { and, desc, eq, isNull, notInArray } from "drizzle-orm";
import { DomainError } from "@basin/domain";
import { relationshipRepository } from "./relationships";
import type { VerifiedSettlementVersion } from "../evidence";
import type { Database } from "../client";
import { found, safely } from "../errors";
import {
  ApprovedPayee,
  ApprovedPayeeGeneration,
  ApprovedSecurityRoot,
  BasinIdentity,
  ReceivingPreference,
  SettlementOperation,
  SettlementVersion,
  Workspace,
} from "../schema/tables";

const conflict = () =>
  new DomainError(
    "CONFLICT",
    "Receiving details changed. Review the latest account before continuing.",
  );
export function receivingRepository(db: Database) {
  return {
    preference(workspaceId: bigint) {
      return safely(
        async () =>
          (
            await db
              .select()
              .from(ReceivingPreference)
              .where(eq(ReceivingPreference.workspace_id, workspaceId))
          )[0] ?? null,
      );
    },
    savePreference(
      values: typeof ReceivingPreference.$inferInsert,
      expected: string | null,
    ) {
      return safely(() =>
        db.transaction(async (tx) => {
          const workspace = found(
            (
              await tx
                .select()
                .from(Workspace)
                .where(eq(Workspace.id, values.workspace_id))
                .for("update")
            )[0],
          );
          const identity = found(
            (
              await tx
                .select()
                .from(BasinIdentity)
                .where(
                  and(
                    eq(BasinIdentity.id, values.identity_id),
                    eq(BasinIdentity.workspace_id, workspace.id),
                  ),
                )
            )[0],
          );
          if (
            workspace.type !== "PERSONAL" ||
            identity.protocol_status !== "ACTIVE"
          )
            throw conflict();
          const [old] = await tx
            .select()
            .from(ReceivingPreference)
            .where(eq(ReceivingPreference.workspace_id, workspace.id));
          if ((old?.revision ?? null) !== expected) throw conflict();
          const next = {
            ...values,
            revision: old ? (BigInt(old.revision) + 1n).toString() : "0",
            updated_at: new Date(),
          };
          return found(
            (old
              ? await tx
                  .update(ReceivingPreference)
                  .set(next)
                  .where(eq(ReceivingPreference.workspace_id, workspace.id))
                  .returning()
              : await tx
                  .insert(ReceivingPreference)
                  .values(next)
                  .returning())[0],
          );
        }),
      );
    },
    relationships(identityId: bigint) {
      return safely(() =>
        db
          .select()
          .from(ApprovedPayee)
          .where(eq(ApprovedPayee.basin_identity_id, identityId)),
      );
    },
    context(identityId: bigint, relationshipId: bigint) {
      return safely(async () => {
        const relationship = found(
          (
            await db
              .select()
              .from(ApprovedPayee)
              .where(
                and(
                  eq(ApprovedPayee.id, relationshipId),
                  eq(ApprovedPayee.basin_identity_id, identityId),
                ),
              )
          )[0],
        );
        const [generation] = await db
          .select()
          .from(ApprovedPayeeGeneration)
          .where(
            and(
              eq(ApprovedPayeeGeneration.approved_payee_id, relationshipId),
              isNull(ApprovedPayeeGeneration.ended_at),
            ),
          );
        const [root] = generation
          ? await db
              .select()
              .from(ApprovedSecurityRoot)
              .where(
                eq(
                  ApprovedSecurityRoot.approved_payee_generation_id,
                  generation.id,
                ),
              )
          : [];
        const versions = generation
          ? await db
              .select()
              .from(SettlementVersion)
              .where(
                eq(
                  SettlementVersion.approved_payee_generation_id,
                  generation.id,
                ),
              )
              .orderBy(desc(SettlementVersion.settlement_epoch))
          : [];
        return {
          relationship,
          generation: generation ?? null,
          root: root ?? null,
          versions,
        };
      });
    },
    operation(workspaceId: bigint, operationId: bigint) {
      return safely(async () =>
        found(
          (
            await db
              .select()
              .from(SettlementOperation)
              .where(
                and(
                  eq(SettlementOperation.id, operationId),
                  eq(SettlementOperation.workspace_id, workspaceId),
                ),
              )
          )[0],
        ),
      );
    },
    byKey(workspaceId: bigint, key: string) {
      return safely(
        async () =>
          (
            await db
              .select()
              .from(SettlementOperation)
              .where(
                and(
                  eq(SettlementOperation.workspace_id, workspaceId),
                  eq(SettlementOperation.idempotency_key, key),
                ),
              )
          )[0] ?? null,
      );
    },
    operations(workspaceId: bigint, relationshipId?: bigint) {
      return safely(() =>
        db
          .select()
          .from(SettlementOperation)
          .where(
            and(
              eq(SettlementOperation.workspace_id, workspaceId),
              relationshipId
                ? eq(SettlementOperation.relationship_id, relationshipId)
                : undefined,
            ),
          )
          .orderBy(desc(SettlementOperation.id)),
      );
    },
    prepare(values: typeof SettlementOperation.$inferInsert) {
      return safely(() =>
        db.transaction(async (tx) => {
          const relationship = found(
            (
              await tx
                .select()
                .from(ApprovedPayee)
                .where(eq(ApprovedPayee.id, values.relationship_id))
                .for("update")
            )[0],
          );
          const identity = found(
            (
              await tx
                .select()
                .from(BasinIdentity)
                .where(eq(BasinIdentity.id, relationship.basin_identity_id))
            )[0],
          );
          if (
            identity.workspace_id !== values.workspace_id ||
            identity.id !== values.identity_id ||
            !["PENDING", "ACTIVE"].includes(relationship.status)
          )
            throw conflict();
          const [old] = await tx
            .select()
            .from(SettlementOperation)
            .where(
              and(
                eq(SettlementOperation.workspace_id, values.workspace_id),
                eq(SettlementOperation.idempotency_key, values.idempotency_key),
              ),
            );
          if (old) {
            if (old.request_digest !== values.request_digest) throw conflict();
            return old;
          }
          return found(
            (
              await tx.insert(SettlementOperation).values(values).returning()
            )[0],
          );
        }),
      );
    },
    transitionPrepared(
      workspaceId: bigint,
      operationId: bigint,
      cancel: boolean,
    ) {
      return safely(() =>
        db.transaction(async (tx) => {
          const old = found(
            (
              await tx
                .select()
                .from(SettlementOperation)
                .where(
                  and(
                    eq(SettlementOperation.workspace_id, workspaceId),
                    eq(SettlementOperation.id, operationId),
                  ),
                )
                .for("update")
            )[0],
          );
          if (old.status !== "PREPARED" || old.transaction_hash)
            throw conflict();
          return found(
            (
              await tx
                .update(SettlementOperation)
                .set({
                  status: cancel ? "FAILED" : "UNKNOWN",
                  error_code: cancel ? "CANCELLED_BEFORE_SIGNATURE" : null,
                  updated_at: new Date(),
                })
                .where(eq(SettlementOperation.id, operationId))
                .returning()
            )[0],
          );
        }),
      );
    },
    finalize(
      workspaceId: bigint,
      operationId: bigint,
      settlement?: {
        organizationId: bigint;
        evidence: VerifiedSettlementVersion;
      },
    ) {
      return safely(() =>
        db.transaction(async (tx) => {
          const op = found(
            (
              await tx
                .select()
                .from(SettlementOperation)
                .where(
                  and(
                    eq(SettlementOperation.workspace_id, workspaceId),
                    eq(SettlementOperation.id, operationId),
                  ),
                )
                .for("update")
            )[0],
          );
          if (op.status === "CONFIRMED") return op;
          if (
            op.status !== "VERIFYING" ||
            !op.verified_at ||
            !op.receipt_block_hash ||
            !op.transaction_hash
          )
            throw conflict();
          if (settlement) {
            const generation = found(
              (
                await tx
                  .select()
                  .from(ApprovedPayeeGeneration)
                  .where(
                    eq(
                      ApprovedPayeeGeneration.id,
                      settlement.evidence.approved_payee_generation_id,
                    ),
                  )
              )[0],
            );
            if (
              generation.approved_payee_id !== op.relationship_id ||
              generation.relationship_token_id !== op.relationship_token_id
            )
              throw conflict();
            if (
              settlement.evidence.commitment !== op.commitment ||
              String(settlement.evidence.settlement_epoch) !==
                op.target_epoch ||
              !settlement.evidence.destination_ciphertext
            )
              throw conflict();
            await relationshipRepository(tx).appendSettlement(
              settlement.organizationId,
              settlement.evidence,
            );
          } else if (op.accepted_root_digest) throw conflict();
          return found(
            (
              await tx
                .update(SettlementOperation)
                .set({
                  status: "CONFIRMED",
                  error_code: null,
                  updated_at: new Date(),
                })
                .where(eq(SettlementOperation.id, op.id))
                .returning()
            )[0],
          );
        }),
      );
    },
    update(
      workspaceId: bigint,
      operationId: bigint,
      values: Partial<
        Pick<
          SettlementOperation,
          | "status"
          | "transaction_hash"
          | "receipt_block_number"
          | "receipt_block_hash"
          | "verified_at"
          | "accepted_root_digest"
          | "error_code"
        >
      >,
      replacedHash?: string,
    ) {
      return safely(() =>
        db.transaction(async (tx) => {
          const old = found(
            (
              await tx
                .select()
                .from(SettlementOperation)
                .where(
                  and(
                    eq(SettlementOperation.workspace_id, workspaceId),
                    eq(SettlementOperation.id, operationId),
                  ),
                )
                .for("update")
            )[0],
          );
          if (
            values.error_code === "SIGNATURE_REJECTED" &&
            (old.status !== "UNKNOWN" || old.transaction_hash)
          )
            throw conflict();
          if (old.status === "CONFIRMED" || old.status === "FAILED") return old;
          if (
            old.transaction_hash &&
            values.transaction_hash &&
            old.transaction_hash !== values.transaction_hash &&
            old.transaction_hash !== replacedHash
          )
            throw conflict();
          return found(
            (
              await tx
                .update(SettlementOperation)
                .set({ ...values, updated_at: new Date() })
                .where(
                  and(
                    eq(SettlementOperation.id, operationId),
                    notInArray(SettlementOperation.status, [
                      "CONFIRMED",
                      "FAILED",
                    ]),
                  ),
                )
                .returning()
            )[0],
          );
        }),
      );
    },
  };
}
