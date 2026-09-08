import "server-only";

import { createHash, createHmac } from "node:crypto";
import type { createPersistence } from "@basin/db";
import { DomainError } from "@basin/domain";

import type {
  InvitationAcceptance,
  InvitationLinkResult,
  InvitationReview,
  PaymentAccessOverview,
} from "../../shared/payment-access-types";

type Persistence = ReturnType<typeof createPersistence>;
type Access = Awaited<
  ReturnType<Persistence["workspaces"]["readWorkspaceAccess"]>
>;

const INVITATION_VERSION = 1;
const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

const fingerprint = (value: unknown) =>
  `0x${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;

const secretHash = (secret: string) =>
  `0x${createHash("sha256")
    .update(`basin:operator-invite:v${INVITATION_VERSION}:${secret}`)
    .digest("hex")}`;

function invitationSecret(
  organizationId: bigint,
  actorUserId: bigint,
  idempotencyKey: string,
  requestFingerprint: string,
) {
  const key = process.env.PRIVY_APP_SECRET;
  if (!key) {
    throw new DomainError(
      "UNAVAILABLE",
      "Invitation creation is unavailable in this environment.",
    );
  }
  return createHmac("sha256", key)
    .update(
      `basin:operator-invite:secret:v${INVITATION_VERSION}:${organizationId}:${actorUserId}:${idempotencyKey}:${requestFingerprint}`,
    )
    .digest("base64url");
}

function inviteSummary(
  invitation: Awaited<
    ReturnType<Persistence["paymentAccess"]["invitationById"]>
  >,
) {
  return {
    id: invitation.id.toString(),
    inviteeLabel: invitation.invitee_label,
    status: invitation.status as "PENDING" | "EXPIRED",
    expiresAt: invitation.expires_at.toISOString(),
    createdAt: invitation.created_at.toISOString(),
  };
}

export function createPaymentAccessService(persistence: Persistence) {
  return {
    async overview(access: Access): Promise<PaymentAccessOverview> {
      if (!access.organizationId || access.memberRole !== "ADMIN") {
        throw new Error("Administrator access required");
      }
      const result = await persistence.paymentAccess.overview(
        access.organizationId,
      );
      return {
        organizationName: access.workspace.display_name,
        role: "ADMIN",
        operators: result.operators.map((operator) => ({
          id: operator.id.toString(),
          displayName: operator.displayName ?? "Payment operator",
          activatedAt: operator.activatedAt.toISOString(),
        })),
        invitations: result.invitations.map((invitation) => ({
          id: invitation.id.toString(),
          inviteeLabel: invitation.inviteeLabel,
          status: invitation.status as "PENDING" | "EXPIRED",
          expiresAt: invitation.expiresAt.toISOString(),
          createdAt: invitation.createdAt.toISOString(),
        })),
        activity: result.events.map((event) => ({
          id: event.id.toString(),
          type: event.type,
          label: event.displayName ?? event.inviteeLabel ?? "Payment access",
          createdAt: event.createdAt.toISOString(),
        })),
      };
    },

    async createInvitation(
      access: Access,
      actorUserId: bigint,
      inviteeLabel: string,
      idempotencyKey: string,
      baseUrl: string,
    ): Promise<InvitationLinkResult> {
      if (!access.organizationId || access.memberRole !== "ADMIN") {
        throw new Error("Administrator access required");
      }
      const requestFingerprint = fingerprint({
        workspaceId: access.workspace.id.toString(),
        inviteeLabel,
      });
      const secret = invitationSecret(
        access.organizationId,
        actorUserId,
        idempotencyKey,
        requestFingerprint,
      );
      const invitation = await persistence.paymentAccess.createInvitation({
        organizationId: access.organizationId,
        actorUserId,
        inviteeLabel,
        secretHash: secretHash(secret),
        idempotencyKey,
        requestFingerprint,
        expiresAt: new Date(Date.now() + INVITATION_LIFETIME_MS),
      });
      return {
        invitation: inviteSummary(invitation),
        invitationUrl: new URL(
          `/invite/payment-operator/${encodeURIComponent(secret)}`,
          baseUrl,
        ).toString(),
      };
    },

    async revokeInvitation(
      access: Access,
      actorUserId: bigint,
      invitationId: bigint,
    ) {
      if (!access.organizationId || access.memberRole !== "ADMIN") {
        throw new Error("Administrator access required");
      }
      const invitation =
        await persistence.paymentAccess.invitationById(invitationId);
      if (invitation.organization_id !== access.organizationId) {
        throw new DomainError("NOT_FOUND", "We couldn't find that invitation.");
      }
      await persistence.paymentAccess.revokeInvitation(
        invitationId,
        actorUserId,
      );
      return { revoked: true as const };
    },

    async replaceInvitation(
      access: Access,
      actorUserId: bigint,
      invitationId: bigint,
      idempotencyKey: string,
      baseUrl: string,
    ): Promise<InvitationLinkResult> {
      if (!access.organizationId || access.memberRole !== "ADMIN") {
        throw new Error("Administrator access required");
      }
      const old = await persistence.paymentAccess.invitationById(invitationId);
      if (old.organization_id !== access.organizationId) {
        throw new DomainError("NOT_FOUND", "We couldn't find that invitation.");
      }
      const requestFingerprint = fingerprint({
        invitationId: invitationId.toString(),
      });
      const secret = invitationSecret(
        access.organizationId,
        actorUserId,
        idempotencyKey,
        requestFingerprint,
      );
      const replacement = await persistence.paymentAccess.replaceInvitation(
        invitationId,
        {
          organizationId: access.organizationId,
          actorUserId,
          secretHash: secretHash(secret),
          idempotencyKey,
          requestFingerprint,
          expiresAt: new Date(Date.now() + INVITATION_LIFETIME_MS),
        },
      );
      return {
        invitation: inviteSummary(replacement),
        invitationUrl: new URL(
          `/invite/payment-operator/${encodeURIComponent(secret)}`,
          baseUrl,
        ).toString(),
      };
    },

    async review(secret: string, userId?: bigint): Promise<InvitationReview> {
      const row = await persistence.paymentAccess.preflight(
        secretHash(secret),
        userId,
      );
      if (!row) return { state: "UNAVAILABLE", authenticated: Boolean(userId) };
      const status =
        row.expired && row.invitation.status === "PENDING"
          ? "EXPIRED"
          : row.invitation.status;
      if (status === "EXPIRED" || status === "REVOKED") {
        return { state: status, authenticated: Boolean(userId) };
      }
      if (status === "ACCEPTED") {
        if (!userId) {
          return { state: "UNAVAILABLE", authenticated: false };
        }
        if (
          row.invitation.accepted_by_user_id === userId &&
          row.membership?.status === "ACTIVE"
        ) {
          return {
            state: "ALREADY_ACCEPTED",
            authenticated: true,
            organizationName: row.organizationName,
            expiresAt: row.invitation.expires_at.toISOString(),
            needsDisplayName: !row.displayName,
            workspaceId: row.workspaceId.toString(),
          };
        }
        return { state: "UNAVAILABLE", authenticated: true };
      }
      if (!userId) return { state: "VALID", authenticated: false };
      if (row.membership?.status === "ACTIVE") {
        return {
          state: "ALREADY_MEMBER",
          authenticated: true,
          organizationName: row.organizationName,
          expiresAt: row.invitation.expires_at.toISOString(),
          needsDisplayName: !row.displayName,
          workspaceId: row.workspaceId.toString(),
        };
      }
      return {
        state: "VALID",
        authenticated: true,
        organizationName: row.organizationName,
        expiresAt: row.invitation.expires_at.toISOString(),
        needsDisplayName: !row.displayName,
        workspaceId: row.workspaceId.toString(),
      };
    },

    async accept(
      secret: string,
      userId: bigint,
      suppliedDisplayName?: string,
    ): Promise<InvitationAcceptance> {
      const result = await persistence.paymentAccess.accept(
        secretHash(secret),
        userId,
        suppliedDisplayName,
      );
      if (
        result.outcome === "ACCEPTED" ||
        result.outcome === "ALREADY_ACCEPTED" ||
        result.outcome === "ALREADY_MEMBER"
      ) {
        return {
          state: result.outcome,
          organizationName: result.organizationName,
          workspaceId: result.workspaceId.toString(),
        };
      }
      return { state: result.outcome };
    },

    async removeOperator(
      access: Access,
      actorUserId: bigint,
      membershipId: bigint,
    ) {
      if (!access.organizationId || access.memberRole !== "ADMIN") {
        throw new Error("Administrator access required");
      }
      await persistence.paymentAccess.removeOperator(
        access.organizationId,
        membershipId,
        actorUserId,
      );
      return { removed: true as const };
    },

    async leave(access: Access, userId: bigint) {
      if (!access.organizationId || access.memberRole !== "PAYMENT_OPERATOR") {
        throw new Error("Payment operator access required");
      }
      await persistence.paymentAccess.leaveOrganization(
        access.organizationId,
        userId,
      );
      return { left: true as const };
    },
  };
}
