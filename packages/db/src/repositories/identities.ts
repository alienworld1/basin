import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { ensName, hash, recordId } from "@basin/domain";
import {
  BasinIdentity,
  IdentityAuthorityVersion,
  ApprovedPayee,
  ApprovedPayeeGeneration,
} from "../schema/tables";
import { basinIdentityInput, identityAuthorityVersionInput } from "../inputs";
import type { Database } from "../client";
import type { VerifiedIdentity, VerifiedIdentityAuthority } from "../evidence";
import { requireEvidence } from "../evidence-registry";
import { found, requireMatch, safely } from "../errors";

export function identityRepository(db: Database) {
  return {
    create(workspaceId: bigint, evidence: VerifiedIdentity) {
      return safely(async () => {
        recordId.parse(workspaceId);
        requireEvidence(evidence, "identity");
        const values = basinIdentityInput.parse(evidence);
        requireMatch(values.workspace_id === workspaceId);
        return found(
          (await db.insert(BasinIdentity).values(values).returning())[0],
        );
      });
    },
    findByPayeeId(payeeId: string) {
      return safely(async () =>
        found(
          (
            await db
              .select()
              .from(BasinIdentity)
              .where(eq(BasinIdentity.payee_id, hash.parse(payeeId)))
          )[0],
        ),
      );
    },
    findByName(name: string) {
      return safely(async () =>
        found(
          (
            await db
              .select()
              .from(BasinIdentity)
              .where(eq(BasinIdentity.ens_name, ensName.parse(name)))
          )[0],
        ),
      );
    },
    appendAuthority(workspaceId: bigint, evidence: VerifiedIdentityAuthority) {
      return safely(async () => {
        recordId.parse(workspaceId);
        requireEvidence(evidence, "identityAuthority");
        const values = identityAuthorityVersionInput.parse(evidence);
        requireMatch(!values.superseded_at);
        return db.transaction(async (tx) => {
          const identity = found(
            (
              await tx
                .select()
                .from(BasinIdentity)
                .where(
                  and(
                    eq(BasinIdentity.id, values.basin_identity_id),
                    eq(BasinIdentity.workspace_id, workspaceId),
                  ),
                )
                .for("update")
            )[0],
          );
          const [previous] = await tx
            .select()
            .from(IdentityAuthorityVersion)
            .where(
              and(
                eq(IdentityAuthorityVersion.basin_identity_id, identity.id),
                isNull(IdentityAuthorityVersion.superseded_at),
              ),
            );
          if (previous) {
            requireMatch(
              BigInt(values.identity_epoch) > BigInt(previous.identity_epoch) &&
                values.valid_from >= previous.valid_from,
            );
            await tx
              .update(IdentityAuthorityVersion)
              .set({ superseded_at: values.valid_from })
              .where(eq(IdentityAuthorityVersion.id, previous.id));
          } else
            requireMatch(
              BigInt(values.identity_epoch) >= BigInt(identity.identity_epoch),
            );
          const version = found(
            (
              await tx
                .insert(IdentityAuthorityVersion)
                .values(values)
                .returning()
            )[0],
          );
          const changed =
            identity.controller_address !== values.controller_address ||
            identity.identity_epoch !== values.identity_epoch ||
            identity.resolver_address !== values.identity_resolver_address;
          await tx
            .update(BasinIdentity)
            .set({
              identity_epoch: values.identity_epoch,
              controller_address: values.controller_address,
              resolver_address: values.identity_resolver_address,
              updated_at: new Date(),
            })
            .where(eq(BasinIdentity.id, identity.id));
          if (changed) {
            const relationships = await tx
              .update(ApprovedPayee)
              .set({ status: "REAPPROVAL_REQUIRED", updated_at: new Date() })
              .where(
                and(
                  eq(ApprovedPayee.basin_identity_id, identity.id),
                  eq(ApprovedPayee.status, "ACTIVE"),
                ),
              )
              .returning({ id: ApprovedPayee.id });
            if (relationships.length)
              await tx
                .update(ApprovedPayeeGeneration)
                .set({
                  ended_at: values.valid_from,
                  end_reason: "SECURITY_ROOT_CHANGED",
                })
                .where(
                  and(
                    inArray(
                      ApprovedPayeeGeneration.approved_payee_id,
                      relationships.map((row) => row.id),
                    ),
                    isNull(ApprovedPayeeGeneration.ended_at),
                  ),
                );
          }
          return version;
        });
      });
    },
    authorityHistory(workspaceId: bigint, identityId: bigint) {
      return safely(async () => {
        recordId.parse(workspaceId);
        recordId.parse(identityId);
        return db
          .select({ version: IdentityAuthorityVersion })
          .from(IdentityAuthorityVersion)
          .innerJoin(
            BasinIdentity,
            eq(BasinIdentity.id, IdentityAuthorityVersion.basin_identity_id),
          )
          .where(
            and(
              eq(BasinIdentity.id, identityId),
              eq(BasinIdentity.workspace_id, workspaceId),
            ),
          )
          .orderBy(asc(IdentityAuthorityVersion.identity_epoch));
      });
    },
  };
}
