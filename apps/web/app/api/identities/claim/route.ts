import { createAuthenticatedPersistence } from "@/src/server/auth/persistence";
import { noStoreJson, requireSameOrigin } from "@/src/server/auth/http";
import { authorizePersonalIdentity } from "@/src/server/identities/authorization";
import { identityErrorResponse } from "@/src/server/identities/http";
import { identityClaimRequest } from "@/src/server/identities/input";
import { claimIdentity } from "@/src/server/identities/service";
import { requireVerifiedPrincipal } from "@/src/server/auth/authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let persistence:
    ReturnType<typeof createAuthenticatedPersistence> | undefined;
  try {
    requireSameOrigin(request);
    const principal = await requireVerifiedPrincipal(request);
    if (!request.headers.get("content-type")?.startsWith("application/json")) {
      return noStoreJson({ error: "Check the details and try again." }, 400);
    }
    const input = identityClaimRequest.parse(await request.json());
    persistence = createAuthenticatedPersistence();
    const { workspace, controller } = await authorizePersonalIdentity(
      request,
      persistence,
      input.workspaceId,
      principal,
    );
    const result = await claimIdentity(
      persistence,
      workspace.id,
      input.label,
      controller as `0x${string}`,
    );
    if (!result) {
      return noStoreJson(
        { error: "We couldn't finish identity setup. Check again." },
        503,
      );
    }
    return noStoreJson(result, result.status === "SUBMITTED" ? 202 : 200);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return noStoreJson({ error: "Check the details and try again." }, 400);
    }
    return identityErrorResponse(error);
  } finally {
    await persistence?.close();
  }
}
