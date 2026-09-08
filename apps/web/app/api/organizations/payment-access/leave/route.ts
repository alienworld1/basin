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
import { leaveOrganizationRequest } from "@/src/server/payment-access/input";
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
    const input = leaveOrganizationRequest.parse(await request.json());
    persistence = createAuthenticatedPersistence();
    const { user } = await requireAuthenticatedUser(request, persistence);
    let access;
    try {
      access = await requireOrganizationRole(
        persistence,
        user,
        input.workspaceId,
        ["PAYMENT_OPERATOR"],
      );
    } catch (error) {
      if (!(error instanceof AuthError) || error.code !== "FORBIDDEN") {
        throw error;
      }
      const member = await persistence.paymentAccess.membershipContext(
        BigInt(input.workspaceId),
        user.id,
      );
      if (member && member.status !== "ACTIVE") {
        return noStoreJson({ left: true });
      }
      throw error;
    }
    const result = await createPaymentAccessService(persistence).leave(
      access,
      user.id,
    );
    return noStoreJson(result);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return noStoreJson({ error: "Check the details and try again." }, 400);
    }
    return errorResponse(error);
  } finally {
    await persistence?.close();
  }
}
