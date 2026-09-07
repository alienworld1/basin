import "server-only";

import type { createPersistence } from "@basin/db";

import {
  mapAuthenticatedUser,
  requirePersonalWorkspaceOwner,
  requireVerifiedPrincipal,
} from "../auth/authorization";
import {
  getPrivyEmbeddedController,
  type AuthenticatedPrincipal,
} from "../auth/privy";

type Persistence = ReturnType<typeof createPersistence>;

export async function authorizePersonalIdentity(
  request: Request,
  persistence: Persistence,
  workspaceId: string,
  verifiedPrincipal?: AuthenticatedPrincipal,
) {
  const principal =
    verifiedPrincipal ?? (await requireVerifiedPrincipal(request));
  const user = await mapAuthenticatedUser(persistence, principal);
  const workspace = await requirePersonalWorkspaceOwner(
    persistence,
    user,
    workspaceId,
  );
  const controller = await getPrivyEmbeddedController(principal.privyUserId);
  return { principal, user, workspace, controller };
}
