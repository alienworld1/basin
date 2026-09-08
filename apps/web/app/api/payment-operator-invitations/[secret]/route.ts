import {
  mapAuthenticatedUser,
  requireVerifiedPrincipal,
} from "@/src/server/auth/authorization";
import { errorResponse, noStoreJson } from "@/src/server/auth/http";
import { createAuthenticatedPersistence } from "@/src/server/auth/persistence";
import { enforceInvitationRateLimit } from "@/src/server/payment-access/rate-limit";
import { createPaymentAccessService } from "@/src/server/payment-access/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const inviteHeaders = { "Referrer-Policy": "no-referrer" };

export async function GET(
  request: Request,
  context: RouteContext<"/api/payment-operator-invitations/[secret]">,
) {
  let persistence:
    ReturnType<typeof createAuthenticatedPersistence> | undefined;
  try {
    enforceInvitationRateLimit(request);
    const { secret } = await context.params;
    if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) {
      return noStoreJson(
        {
          state: "UNAVAILABLE",
          authenticated: request.headers.has("authorization"),
        },
        200,
        inviteHeaders,
      );
    }
    persistence = createAuthenticatedPersistence();
    let userId: bigint | undefined;
    if (request.headers.has("authorization")) {
      const principal = await requireVerifiedPrincipal(request);
      userId = (await mapAuthenticatedUser(persistence, principal)).id;
    }
    const result = await createPaymentAccessService(persistence).review(
      secret,
      userId,
    );
    return noStoreJson(result, 200, inviteHeaders);
  } catch (error) {
    const response = errorResponse(error);
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } finally {
    await persistence?.close();
  }
}
