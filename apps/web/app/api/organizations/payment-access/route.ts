import {
  requireAuthenticatedUser,
  requireOrganizationRole,
} from "@/src/server/auth/authorization";
import { errorResponse, noStoreJson } from "@/src/server/auth/http";
import { createAuthenticatedPersistence } from "@/src/server/auth/persistence";
import { paymentAccessQuery } from "@/src/server/payment-access/input";
import { createPaymentAccessService } from "@/src/server/payment-access/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  let persistence:
    ReturnType<typeof createAuthenticatedPersistence> | undefined;
  try {
    const url = new URL(request.url);
    if (url.searchParams.size !== 1) {
      return noStoreJson({ error: "Check the details and try again." }, 400);
    }
    const input = paymentAccessQuery.parse(
      Object.fromEntries(url.searchParams.entries()),
    );
    persistence = createAuthenticatedPersistence();
    const { user } = await requireAuthenticatedUser(request, persistence);
    const access = await requireOrganizationRole(
      persistence,
      user,
      input.workspace,
      ["ADMIN"],
    );
    return noStoreJson(
      await createPaymentAccessService(persistence).overview(access),
    );
  } catch (error) {
    return errorResponse(error);
  } finally {
    await persistence?.close();
  }
}
