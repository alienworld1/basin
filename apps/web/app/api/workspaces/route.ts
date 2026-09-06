import {
  mapAuthenticatedUser,
  requireVerifiedPrincipal,
} from "@/src/server/auth/authorization";
import {
  errorResponse,
  noStoreJson,
  requireSameOrigin,
} from "@/src/server/auth/http";
import { createAuthenticatedPersistence } from "@/src/server/auth/persistence";
import { workspaceRequest } from "@/src/server/auth/workspace-input";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let persistence:
    ReturnType<typeof createAuthenticatedPersistence> | undefined;
  try {
    const principal = await requireVerifiedPrincipal(request);
    requireSameOrigin(request);
    if (!request.headers.get("content-type")?.startsWith("application/json")) {
      return noStoreJson({ error: "Check the details and try again." }, 400);
    }
    const input = workspaceRequest.parse(await request.json());
    persistence = createAuthenticatedPersistence();
    const user = await mapAuthenticatedUser(persistence, principal);
    const workspace =
      input.type === "PERSONAL"
        ? await persistence.workspaces.createPersonalWorkspace(
            user.id,
            input.displayName,
          )
        : await persistence.workspaces.createOrganizationWorkspace(
            user.id,
            input.displayName,
          );
    return noStoreJson(
      {
        id: workspace.id.toString(),
        name: workspace.display_name,
        type: workspace.type === "PERSONAL" ? "personal" : "organization",
        role: workspace.type === "PERSONAL" ? "OWNER" : "ADMIN",
      },
      201,
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      return noStoreJson({ error: "Check the details and try again." }, 400);
    }
    return errorResponse(error);
  } finally {
    await persistence?.close();
  }
}
