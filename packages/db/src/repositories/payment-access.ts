import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { DomainError, displayName, recordId } from "@basin/domain";

import type { Database, Transaction } from "../client";
import { found, safely } from "../errors";
import {
  InvitationOperation,
  Organization,
  OrganizationAccessEvent,
  OrganizationInvitation,
  OrganizationMember,
  User,
  Workspace,
} from "../schema/tables";

type CreateInvitation = {
  organizationId: bigint;
  actorUserId: bigint;
  inviteeLabel: string;
  secretHash: string;
  idempotencyKey: string;
  requestFingerprint: string;
  expiresAt: Date;
};

const changed = () =>
  new DomainError(
    "CONFLICT",
    "This access request changed. Refresh and try again.",
  );

async function recordExpired(
  tx: Transaction,
  invitation: typeof OrganizationInvitation.$inferSelect,
) {
  if (invitation.status !== "PENDING") return invitation;
  const [expired] = await tx
    .update(OrganizationInvitation)
    .set({ status: "EXPIRED", updated_at: new Date() })
    .where(
      and(
        eq(OrganizationInvitation.id, invitation.id),
        eq(OrganizationInvitation.status, "PENDING"),
        lt(OrganizationInvitation.expires_at, sql`now()`),
      ),
    )
    .returning();
  if (!expired) return invitation;
  await tx.insert(OrganizationAccessEvent).values({
    organization_id: expired.organization_id,
    invitation_id: expired.id,
    type: "INVITATION_EXPIRED",
  });
  return expired;
}

export function paymentAccessRepository(db: Database) {
  return {
    activeOperator(organizationId: bigint, memberId: bigint) {
      return safely(async () =>
        Boolean(
          (
            await db
              .select({ id: OrganizationMember.id })
              .from(OrganizationMember)
              .where(
                and(
                  eq(OrganizationMember.id, recordId.parse(memberId)),
                  eq(
                    OrganizationMember.organization_id,
                    recordId.parse(organizationId),
                  ),
                  eq(OrganizationMember.role, "PAYMENT_OPERATOR"),
                  eq(OrganizationMember.status, "ACTIVE"),
                ),
              )
          )[0],
        ),
      );
    },
    overview(organizationId: bigint) {
      return safely(() =>
        db.transaction(async (tx) => {
          recordId.parse(organizationId);
          const expired = await tx
            .select()
            .from(OrganizationInvitation)
            .where(
              and(
                eq(OrganizationInvitation.organization_id, organizationId),
                eq(OrganizationInvitation.status, "PENDING"),
                lt(OrganizationInvitation.expires_at, sql`now()`),
              ),
            )
            .for("update");
          for (const invitation of expired) {
            await recordExpired(tx, invitation);
          }

          const operators = await tx
            .select({
              id: OrganizationMember.id,
              displayName: User.display_name,
              activatedAt: OrganizationMember.activated_at,
            })
            .from(OrganizationMember)
            .innerJoin(User, eq(User.id, OrganizationMember.user_id))
            .where(
              and(
                eq(OrganizationMember.organization_id, organizationId),
                eq(OrganizationMember.role, "PAYMENT_OPERATOR"),
                eq(OrganizationMember.status, "ACTIVE"),
              ),
            )
            .orderBy(OrganizationMember.activated_at);
          const invitations = await tx
            .select({
              id: OrganizationInvitation.id,
              inviteeLabel: OrganizationInvitation.invitee_label,
              status: OrganizationInvitation.status,
              expiresAt: OrganizationInvitation.expires_at,
              createdAt: OrganizationInvitation.created_at,
            })
            .from(OrganizationInvitation)
            .where(
              and(
                eq(OrganizationInvitation.organization_id, organizationId),
                inArray(OrganizationInvitation.status, ["PENDING", "EXPIRED"]),
              ),
            )
            .orderBy(desc(OrganizationInvitation.created_at));
          const events = await tx
            .select({
              id: OrganizationAccessEvent.id,
              type: OrganizationAccessEvent.type,
              inviteeLabel: OrganizationInvitation.invitee_label,
              displayName: User.display_name,
              createdAt: OrganizationAccessEvent.created_at,
            })
            .from(OrganizationAccessEvent)
            .leftJoin(
              OrganizationInvitation,
              eq(
                OrganizationInvitation.id,
                OrganizationAccessEvent.invitation_id,
              ),
            )
            .leftJoin(
              User,
              eq(User.id, OrganizationAccessEvent.subject_user_id),
            )
            .where(eq(OrganizationAccessEvent.organization_id, organizationId))
            .orderBy(desc(OrganizationAccessEvent.created_at))
            .limit(8);
          return { operators, invitations, events };
        }),
      );
    },

    createInvitation(values: CreateInvitation) {
      return safely(() =>
        db.transaction(async (tx) => {
          found(
            (
              await tx
                .select({ id: Organization.id })
                .from(Organization)
                .where(eq(Organization.id, values.organizationId))
                .for("update")
            )[0],
          );
          const [existing] = await tx
            .select({
              operation: InvitationOperation,
              invitation: OrganizationInvitation,
            })
            .from(InvitationOperation)
            .innerJoin(
              OrganizationInvitation,
              eq(OrganizationInvitation.id, InvitationOperation.invitation_id),
            )
            .where(
              and(
                eq(InvitationOperation.organization_id, values.organizationId),
                eq(InvitationOperation.actor_user_id, values.actorUserId),
                eq(InvitationOperation.operation_type, "CREATE_INVITATION"),
                eq(InvitationOperation.idempotency_key, values.idempotencyKey),
              ),
            );
          if (existing) {
            if (
              existing.operation.request_fingerprint !==
              values.requestFingerprint
            ) {
              throw changed();
            }
            return existing.invitation;
          }
          const invitation = found(
            (
              await tx
                .insert(OrganizationInvitation)
                .values({
                  organization_id: values.organizationId,
                  invitee_label: values.inviteeLabel,
                  secret_hash: values.secretHash,
                  expires_at: values.expiresAt,
                  created_by_user_id: values.actorUserId,
                })
                .returning()
            )[0],
          );
          await tx.insert(InvitationOperation).values({
            organization_id: values.organizationId,
            actor_user_id: values.actorUserId,
            operation_type: "CREATE_INVITATION",
            idempotency_key: values.idempotencyKey,
            request_fingerprint: values.requestFingerprint,
            invitation_id: invitation.id,
          });
          await tx.insert(OrganizationAccessEvent).values({
            organization_id: values.organizationId,
            invitation_id: invitation.id,
            actor_user_id: values.actorUserId,
            type: "INVITED",
          });
          return invitation;
        }),
      );
    },

    invitationById(invitationId: bigint) {
      return safely(async () => {
        recordId.parse(invitationId);
        return found(
          (
            await db
              .select()
              .from(OrganizationInvitation)
              .where(eq(OrganizationInvitation.id, invitationId))
          )[0],
        );
      });
    },

    invitationContext(invitationId: bigint) {
      return safely(async () => {
        const [row] = await db
          .select({
            invitation: OrganizationInvitation,
            workspaceId: Organization.workspace_id,
          })
          .from(OrganizationInvitation)
          .innerJoin(
            Organization,
            eq(Organization.id, OrganizationInvitation.organization_id),
          )
          .where(eq(OrganizationInvitation.id, recordId.parse(invitationId)));
        return found(row);
      });
    },

    operatorContext(membershipId: bigint) {
      return safely(async () => {
        const [row] = await db
          .select({
            member: OrganizationMember,
            workspaceId: Organization.workspace_id,
          })
          .from(OrganizationMember)
          .innerJoin(
            Organization,
            eq(Organization.id, OrganizationMember.organization_id),
          )
          .where(
            and(
              eq(OrganizationMember.id, recordId.parse(membershipId)),
              eq(OrganizationMember.role, "PAYMENT_OPERATOR"),
            ),
          );
        return found(row);
      });
    },

    membershipContext(workspaceId: bigint, userId: bigint) {
      return safely(async () => {
        const [row] = await db
          .select({ member: OrganizationMember })
          .from(OrganizationMember)
          .innerJoin(
            Organization,
            eq(Organization.id, OrganizationMember.organization_id),
          )
          .where(
            and(
              eq(Organization.workspace_id, recordId.parse(workspaceId)),
              eq(OrganizationMember.user_id, recordId.parse(userId)),
              eq(OrganizationMember.role, "PAYMENT_OPERATOR"),
            ),
          );
        return row?.member ?? null;
      });
    },

    revokeInvitation(invitationId: bigint, actorUserId: bigint) {
      return safely(() =>
        db.transaction(async (tx) => {
          const invitation = found(
            (
              await tx
                .select()
                .from(OrganizationInvitation)
                .where(
                  eq(OrganizationInvitation.id, recordId.parse(invitationId)),
                )
                .for("update")
            )[0],
          );
          const current = await recordExpired(tx, invitation);
          if (["REVOKED", "EXPIRED"].includes(current.status)) return current;
          if (current.status === "ACCEPTED") throw changed();
          const updated = found(
            (
              await tx
                .update(OrganizationInvitation)
                .set({
                  status: "REVOKED",
                  revoked_by_user_id: actorUserId,
                  revoked_at: new Date(),
                  updated_at: new Date(),
                })
                .where(
                  and(
                    eq(OrganizationInvitation.id, invitationId),
                    eq(OrganizationInvitation.status, "PENDING"),
                  ),
                )
                .returning()
            )[0],
          );
          await tx.insert(OrganizationAccessEvent).values({
            organization_id: updated.organization_id,
            invitation_id: updated.id,
            actor_user_id: actorUserId,
            type: "INVITATION_REVOKED",
          });
          return updated;
        }),
      );
    },

    replaceInvitation(
      oldInvitationId: bigint,
      values: Omit<CreateInvitation, "inviteeLabel">,
    ) {
      return safely(() =>
        db.transaction(async (tx) => {
          const old = found(
            (
              await tx
                .select()
                .from(OrganizationInvitation)
                .where(
                  eq(
                    OrganizationInvitation.id,
                    recordId.parse(oldInvitationId),
                  ),
                )
                .for("update")
            )[0],
          );
          if (old.organization_id !== values.organizationId) throw changed();
          const [existing] = await tx
            .select({
              operation: InvitationOperation,
              invitation: OrganizationInvitation,
            })
            .from(InvitationOperation)
            .innerJoin(
              OrganizationInvitation,
              eq(OrganizationInvitation.id, InvitationOperation.invitation_id),
            )
            .where(
              and(
                eq(InvitationOperation.organization_id, values.organizationId),
                eq(InvitationOperation.actor_user_id, values.actorUserId),
                eq(InvitationOperation.operation_type, "REPLACE_INVITATION"),
                eq(InvitationOperation.idempotency_key, values.idempotencyKey),
              ),
            );
          if (existing) {
            if (
              existing.operation.request_fingerprint !==
              values.requestFingerprint
            ) {
              throw changed();
            }
            return existing.invitation;
          }
          const current = await recordExpired(tx, old);
          if (current.status === "ACCEPTED") throw changed();
          if (current.status === "PENDING") {
            await tx
              .update(OrganizationInvitation)
              .set({
                status: "REVOKED",
                revoked_by_user_id: values.actorUserId,
                revoked_at: new Date(),
                updated_at: new Date(),
              })
              .where(eq(OrganizationInvitation.id, current.id));
            await tx.insert(OrganizationAccessEvent).values({
              organization_id: values.organizationId,
              invitation_id: current.id,
              actor_user_id: values.actorUserId,
              type: "INVITATION_REVOKED",
            });
          }
          const replacement = found(
            (
              await tx
                .insert(OrganizationInvitation)
                .values({
                  organization_id: values.organizationId,
                  invitee_label: old.invitee_label,
                  secret_hash: values.secretHash,
                  expires_at: values.expiresAt,
                  created_by_user_id: values.actorUserId,
                })
                .returning()
            )[0],
          );
          await tx.insert(InvitationOperation).values({
            organization_id: values.organizationId,
            actor_user_id: values.actorUserId,
            operation_type: "REPLACE_INVITATION",
            idempotency_key: values.idempotencyKey,
            request_fingerprint: values.requestFingerprint,
            invitation_id: replacement.id,
          });
          await tx.insert(OrganizationAccessEvent).values({
            organization_id: values.organizationId,
            invitation_id: replacement.id,
            actor_user_id: values.actorUserId,
            type: "INVITED",
          });
          return replacement;
        }),
      );
    },

    preflight(secretHash: string, userId?: bigint) {
      return safely(async () => {
        const [row] = await db
          .select({
            invitation: OrganizationInvitation,
            organizationName: Workspace.display_name,
            workspaceId: Workspace.id,
            membership: OrganizationMember,
            displayName: User.display_name,
            expired: sql<boolean>`${OrganizationInvitation.expires_at} <= now()`,
          })
          .from(OrganizationInvitation)
          .innerJoin(
            Organization,
            eq(Organization.id, OrganizationInvitation.organization_id),
          )
          .innerJoin(Workspace, eq(Workspace.id, Organization.workspace_id))
          .leftJoin(
            OrganizationMember,
            userId
              ? and(
                  eq(OrganizationMember.organization_id, Organization.id),
                  eq(OrganizationMember.user_id, userId),
                )
              : sql`false`,
          )
          .leftJoin(User, userId ? eq(User.id, userId) : sql`false`)
          .where(eq(OrganizationInvitation.secret_hash, secretHash));
        return row ?? null;
      });
    },

    accept(secretHash: string, userId: bigint, suppliedDisplayName?: string) {
      return safely(() =>
        db.transaction(async (tx) => {
          const [lockedInvitation] = await tx
            .select()
            .from(OrganizationInvitation)
            .where(eq(OrganizationInvitation.secret_hash, secretHash))
            .for("update");
          if (!lockedInvitation) return { outcome: "UNAVAILABLE" as const };
          await tx
            .select({ id: Organization.id })
            .from(Organization)
            .where(eq(Organization.id, lockedInvitation.organization_id))
            .for("update");
          const [context] = await tx
            .select({
              organizationName: Workspace.display_name,
              workspaceId: Workspace.id,
              displayName: User.display_name,
            })
            .from(Organization)
            .innerJoin(Workspace, eq(Workspace.id, Organization.workspace_id))
            .innerJoin(User, eq(User.id, userId))
            .where(eq(Organization.id, lockedInvitation.organization_id));
          if (!context) return { outcome: "UNAVAILABLE" as const };
          const [currentMember] = await tx
            .select()
            .from(OrganizationMember)
            .where(
              and(
                eq(
                  OrganizationMember.organization_id,
                  lockedInvitation.organization_id,
                ),
                eq(OrganizationMember.user_id, userId),
              ),
            );
          const invitation = await recordExpired(tx, lockedInvitation);
          if (invitation.status === "EXPIRED")
            return { outcome: "EXPIRED" as const };
          if (invitation.status === "REVOKED")
            return { outcome: "REVOKED" as const };
          if (invitation.status === "ACCEPTED") {
            if (
              invitation.accepted_by_user_id === userId &&
              currentMember?.status === "ACTIVE"
            ) {
              return {
                outcome: "ALREADY_ACCEPTED" as const,
                workspaceId: context.workspaceId,
                organizationName: context.organizationName,
              };
            }
            return { outcome: "UNAVAILABLE" as const };
          }
          if (currentMember?.status === "ACTIVE") {
            return {
              outcome: "ALREADY_MEMBER" as const,
              workspaceId: context.workspaceId,
              organizationName: context.organizationName,
            };
          }
          let safeDisplayName = context.displayName;
          if (!safeDisplayName) {
            if (!suppliedDisplayName)
              return { outcome: "NAME_REQUIRED" as const };
            safeDisplayName = displayName.parse(suppliedDisplayName);
            await tx
              .update(User)
              .set({ display_name: safeDisplayName, updated_at: new Date() })
              .where(
                and(eq(User.id, userId), sql`${User.display_name} is null`),
              );
          }
          const reactivated = Boolean(currentMember);
          const membership = currentMember
            ? found(
                (
                  await tx
                    .update(OrganizationMember)
                    .set({
                      status: "ACTIVE",
                      activated_at: new Date(),
                      removed_at: null,
                      removed_by_user_id: null,
                      left_at: null,
                      updated_at: new Date(),
                    })
                    .where(
                      and(
                        eq(OrganizationMember.id, currentMember.id),
                        eq(OrganizationMember.role, "PAYMENT_OPERATOR"),
                      ),
                    )
                    .returning()
                )[0],
              )
            : found(
                (
                  await tx
                    .insert(OrganizationMember)
                    .values({
                      organization_id: invitation.organization_id,
                      user_id: userId,
                      role: "PAYMENT_OPERATOR",
                    })
                    .returning()
                )[0],
              );
          await tx
            .update(OrganizationInvitation)
            .set({
              status: "ACCEPTED",
              accepted_by_user_id: userId,
              accepted_at: new Date(),
              updated_at: new Date(),
            })
            .where(
              and(
                eq(OrganizationInvitation.id, invitation.id),
                eq(OrganizationInvitation.status, "PENDING"),
              ),
            );
          await tx.insert(OrganizationAccessEvent).values({
            organization_id: invitation.organization_id,
            membership_id: membership.id,
            invitation_id: invitation.id,
            actor_user_id: userId,
            subject_user_id: userId,
            type: reactivated ? "REINSTATED" : "JOINED",
          });
          return {
            outcome: "ACCEPTED" as const,
            workspaceId: context.workspaceId,
            organizationName: context.organizationName,
            displayName: safeDisplayName,
          };
        }),
      );
    },

    removeOperator(
      organizationId: bigint,
      membershipId: bigint,
      actorUserId: bigint,
    ) {
      return safely(() =>
        db.transaction(async (tx) => {
          const member = found(
            (
              await tx
                .select()
                .from(OrganizationMember)
                .where(
                  and(
                    eq(OrganizationMember.id, recordId.parse(membershipId)),
                    eq(OrganizationMember.organization_id, organizationId),
                    eq(OrganizationMember.role, "PAYMENT_OPERATOR"),
                  ),
                )
                .for("update")
            )[0],
          );
          if (member.status !== "ACTIVE") return member;
          const updated = found(
            (
              await tx
                .update(OrganizationMember)
                .set({
                  status: "REMOVED",
                  removed_at: new Date(),
                  removed_by_user_id: actorUserId,
                  updated_at: new Date(),
                })
                .where(
                  and(
                    eq(OrganizationMember.id, member.id),
                    eq(OrganizationMember.status, "ACTIVE"),
                  ),
                )
                .returning()
            )[0],
          );
          await tx.insert(OrganizationAccessEvent).values({
            organization_id: organizationId,
            membership_id: updated.id,
            actor_user_id: actorUserId,
            subject_user_id: updated.user_id,
            type: "REMOVED",
          });
          return updated;
        }),
      );
    },

    leaveOrganization(organizationId: bigint, userId: bigint) {
      return safely(() =>
        db.transaction(async (tx) => {
          const member = found(
            (
              await tx
                .select()
                .from(OrganizationMember)
                .where(
                  and(
                    eq(OrganizationMember.organization_id, organizationId),
                    eq(OrganizationMember.user_id, userId),
                    eq(OrganizationMember.role, "PAYMENT_OPERATOR"),
                  ),
                )
                .for("update")
            )[0],
          );
          if (member.status !== "ACTIVE") return member;
          const updated = found(
            (
              await tx
                .update(OrganizationMember)
                .set({
                  status: "LEFT",
                  left_at: new Date(),
                  updated_at: new Date(),
                })
                .where(
                  and(
                    eq(OrganizationMember.id, member.id),
                    eq(OrganizationMember.status, "ACTIVE"),
                  ),
                )
                .returning()
            )[0],
          );
          await tx.insert(OrganizationAccessEvent).values({
            organization_id: organizationId,
            membership_id: updated.id,
            actor_user_id: userId,
            subject_user_id: userId,
            type: "LEFT",
          });
          return updated;
        }),
      );
    },
  };
}
