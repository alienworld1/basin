import { createEnsAdapter, normalizeBasinLabel } from "@basin/ens";

import { createAuthenticatedPersistence } from "@/src/server/auth/persistence";
import { getEnsServerEnvironment } from "@/src/server/config/environment";
import { authorizePersonalIdentity } from "@/src/server/identities/authorization";
import { identityErrorResponse } from "@/src/server/identities/http";
import {
  availabilityQuery,
  readStrictIdentityQuery,
} from "@/src/server/identities/input";
import { noStoreJson } from "@/src/server/auth/http";
import { requireVerifiedPrincipal } from "@/src/server/auth/authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  let persistence:
    ReturnType<typeof createAuthenticatedPersistence> | undefined;
  try {
    const principal = await requireVerifiedPrincipal(request);
    const query = availabilityQuery.parse(
      readStrictIdentityQuery(new URL(request.url), ["workspace", "label"]),
    );
    persistence = createAuthenticatedPersistence();
    const { workspace, controller } = await authorizePersonalIdentity(
      request,
      persistence,
      query.workspace,
      principal,
    );
    const identity = normalizeBasinLabel(query.label);
    const existing = await persistence.identities.findByWorkspace(workspace.id);
    if (existing && existing.ens_name !== identity.name) {
      return noStoreJson(
        { error: "This workspace already has a Basin identity." },
        409,
      );
    }
    const availability = await createEnsAdapter(
      getEnsServerEnvironment(),
    ).availability(identity.label, controller as `0x${string}`);
    return noStoreJson({ ...availability, networkName: "Ethereum Sepolia" });
  } catch (error) {
    return identityErrorResponse(error);
  } finally {
    await persistence?.close();
  }
}
