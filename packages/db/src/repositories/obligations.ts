import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  assertObligationTransition,
  chainInteger,
  hash,
  recordId,
} from "@basin/domain";
import {
  ApprovedPayeeGeneration,
  ApprovedSecurityRoot,
  Obligation,
  OrganizationMember,
} from "../schema/tables";
import { obligationInput } from "../inputs";
import type { Database, Transaction } from "../client";
import type {
  VerifiedObligation,
  VerifiedObligationProjection,
} from "../evidence";
import { requireEvidence } from "../evidence-registry";
import { found, requireMatch, safely } from "../errors";
import { lockedRelationship } from "./relationships";

export async function lockedObligation(
  tx: Transaction,
  organizationId: bigint,
  id: bigint,
) {
  return found(
    (
      await tx
        .select()
        .from(Obligation)
        .where(
          and(
            eq(Obligation.organization_id, organizationId),
            eq(Obligation.id, id),
          ),
        )
        .for("update")
    )[0],
  );
}
const projectionInput = z.strictObject({
  obligation_record_id: recordId,
  status: z.enum(["ACTIVE", "CONSUMED", "CANCELLED", "EXPIRED"]),
  remaining_amount_base_units: chainInteger,
  creation_transaction_hash: hash.optional(),
  creation_block_number: chainInteger.optional(),
  creation_log_index: z.number().int().nonnegative().max(2147483647).optional(),
});
export function obligationRepository(db: Database) {
  return {
    createFromRouter(organizationId: bigint, evidence: VerifiedObligation) {
      return safely(async () => {
        recordId.parse(organizationId);
        requireEvidence(evidence, "obligation");
        const values = obligationInput.parse(evidence);
        requireMatch(
          values.organization_id === organizationId &&
            ["PENDING", "ACTIVE"].includes(values.status) &&
            values.valid_until > new Date(),
        );
        requireMatch(
          values.remaining_amount_base_units === values.max_amount_base_units,
        );
        if (values.status === "ACTIVE")
          requireMatch(
            values.creation_transaction_hash &&
              values.creation_block_number != null &&
              values.creation_log_index != null,
          );
        return db.transaction(async (tx) => {
          const relationship = await lockedRelationship(
            tx,
            organizationId,
            values.approved_payee_id,
          );
          const generation = found(
            (
              await tx
                .select()
                .from(ApprovedPayeeGeneration)
                .where(
                  and(
                    eq(
                      ApprovedPayeeGeneration.id,
                      values.approved_payee_generation_id,
                    ),
                    eq(
                      ApprovedPayeeGeneration.approved_payee_id,
                      relationship.id,
                    ),
                  ),
                )
            )[0],
          );
          const root = found(
            (
              await tx
                .select()
                .from(ApprovedSecurityRoot)
                .where(
                  eq(
                    ApprovedSecurityRoot.approved_payee_generation_id,
                    generation.id,
                  ),
                )
            )[0],
          );
          requireMatch(
            relationship.status === "ACTIVE" &&
              !generation.ended_at &&
              generation.expires_at > new Date(),
          );
          requireMatch(
            values.organization_wallet_address ===
              root.organization_wallet_address &&
              values.router_address === root.acceptance_verifying_contract,
          );
          if (values.created_by_member_id)
            found(
              (
                await tx
                  .select()
                  .from(OrganizationMember)
                  .where(
                    and(
                      eq(OrganizationMember.id, values.created_by_member_id),
                      eq(OrganizationMember.organization_id, organizationId),
                    ),
                  )
              )[0],
            );
          return found(
            (await tx.insert(Obligation).values(values).returning())[0],
          );
        });
      });
    },
    reconcileFromRouter(
      organizationId: bigint,
      evidence: VerifiedObligationProjection,
    ) {
      return safely(async () => {
        recordId.parse(organizationId);
        requireEvidence(evidence, "obligationProjection");
        const values = projectionInput.parse(evidence);
        return db.transaction(async (tx) => {
          const current = await lockedObligation(
            tx,
            organizationId,
            values.obligation_record_id,
          );
          const creation = {
            creation_transaction_hash:
              values.creation_transaction_hash ??
              current.creation_transaction_hash,
            creation_block_number:
              values.creation_block_number ?? current.creation_block_number,
            creation_log_index:
              values.creation_log_index ?? current.creation_log_index,
          };
          for (const field of [
            "creation_transaction_hash",
            "creation_block_number",
            "creation_log_index",
          ] as const) {
            requireMatch(
              current[field] == null || creation[field] === current[field],
            );
          }
          if (values.status === "ACTIVE")
            requireMatch(
              creation.creation_transaction_hash &&
                creation.creation_block_number != null &&
                creation.creation_log_index != null,
            );
          assertObligationTransition(
            current.status,
            values.status,
            current.remaining_amount_base_units,
            values.remaining_amount_base_units,
          );
          requireMatch(
            values.status !== "ACTIVE" || current.valid_until > new Date(),
          );
          requireMatch(
            values.status !== "EXPIRED" || current.valid_until <= new Date(),
          );
          return found(
            (
              await tx
                .update(Obligation)
                .set({
                  ...creation,
                  status: values.status,
                  remaining_amount_base_units:
                    values.remaining_amount_base_units,
                  updated_at: new Date(),
                })
                .where(eq(Obligation.id, current.id))
                .returning()
            )[0],
          );
        });
      });
    },
    read(organizationId: bigint, obligationId: bigint) {
      return safely(async () => {
        recordId.parse(organizationId);
        recordId.parse(obligationId);
        return found(
          (
            await db
              .select()
              .from(Obligation)
              .where(
                and(
                  eq(Obligation.organization_id, organizationId),
                  eq(Obligation.id, obligationId),
                ),
              )
          )[0],
        );
      });
    },
  };
}
