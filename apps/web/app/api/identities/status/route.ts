import { createAuthenticatedPersistence } from "@/src/server/auth/persistence";
import { noStoreJson } from "@/src/server/auth/http";
import { authorizePersonalIdentity } from "@/src/server/identities/authorization";
import { identityErrorResponse } from "@/src/server/identities/http";
import {
  identityStatusQuery,
  readStrictIdentityQuery,
} from "@/src/server/identities/input";
import { reconcileIdentity } from "@/src/server/identities/service";
import { requireVerifiedPrincipal } from "@/src/server/auth/authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  let persistence:
    ReturnType<typeof createAuthenticatedPersistence> | undefined;
  try {
    const principal = await requireVerifiedPrincipal(request);
    const query = identityStatusQuery.parse(
      readStrictIdentityQuery(new URL(request.url), [
        "workspace",
        "name",
        "transaction",
      ]),
    );
    persistence = createAuthenticatedPersistence();
    const { workspace, controller } = await authorizePersonalIdentity(
      request,
      persistence,
      query.workspace,
      principal,
    );
    const status = await reconcileIdentity(
      persistence,
      workspace.id,
      query.name,
      controller as `0x${string}`,
      query.transaction as `0x${string}` | undefined,
    );
    return noStoreJson(status);
  } catch (error) {
    return identityErrorResponse(error);
  } finally {
    await persistence?.close();
  }
}
