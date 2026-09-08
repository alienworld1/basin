import {
  requireAuthenticatedUser,
  requireOrganizationRole,
} from "@/src/server/auth/authorization";
import {
  errorResponse,
  noStoreJson,
  requireSameOrigin,
} from "@/src/server/auth/http";
import { createAuthenticatedPersistence } from "@/src/server/auth/persistence";
import { createInvitationRequest } from "@/src/server/payment-access/input";
import { createPaymentAccessService } from "@/src/server/payment-access/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let persistence:
    ReturnType<typeof createAuthenticatedPersistence> | undefined;
  try {
    requireSameOrigin(request);
    if (!request.headers.get("content-type")?.startsWith("application/json")) {
      return noStoreJson({ error: "Check the details and try again." }, 400);
    }
    const input = createInvitationRequest.parse(await request.json());
    persistence = createAuthenticatedPersistence();
    const { user } = await requireAuthenticatedUser(request, persistence);
    const access = await requireOrganizationRole(
      persistence,
      user,
      input.workspaceId,
      ["ADMIN"],
    );
    const result = await createPaymentAccessService(
      persistence,
    ).createInvitation(
      access,
      user.id,
      input.inviteeLabel,
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
