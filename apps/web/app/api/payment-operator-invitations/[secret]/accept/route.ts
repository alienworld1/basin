import { requireAuthenticatedUser } from "@/src/server/auth/authorization";
import {
  errorResponse,
  noStoreJson,
  requireSameOrigin,
} from "@/src/server/auth/http";
import { createAuthenticatedPersistence } from "@/src/server/auth/persistence";
import { acceptInvitationRequest } from "@/src/server/payment-access/input";
import { enforceInvitationRateLimit } from "@/src/server/payment-access/rate-limit";
import { createPaymentAccessService } from "@/src/server/payment-access/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const inviteHeaders = { "Referrer-Policy": "no-referrer" };

export async function POST(
  request: Request,
  context: RouteContext<"/api/payment-operator-invitations/[secret]/accept">,
) {
  let persistence:
    ReturnType<typeof createAuthenticatedPersistence> | undefined;
  try {
    enforceInvitationRateLimit(request);
    requireSameOrigin(request);
    if (!request.headers.get("content-type")?.startsWith("application/json")) {
      return noStoreJson(
        { error: "Check the details and try again." },
        400,
        inviteHeaders,
      );
    }
    const input = acceptInvitationRequest.parse(await request.json());
    const { secret } = await context.params;
    if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) {
      return noStoreJson({ state: "UNAVAILABLE" }, 200, inviteHeaders);
    }
    persistence = createAuthenticatedPersistence();
    const { user } = await requireAuthenticatedUser(request, persistence);
    const result = await createPaymentAccessService(persistence).accept(
      secret,
      user.id,
      input.displayName,
    );
    return noStoreJson(result, 200, inviteHeaders);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return noStoreJson(
        { error: "Check the details and try again." },
        400,
        inviteHeaders,
      );
    }
    const response = errorResponse(error);
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } finally {
    await persistence?.close();
  }
}
