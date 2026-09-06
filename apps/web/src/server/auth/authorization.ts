import "server-only";

import { DomainError, memberRoles, recordId } from "@basin/domain";
import { createPersistence } from "@basin/db";

import { AuthError } from "./errors";
import {
  verifyPrivyAccessToken,
  type AuthenticatedPrincipal,
  type TokenVerifier,
} from "./privy";

type Persistence = ReturnType<typeof createPersistence>;
type BasinUser = Awaited<
  ReturnType<Persistence["workspaces"]["findOrCreateUser"]>
>;

export function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization || authorization.includes(",")) {
    throw new AuthError("UNAUTHENTICATED", "Your session ended.");
  }
  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  if (!match) throw new AuthError("UNAUTHENTICATED", "Your session ended.");
  return match[1];
}

export async function requireAuthenticatedUser(
  request: Request,
  persistence: Persistence,
  verify: TokenVerifier = verifyPrivyAccessToken,
): Promise<{ principal: AuthenticatedPrincipal; user: BasinUser }> {
  const principal = await requireVerifiedPrincipal(request, verify);
  const user = await mapAuthenticatedUser(persistence, principal);
  return { principal, user };
}

export function requireVerifiedPrincipal(
  request: Request,
  verify: TokenVerifier = verifyPrivyAccessToken,
) {
  return verify(readBearerToken(request));
}

export async function mapAuthenticatedUser(
  persistence: Persistence,
  principal: AuthenticatedPrincipal,
) {
  try {
    return await persistence.workspaces.findOrCreateUser({
      privy_user_id: principal.privyUserId,
    });
  } catch (error) {
    if (error instanceof DomainError && error.code === "UNAVAILABLE") {
      throw new AuthError("UNAVAILABLE", error.message);
    }
    throw error;
  }
}

export async function requireWorkspaceAccess(
  persistence: Persistence,
  user: BasinUser,
  workspaceId: string,
) {
  let id: bigint;
  try {
    if (!/^[1-9]\d*$/.test(workspaceId)) throw new Error();
    id = recordId.parse(BigInt(workspaceId));
  } catch {
    throw new AuthError("NOT_FOUND", "We couldn't find that workspace.");
  }
  try {
    return await persistence.workspaces.readWorkspaceAccess(user.id, id);
  } catch (error) {
    if (error instanceof DomainError && error.code === "NOT_FOUND") {
      throw new AuthError(
        "FORBIDDEN",
        "You don't have access to this workspace.",
      );
    }
    throw error;
  }
}

export async function requireOrganizationRole(
  persistence: Persistence,
  user: BasinUser,
  workspaceId: string,
  allowedRoles: readonly (typeof memberRoles)[number][],
) {
  const access = await requireWorkspaceAccess(persistence, user, workspaceId);
  if (
    access.workspace.type !== "ORGANIZATION" ||
    !access.memberRole ||
    !allowedRoles.includes(access.memberRole)
  ) {
    throw new AuthError("FORBIDDEN", "You don't have permission to do that.");
  }
  return access;
}
