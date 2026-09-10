import { and, asc, desc, eq, getTableColumns, isNull } from "drizzle-orm";
import { z } from "zod";
import { assertPayeeTransition, ensName, recordId } from "@basin/domain";
import {
  ApprovedPayee,
  ApprovedPayeeGeneration,
  ApprovedSecurityRoot,
  BasinIdentity,
  SettlementVersion,
} from "../schema/tables";
import {
  approvedPayeeGenerationInput,
  approvedSecurityRootInput,
  settlementVersionInput,
} from "../inputs";
import type { Database, Transaction } from "../client";
import type {
  VerifiedGeneration,
  VerifiedActivation,
  VerifiedRelationshipEnd,
  VerifiedSettlementVersion,
} from "../evidence";
import { requireEvidence } from "../evidence-registry";
import { found, requireMatch, safely } from "../errors";

export async function lockedRelationship(
  tx: Transaction,
  organizationId: bigint,
  relationshipId: bigint,
) {
  return found(
    (
      await tx
        .select()
        .from(ApprovedPayee)
        .where(
          and(
            eq(ApprovedPayee.id, relationshipId),
            eq(ApprovedPayee.organization_id, organizationId),
          ),
        )
        .for("update")
    )[0],
  );
}
const endInput = z.strictObject({
  approved_payee_id: recordId,
  generation_id: recordId,
  status: z.enum(["REVOKED", "EXPIRED", "REAPPROVAL_REQUIRED"]),
  occurred_at: z.date(),
  cause: z.string().trim().min(1).max(240).optional(),
});
const publicSettlementColumns = () => {
  const { destination_ciphertext, destination_fingerprint, ...columns } =
    getTableColumns(SettlementVersion);
  void destination_ciphertext;
  void destination_fingerprint;
  return columns;
};

export function relationshipRepository(db: Database | Transaction) {
  return {
    findOrCreate(organizationId: bigint, identityId: bigint) {
      return safely(async () => {
        recordId.parse(organizationId);
        recordId.parse(identityId);
        return found(
          (
            await db
              .insert(ApprovedPayee)
              .values({
                organization_id: organizationId,
                basin_identity_id: identityId,
                status: "PENDING",
              })
              .onConflictDoUpdate({
                target: [
                  ApprovedPayee.organization_id,
                  ApprovedPayee.basin_identity_id,
                ],
                set: { basin_identity_id: identityId },
              })
              .returning()
          )[0],
        );
      });
    },
    find(organizationId: bigint, identityId: bigint) {
      return safely(async () => {
        recordId.parse(organizationId);
        recordId.parse(identityId);
        return found(
          (
            await db
              .select()
              .from(ApprovedPayee)
              .where(
                and(
                  eq(ApprovedPayee.organization_id, organizationId),
                  eq(ApprovedPayee.basin_identity_id, identityId),
                ),
              )
          )[0],
        );
      });
    },
    read(organizationId: bigint, relationshipId: bigint) {
      return safely(async () => {
        recordId.parse(organizationId);
        recordId.parse(relationshipId);
        return found(
          (
            await db
              .select()
              .from(ApprovedPayee)
              .where(
                and(
                  eq(ApprovedPayee.organization_id, organizationId),
                  eq(ApprovedPayee.id, relationshipId),
                ),
              )
          )[0],
        );
      });
    },
    appendGeneration(organizationId: bigint, evidence: VerifiedGeneration) {
      return safely(async () => {
        recordId.parse(organizationId);
        requireEvidence(evidence, "generation");
        const { relationship_name, ...values } = approvedPayeeGenerationInput
          .extend({ relationship_name: ensName })
          .parse(evidence);
        requireMatch(
          !values.ended_at &&
            !values.end_reason &&
            values.expires_at > new Date(),
        );
        return db.transaction(async (tx) => {
          await lockedRelationship(
            tx,
            organizationId,
            values.approved_payee_id,
          );
          const [previous] = await tx
            .select()
            .from(ApprovedPayeeGeneration)
            .where(
              eq(
                ApprovedPayeeGeneration.approved_payee_id,
                values.approved_payee_id,
              ),
            )
            .orderBy(desc(ApprovedPayeeGeneration.generation_number))
            .limit(1);
          requireMatch(
            values.generation_number === (previous?.generation_number ?? 0) + 1,
          );
          if (previous && !previous.ended_at) {
            requireMatch(values.registered_at >= previous.registered_at);
            await tx
              .update(ApprovedPayeeGeneration)
              .set({ ended_at: values.registered_at, end_reason: "REPLACED" })
              .where(eq(ApprovedPayeeGeneration.id, previous.id));
          }
          const row = found(
            (
              await tx
                .insert(ApprovedPayeeGeneration)
                .values(values)
                .returning()
            )[0],
          );
          await tx
            .update(ApprovedPayee)
            .set({
              status: "PENDING",
              relationship_name,
              expires_at: values.expires_at,
              revoked_at: null,
              revocation_cause: null,
              updated_at: new Date(),
            })
            .where(eq(ApprovedPayee.id, values.approved_payee_id));
          return row;
        });
      });
    },
    acceptRoot(organizationId: bigint, evidence: VerifiedActivation) {
      return safely(async () => {
        recordId.parse(organizationId);
        requireEvidence(evidence, "activation");
        const values = approvedSecurityRootInput.parse(evidence);
        return db.transaction(async (tx) => {
          const generation = found(
            (
              await tx
                .select()
                .from(ApprovedPayeeGeneration)
                .where(
                  eq(
                    ApprovedPayeeGeneration.id,
                    values.approved_payee_generation_id,
                  ),
                )
            )[0],
          );
          const relationship = await lockedRelationship(
            tx,
            organizationId,
            generation.approved_payee_id,
          );
          // Reload after the relationship lock: another activation/end may have won while waiting.
          const current = found(
            (
              await tx
                .select()
                .from(ApprovedPayeeGeneration)
                .where(eq(ApprovedPayeeGeneration.id, generation.id))
            )[0],
          );
          const identity = found(
            (
              await tx
                .select()
                .from(BasinIdentity)
                .where(eq(BasinIdentity.id, relationship.basin_identity_id))
                .for("share")
            )[0],
          );
          requireMatch(
            relationship.status === "PENDING" &&
              !current.ended_at &&
              current.expires_at > new Date(),
          );
          requireMatch(
            values.payee_id === identity.payee_id &&
              values.identity_controller === identity.controller_address &&
              values.identity_epoch === identity.identity_epoch,
          );
          requireMatch(
            values.relationship_token_id === current.relationship_token_id &&
              values.relationship_registry_address ===
                current.relationship_registry_address &&
              values.accepted_relationship_expiry.getTime() ===
                current.expires_at.getTime(),
          );
          requireMatch(
            values.acceptance_chain_id === 11155111 &&
              values.activated_at >= current.registered_at &&
              values.activated_at < current.expires_at,
          );
          const root = found(
            (
              await tx.insert(ApprovedSecurityRoot).values(values).returning()
            )[0],
          );
          await tx
            .update(ApprovedPayee)
            .set({ status: "ACTIVE", updated_at: new Date() })
            .where(eq(ApprovedPayee.id, relationship.id));
          return root;
        });
      });
    },
    end(organizationId: bigint, evidence: VerifiedRelationshipEnd) {
      return safely(async () => {
        recordId.parse(organizationId);
        requireEvidence(evidence, "relationshipEnd");
        const values = endInput.parse(evidence);
        return db.transaction(async (tx) => {
          const relationship = await lockedRelationship(
            tx,
            organizationId,
            values.approved_payee_id,
          );
          assertPayeeTransition(relationship.status, values.status);
          const generation = found(
            (
              await tx
                .select()
                .from(ApprovedPayeeGeneration)
                .where(
                  and(
                    eq(ApprovedPayeeGeneration.id, values.generation_id),
                    eq(
                      ApprovedPayeeGeneration.approved_payee_id,
                      relationship.id,
                    ),
                    isNull(ApprovedPayeeGeneration.ended_at),
                  ),
                )
            )[0],
          );
          requireMatch(
            values.occurred_at >= generation.registered_at &&
              (values.status !== "EXPIRED" ||
                values.occurred_at >= generation.expires_at),
          );
          await tx
            .update(ApprovedPayeeGeneration)
            .set({
              ended_at: values.occurred_at,
              end_reason:
                values.status === "REAPPROVAL_REQUIRED"
                  ? "SECURITY_ROOT_CHANGED"
                  : values.status,
            })
            .where(eq(ApprovedPayeeGeneration.id, generation.id));
          return found(
            (
              await tx
                .update(ApprovedPayee)
                .set({
                  status: values.status,
                  revoked_at:
                    values.status === "REVOKED" ? values.occurred_at : null,
                  revocation_cause: values.cause,
                  updated_at: new Date(),
                })
                .where(eq(ApprovedPayee.id, relationship.id))
                .returning()
            )[0],
          );
        });
      });
    },
    appendSettlement(
      organizationId: bigint,
      evidence: VerifiedSettlementVersion,
    ) {
      return safely(async () => {
        recordId.parse(organizationId);
        requireEvidence(evidence, "settlementVersion");
        const values = settlementVersionInput.parse(evidence);
        requireMatch(
          !values.superseded_at &&
            !values.destination_fingerprint &&
            values.chain_id === 11155111,
        );
        return db.transaction(async (tx) => {
          const generation = found(
            (
              await tx
                .select()
                .from(ApprovedPayeeGeneration)
                .where(
                  eq(
                    ApprovedPayeeGeneration.id,
                    values.approved_payee_generation_id,
                  ),
                )
            )[0],
          );
          const relationship = await lockedRelationship(
            tx,
            organizationId,
            generation.approved_payee_id,
          );
          const current = found(
            (
              await tx
                .select()
                .from(ApprovedPayeeGeneration)
                .where(eq(ApprovedPayeeGeneration.id, generation.id))
            )[0],
          );
          const root = found(
            (
              await tx
                .select()
                .from(ApprovedSecurityRoot)
                .where(
                  and(
                    eq(
                      ApprovedSecurityRoot.id,
                      values.approved_security_root_id,
                    ),
                    eq(
                      ApprovedSecurityRoot.approved_payee_generation_id,
                      generation.id,
                    ),
                  ),
                )
            )[0],
          );
          requireMatch(
            relationship.status === "ACTIVE" &&
              !current.ended_at &&
              current.expires_at > new Date(),
          );
          const [previous] = await tx
            .select()
            .from(SettlementVersion)
            .where(
              and(
                eq(
                  SettlementVersion.approved_payee_generation_id,
                  generation.id,
                ),
                isNull(SettlementVersion.superseded_at),
              ),
            );
          if (previous?.settlement_epoch === values.settlement_epoch) {
            requireMatch(
              previous.commitment === values.commitment &&
                previous.approved_security_root_id ===
                  values.approved_security_root_id &&
                previous.destination_ciphertext ===
                  values.destination_ciphertext &&
                previous.asset_address === values.asset_address &&
                previous.valid_from.getTime() === values.valid_from.getTime(),
            );
            return previous;
          }
          if (previous) {
            requireMatch(
              BigInt(values.settlement_epoch) >
                BigInt(previous.settlement_epoch) &&
                values.valid_from >= root.activated_at &&
                values.valid_from >= previous.valid_from,
            );
            await tx
              .update(SettlementVersion)
              .set({ superseded_at: values.valid_from })
              .where(eq(SettlementVersion.id, previous.id));
          }
          return found(
            (
              await tx
                .insert(SettlementVersion)
                .values(values)
                .returning(publicSettlementColumns())
            )[0],
          );
        });
      });
    },
    history(organizationId: bigint, relationshipId: bigint) {
      return safely(async () => {
        recordId.parse(organizationId);
        recordId.parse(relationshipId);
        return db
          .select({
            generation: ApprovedPayeeGeneration,
            root: ApprovedSecurityRoot,
            settlement: publicSettlementColumns(),
          })
          .from(ApprovedPayeeGeneration)
          .innerJoin(
            ApprovedPayee,
            eq(ApprovedPayee.id, ApprovedPayeeGeneration.approved_payee_id),
          )
          .leftJoin(
            ApprovedSecurityRoot,
            eq(
              ApprovedSecurityRoot.approved_payee_generation_id,
              ApprovedPayeeGeneration.id,
            ),
          )
          .leftJoin(
            SettlementVersion,
            eq(
              SettlementVersion.approved_payee_generation_id,
              ApprovedPayeeGeneration.id,
            ),
          )
          .where(
            and(
              eq(ApprovedPayee.organization_id, organizationId),
              eq(ApprovedPayee.id, relationshipId),
            ),
          )
          .orderBy(
            asc(ApprovedPayeeGeneration.generation_number),
            asc(SettlementVersion.settlement_epoch),
          );
      });
    },
  };
}
