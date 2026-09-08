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
import {
  pathRecordId,
  replaceInvitationRequest,
} from "@/src/server/payment-access/input";
import { createPaymentAccessService } from "@/src/server/payment-access/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: RouteContext<"/api/organizations/payment-access/invitations/[id]/replace">,
) {
  let persistence:
    ReturnType<typeof createAuthenticatedPersistence> | undefined;
  try {
    requireSameOrigin(request);
    if (!request.headers.get("content-type")?.startsWith("application/json")) {
      return noStoreJson({ error: "Check the details and try again." }, 400);
    }
    const input = replaceInvitationRequest.parse(await request.json());
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
    ).replaceInvitation(
      access,
      user.id,
      invitationId,
      input.idempotencyKey,
      process.env.APP_URL || new URL(request.url).origin,
    );
    return noStoreJson(result, 201, { "Referrer-Policy": "no-referrer" });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return noStoreJson({ error: "Check the details and try again." }, 400);
    }
    return errorResponse(error);
  } finally {
    await persistence?.close();
  }
}
