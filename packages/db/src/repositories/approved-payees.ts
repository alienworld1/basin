import { and, asc, desc, eq, inArray, isNull, lt } from "drizzle-orm";
import { DomainError, recordId } from "@basin/domain";
import { alias } from "drizzle-orm/pg-core";

import type { Database } from "../client";
import { found, safely } from "../errors";
import {
  ApprovedPayee,
  ApprovedPayeeGeneration,
  ApprovedSecurityRoot,
  BasinIdentity,
  Organization,
  OrganizationNamespace,
  RelationshipEvent,
  RelationshipOperation,
  SettlementOperation,
  SettlementVersion,
  Workspace,
} from "../schema/tables";

const unresolved = [
  "PREPARED",
  "AWAITING_AUTHORIZATION",
  "SUBMITTED",
  "NEEDS_ATTENTION",
] as const;

const conflict = () =>
  new DomainError(
    "CONFLICT",
    "This relationship has an action in progress. Check its status first.",
  );

export function approvedPayeeRepository(db: Database) {
  const PayeeWorkspace = alias(Workspace, "approved_payee_workspace");
  const OrganizationWorkspace = alias(
    Workspace,
    "approved_payee_organization_workspace",
  );
  return {
    namespace(organizationId: bigint) {
      return safely(
        async () =>
          (
            await db
              .select()
              .from(OrganizationNamespace)
              .where(
                eq(
                  OrganizationNamespace.organization_id,
                  recordId.parse(organizationId),
                ),
              )
          )[0] ?? null,
      );
    },
    saveNamespace(values: typeof OrganizationNamespace.$inferInsert) {
      return safely(() =>
        db.transaction(async (tx) => {
          const organization = found(
            (
              await tx
                .select()
                .from(Organization)
                .where(eq(Organization.id, values.organization_id))
                .for("update")
            )[0],
          );
          const identity = found(
            (
              await tx
                .select()
                .from(BasinIdentity)
                .where(eq(BasinIdentity.id, values.basin_identity_id))
            )[0],
          );
          if (
            identity.workspace_id !== organization.workspace_id ||
            (organization.basin_identity_id &&
              organization.basin_identity_id !== identity.id)
          )
            throw conflict();
          await tx
            .update(Organization)
            .set({ basin_identity_id: identity.id, updated_at: new Date() })
            .where(eq(Organization.id, organization.id));
          const [inserted] = await tx
            .insert(OrganizationNamespace)
            .values(values)
            .onConflictDoNothing()
            .returning();
          const namespace =
            inserted ??
            found(
              (
                await tx
                  .select()
                  .from(OrganizationNamespace)
                  .where(
                    eq(OrganizationNamespace.organization_id, organization.id),
                  )
              )[0],
            );
          if (
            namespace.basin_identity_id !== identity.id ||
            namespace.registry_address !== values.registry_address ||
            namespace.setup_operation_id !== values.setup_operation_id
          )
            throw conflict();
          return namespace;
        }),
      );
    },
    organizationContext(workspaceId: bigint) {
      return safely(async () => {
        const [row] = await db
          .select({ organization: Organization, identity: BasinIdentity })
          .from(Organization)
          .leftJoin(
            BasinIdentity,
            eq(BasinIdentity.id, Organization.basin_identity_id),
          )
          .where(eq(Organization.workspace_id, recordId.parse(workspaceId)));
        return found(row);
      });
    },
    listForOrganization(organizationId: bigint, cursor?: bigint, limit = 25) {
      return safely(() =>
        db
          .select({
            relationship: ApprovedPayee,
            identity: BasinIdentity,
            payeeWorkspace: PayeeWorkspace,
          })
          .from(ApprovedPayee)
          .innerJoin(
            BasinIdentity,
            eq(BasinIdentity.id, ApprovedPayee.basin_identity_id),
          )
          .innerJoin(
            PayeeWorkspace,
            eq(PayeeWorkspace.id, BasinIdentity.workspace_id),
          )
          .where(
            and(
              eq(ApprovedPayee.organization_id, recordId.parse(organizationId)),
              cursor ? lt(ApprovedPayee.id, recordId.parse(cursor)) : undefined,
            ),
          )
          .orderBy(desc(ApprovedPayee.id))
          .limit(Math.min(Math.max(limit, 1), 50)),
      );
    },
    listForIdentity(identityId: bigint, cursor?: bigint, limit = 25) {
      return safely(() =>
        db
          .select({
            relationship: ApprovedPayee,
            identity: BasinIdentity,
            organization: Organization,
            organizationWorkspace: OrganizationWorkspace,
          })
          .from(ApprovedPayee)
          .innerJoin(
            BasinIdentity,
            eq(BasinIdentity.id, ApprovedPayee.basin_identity_id),
          )
          .innerJoin(
            Organization,
            eq(Organization.id, ApprovedPayee.organization_id),
          )
          .innerJoin(
            OrganizationWorkspace,
            eq(OrganizationWorkspace.id, Organization.workspace_id),
          )
          .where(
            and(
              eq(ApprovedPayee.basin_identity_id, recordId.parse(identityId)),
              cursor ? lt(ApprovedPayee.id, recordId.parse(cursor)) : undefined,
            ),
          )
          .orderBy(desc(ApprovedPayee.id))
          .limit(Math.min(Math.max(limit, 1), 50)),
      );
    },
    receivingReady(relationshipIds: bigint[]) {
      if (relationshipIds.length === 0)
        return Promise.resolve(new Set<bigint>());
      return safely(async () => {
        const [generations, operations] = await Promise.all([
          db
            .select({
              relationshipId: ApprovedPayeeGeneration.approved_payee_id,
              tokenId: ApprovedPayeeGeneration.relationship_token_id,
            })
            .from(ApprovedPayeeGeneration)
            .where(
              and(
                inArray(
                  ApprovedPayeeGeneration.approved_payee_id,
                  relationshipIds,
                ),
                isNull(ApprovedPayeeGeneration.ended_at),
              ),
            ),
          db
            .select({
              relationshipId: SettlementOperation.relationship_id,
              tokenId: SettlementOperation.relationship_token_id,
            })
            .from(SettlementOperation)
            .where(
              and(
                inArray(SettlementOperation.relationship_id, relationshipIds),
                eq(SettlementOperation.status, "CONFIRMED"),
              ),
            ),
        ]);
        const confirmed = new Set(
          operations.map(
            (operation) => `${operation.relationshipId}:${operation.tokenId}`,
          ),
        );
        return new Set(
          generations
            .filter((generation) =>
              confirmed.has(
                `${generation.relationshipId}:${generation.tokenId}`,
              ),
            )
            .map((generation) => generation.relationshipId),
        );
      });
    },
    async detail(relationshipId: bigint) {
      return safely(async () => {
        const [row] = await db
          .select({
            relationship: ApprovedPayee,
            identity: BasinIdentity,
            payeeWorkspace: PayeeWorkspace,
            organization: Organization,
            organizationWorkspace: OrganizationWorkspace,
          })
          .from(ApprovedPayee)
          .innerJoin(
            BasinIdentity,
            eq(BasinIdentity.id, ApprovedPayee.basin_identity_id),
          )
          .innerJoin(
            PayeeWorkspace,
            eq(PayeeWorkspace.id, BasinIdentity.workspace_id),
          )
          .innerJoin(
            Organization,
            eq(Organization.id, ApprovedPayee.organization_id),
          )
          .innerJoin(
            OrganizationWorkspace,
            eq(OrganizationWorkspace.id, Organization.workspace_id),
          )
          .where(eq(ApprovedPayee.id, recordId.parse(relationshipId)));
        if (!row)
          throw new DomainError(
            "NOT_FOUND",
            "We couldn't find that relationship.",
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
        const [settlement] = generation
          ? await db
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
              )
          : [];
        const operations = await db
          .select()
          .from(RelationshipOperation)
          .where(eq(RelationshipOperation.approved_payee_id, relationshipId))
          .orderBy(desc(RelationshipOperation.updated_at));
        const events = await db
          .select()
          .from(RelationshipEvent)
          .where(eq(RelationshipEvent.approved_payee_id, relationshipId))
          .orderBy(asc(RelationshipEvent.occurred_at));
        return {
          ...row,
          generation: generation ?? null,
          root: root ?? null,
          settlement: settlement ?? null,
          operation:
            operations.find((item) =>
              unresolved.includes(item.status as (typeof unresolved)[number]),
            ) ?? null,
          events,
        };
      });
    },
    operation(values: typeof RelationshipOperation.$inferInsert) {
      return safely(() =>
        db.transaction(async (tx) => {
          const [existing] = await tx
            .select()
            .from(RelationshipOperation)
            .where(
              and(
                eq(
                  RelationshipOperation.organization_id,
                  values.organization_id,
                ),
                eq(RelationshipOperation.actor_user_id, values.actor_user_id),
                eq(RelationshipOperation.kind, values.kind),
                eq(
                  RelationshipOperation.idempotency_key,
                  values.idempotency_key,
                ),
              ),
            )
            .for("update");
          if (existing) {
            if (existing.request_hash !== values.request_hash) throw conflict();
            return existing;
          }
          if (values.approved_payee_id) {
            const [active] = await tx
              .select()
              .from(RelationshipOperation)
              .where(
                and(
                  eq(
                    RelationshipOperation.approved_payee_id,
                    values.approved_payee_id,
                  ),
                  inArray(RelationshipOperation.status, [...unresolved]),
                ),
              )
              .for("update");
            if (active) throw conflict();
          }
          return found(
            (
              await tx.insert(RelationshipOperation).values(values).returning()
            )[0],
          );
        }),
      );
    },
    readOperation(operationId: bigint) {
      return safely(async () =>
        found(
          (
            await db
              .select()
              .from(RelationshipOperation)
              .where(eq(RelationshipOperation.id, recordId.parse(operationId)))
          )[0],
        ),
      );
    },
    updateOperation(
      operationId: bigint,
      values: Partial<typeof RelationshipOperation.$inferInsert>,
    ) {
      return safely(async () =>
        found(
          (
            await db
              .update(RelationshipOperation)
              .set({ ...values, updated_at: new Date() })
              .where(eq(RelationshipOperation.id, recordId.parse(operationId)))
              .returning()
          )[0],
        ),
      );
    },
    confirmProposal(values: {
      operationId: bigint;
      relationshipId: bigint;
      relationshipName: string;
      relationshipTokenId: string;
      relationshipNamehash: string;
      relationshipRegistryAddress: string;
      registeredAt: Date;
      expiresAt: Date;
      transactionHashes: string[];
      actorUserId: bigint;
      evidence: Record<string, unknown>;
    }) {
      return safely(() =>
        db.transaction(async (tx) => {
          const relationship = found(
            (
              await tx
                .select()
                .from(ApprovedPayee)
                .where(eq(ApprovedPayee.id, values.relationshipId))
                .for("update")
            )[0],
          );
          const [current] = await tx
            .select()
            .from(ApprovedPayeeGeneration)
            .where(
              and(
                eq(
                  ApprovedPayeeGeneration.approved_payee_id,
                  values.relationshipId,
                ),
                isNull(ApprovedPayeeGeneration.ended_at),
              ),
            )
            .for("update");
          let generation:
            typeof ApprovedPayeeGeneration.$inferSelect | undefined = current;
          let replacedGenerationId: bigint | undefined;
          if (
            current &&
            current.relationship_token_id !== values.relationshipTokenId
          ) {
            if (
              relationship.status !== "REVOKED" &&
              current.expires_at > values.registeredAt
            )
              throw conflict();
            replacedGenerationId = current.id;
            await tx
              .update(ApprovedPayeeGeneration)
              .set({
                ended_at:
                  current.expires_at <= values.registeredAt
                    ? current.expires_at
                    : values.registeredAt,
                end_reason:
                  current.expires_at <= values.registeredAt
                    ? "EXPIRED"
                    : "REPLACED",
              })
              .where(eq(ApprovedPayeeGeneration.id, current.id));
            generation = undefined;
          }
          if (!generation) {
            const [previous] = await tx
              .select()
              .from(ApprovedPayeeGeneration)
              .where(
                eq(
                  ApprovedPayeeGeneration.approved_payee_id,
                  values.relationshipId,
                ),
              )
              .orderBy(desc(ApprovedPayeeGeneration.generation_number))
              .limit(1);
            generation = found(
              (
                await tx
                  .insert(ApprovedPayeeGeneration)
                  .values({
                    approved_payee_id: values.relationshipId,
                    relationship_token_id: values.relationshipTokenId,
                    generation_number: (previous?.generation_number ?? 0) + 1,
                    registered_at: values.registeredAt,
                    expires_at: values.expiresAt,
                    relationship_namehash: values.relationshipNamehash,
                    relationship_registry_address:
                      values.relationshipRegistryAddress,
                  })
                  .returning()
              )[0],
            );
          }
          await tx
            .update(ApprovedPayee)
            .set({
              relationship_name: values.relationshipName,
              status: "PENDING",
              expires_at: values.expiresAt,
              revoked_at: null,
              revocation_cause: null,
              updated_at: new Date(),
            })
            .where(eq(ApprovedPayee.id, relationship.id));
          await tx
            .insert(RelationshipEvent)
            .values({
              operation_id: values.operationId,
              approved_payee_id: values.relationshipId,
              generation_id: generation.id,
              event_type: "PROPOSAL_REGISTERED",
              actor_user_id: values.actorUserId,
              occurred_at: values.registeredAt,
              evidence: values.evidence,
              transaction_hash: values.transactionHashes.at(-1),
              log_index: 0,
            })
            .onConflictDoNothing();
          if (replacedGenerationId) {
            await tx
              .insert(RelationshipEvent)
              .values({
                operation_id: values.operationId,
                approved_payee_id: values.relationshipId,
                generation_id: replacedGenerationId,
                event_type: "GENERATION_REPLACED",
                actor_user_id: values.actorUserId,
                occurred_at: values.registeredAt,
                evidence: {
                  replacementGenerationId: generation.id.toString(),
                },
              })
              .onConflictDoNothing();
          }
          return found(
            (
              await tx
                .update(RelationshipOperation)
                .set({
                  status: "CONFIRMED",
                  step: "COMPLETE",
                  transaction_hashes: values.transactionHashes,
                  last_error_code: null,
                  updated_at: new Date(),
                })
                .where(eq(RelationshipOperation.id, values.operationId))
                .returning()
            )[0],
          );
        }),
      );
    },
    confirmRevocation(values: {
      operationId: bigint;
      relationshipId: bigint;
      generationId: bigint;
      revokedAt: Date;
      reason?: string;
      transactionHashes: string[];
      actorUserId: bigint;
      evidence: Record<string, unknown>;
    }) {
      return safely(() =>
        db.transaction(async (tx) => {
          found(
            (
              await tx
                .select()
                .from(ApprovedPayee)
                .where(eq(ApprovedPayee.id, values.relationshipId))
                .for("update")
            )[0],
          );
          await tx
            .update(ApprovedPayeeGeneration)
            .set({ ended_at: values.revokedAt, end_reason: "REVOKED" })
            .where(
              and(
                eq(ApprovedPayeeGeneration.id, values.generationId),
                isNull(ApprovedPayeeGeneration.ended_at),
              ),
            );
          await tx
            .update(ApprovedPayee)
            .set({
              status: "REVOKED",
              revoked_at: values.revokedAt,
              revocation_cause: values.reason,
              updated_at: new Date(),
            })
            .where(eq(ApprovedPayee.id, values.relationshipId));
          await tx
            .insert(RelationshipEvent)
            .values({
              operation_id: values.operationId,
              approved_payee_id: values.relationshipId,
              generation_id: values.generationId,
              event_type: "REVOCATION_CONFIRMED",
              actor_user_id: values.actorUserId,
              occurred_at: values.revokedAt,
              evidence: values.evidence,
              transaction_hash: values.transactionHashes.at(-1),
              log_index: 0,
            })
            .onConflictDoNothing();
          return found(
            (
              await tx
                .update(RelationshipOperation)
                .set({
                  status: "CONFIRMED",
                  step: "COMPLETE",
                  transaction_hashes: values.transactionHashes,
                  last_error_code: null,
                  updated_at: new Date(),
                })
                .where(eq(RelationshipOperation.id, values.operationId))
                .returning()
            )[0],
          );
        }),
      );
    },
    addEvent(values: typeof RelationshipEvent.$inferInsert) {
      return safely(async () =>
        found(
          (
            await db
              .insert(RelationshipEvent)
              .values(values)
              .onConflictDoUpdate({
                target: [
                  RelationshipEvent.operation_id,
                  RelationshipEvent.event_type,
                ],
                set: { operation_id: values.operation_id },
              })
              .returning()
          )[0],
        ),
      );
    },
  };
}
