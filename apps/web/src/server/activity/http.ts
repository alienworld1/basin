import "server-only";

import { errorResponse, noStoreJson } from "../auth/http";
import { createAuthenticatedPersistence } from "../auth/persistence";
import {
  mapAuthenticatedUser,
  requireVerifiedPrincipal,
  requireWorkspaceAccess,
} from "../auth/authorization";
import { requireSameOrigin } from "../auth/http";
import { createPaymentService } from "../payments/service";
import { activityQuery, decodeActivityCursor, strictQuery } from "./input";
import { createActivityService } from "./service";

export async function activityHandler(request: Request) {
  let persistence:
    ReturnType<typeof createAuthenticatedPersistence> | undefined;
  try {
    const principal = await requireVerifiedPrincipal(request);
    const input = activityQuery.parse(
      strictQuery(new URL(request.url), ["workspaceId", "cursor"]),
    );
    persistence = createAuthenticatedPersistence();
    const user = await mapAuthenticatedUser(persistence, principal);
    const access = await requireWorkspaceAccess(
      persistence,
      user,
      input.workspaceId,
    );
    return noStoreJson(
      await createActivityService(persistence, access).list(
        decodeActivityCursor(input.cursor),
      ),
    );
  } catch (error) {
    return errorResponse(error);
  } finally {
    await persistence?.close();
  }
}

export async function reconcileActivityHandler(request: Request) {
  let persistence:
    ReturnType<typeof createAuthenticatedPersistence> | undefined;
  try {
    const principal = await requireVerifiedPrincipal(request);
    requireSameOrigin(request);
    const body = await request.json();
    const input = activityQuery.pick({ workspaceId: true }).parse(body);
    persistence = createAuthenticatedPersistence();
    const user = await mapAuthenticatedUser(persistence, principal);
    const access = await requireWorkspaceAccess(
      persistence,
      user,
      input.workspaceId,
    );
    if (
      access.workspace.type !== "ORGANIZATION" ||
      !access.organizationId ||
      !["ADMIN", "PAYMENT_OPERATOR"].includes(access.memberRole ?? "")
    ) {
      return noStoreJson(
        { error: "You don't have permission to do that." },
        403,
      );
    }
    const unresolved =
      await persistence.paymentExecutions.unresolvedExpectedPaymentIds(
        access.organizationId,
      );
    const payments = createPaymentService(persistence, access);
    await Promise.allSettled(
      unresolved.map(({ expectedPaymentId }) =>
        payments.reconcile(expectedPaymentId),
      ),
    );
    return noStoreJson(
      await createActivityService(persistence, access).list(),
      202,
    );
  } catch (error) {
    return errorResponse(error);
  } finally {
    await persistence?.close();
  }
}
