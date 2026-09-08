import {
  requireAuthenticatedUser,
  requireOrganizationRole,
} from "@/src/server/auth/authorization";
import { AuthError } from "@/src/server/auth/errors";
import {
  errorResponse,
  noStoreJson,
  requireSameOrigin,
} from "@/src/server/auth/http";
import { createAuthenticatedPersistence } from "@/src/server/auth/persistence";
import { pathRecordId } from "@/src/server/payment-access/input";
import { createPaymentAccessService } from "@/src/server/payment-access/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: RouteContext<"/api/organizations/payment-access/invitations/[id]/revoke">,
) {
  let persistence:
    ReturnType<typeof createAuthenticatedPersistence> | undefined;
  try {
    requireSameOrigin(request);
    if ((await request.text()).trim()) {
      return noStoreJson({ error: "Check the details and try again." }, 400);
    }
    const { id } = await context.params;
    let invitationId: bigint;
    try {
      invitationId = pathRecordId(id);
    } catch {
      throw new AuthError("NOT_FOUND", "We couldn't find that invitation.");
    }
    persistence = createAuthenticatedPersistence();
    const { user } = await requireAuthenticatedUser(request, persistence);
    const invitation =
      await persistence.paymentAccess.invitationContext(invitationId);
    let access;
    try {
      access = await requireOrganizationRole(
        persistence,
        user,
        invitation.workspaceId.toString(),
        ["ADMIN"],
      );
    } catch (error) {
      if (error instanceof AuthError && error.code === "FORBIDDEN") {
        throw new AuthError("NOT_FOUND", "We couldn't find that invitation.");
      }
      throw error;
    }
    const result = await createPaymentAccessService(
      persistence,
    ).revokeInvitation(access, user.id, invitationId);
    return noStoreJson(result, 200, { "Referrer-Policy": "no-referrer" });
  } catch (error) {
    return errorResponse(error);
  } finally {
    await persistence?.close();
  }
}
