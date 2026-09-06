import {
  mapAuthenticatedUser,
  requireVerifiedPrincipal,
} from "@/src/server/auth/authorization";
import { errorResponse, noStoreJson } from "@/src/server/auth/http";
import { createAuthenticatedPersistence } from "@/src/server/auth/persistence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let persistence:
    ReturnType<typeof createAuthenticatedPersistence> | undefined;
  try {
    const principal = await requireVerifiedPrincipal(request);
    if ((await request.text()).trim()) {
      return noStoreJson({ error: "Check the details and try again." }, 400);
    }
    persistence = createAuthenticatedPersistence();
    const user = await mapAuthenticatedUser(persistence, principal);
    const workspaces = await persistence.workspaces.listAccessibleWorkspaces(
      user.id,
    );
    return noStoreJson({
      user: {
        id: user.id.toString(),
        ...(user.display_name ? { displayName: user.display_name } : {}),
      },
      workspaces,
    });
  } catch (error) {
    return errorResponse(error);
  } finally {
    await persistence?.close();
  }
}
