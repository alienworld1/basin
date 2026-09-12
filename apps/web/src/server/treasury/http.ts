import "server-only";
import { createHash } from "node:crypto";
import { PrivyClient } from "@privy-io/node";
import { DomainError } from "@basin/domain";
import { ZodError } from "zod";
import {
  mapAuthenticatedUser,
  requireOrganizationRole,
  requireVerifiedPrincipal,
} from "../auth/authorization";
import { errorResponse, noStoreJson, requireSameOrigin } from "../auth/http";
import { createAuthenticatedPersistence } from "../auth/persistence";
import { treasuryMutationInput } from "./input";
import { createTreasuryService } from "./service";
import { createPrivyTreasuryAdapter } from "./adapter";

export async function treasuryHandler(
  request: Request,
  kind: "status" | "setup" | "reconcile",
) {
  let persistence: ReturnType<typeof createAuthenticatedPersistence> | undefined;
  try {
    const principal = await requireVerifiedPrincipal(request);
    if (kind !== "status") requireSameOrigin(request);
    const raw =
      kind === "status"
        ? {
            workspaceId: new URL(request.url).searchParams.get("workspace") ?? "",
            idempotencyKey: "status-read-only-000000000000",
          }
        : await request.json();
    const input = treasuryMutationInput.parse(raw);
    persistence = createAuthenticatedPersistence();
    const user = await mapAuthenticatedUser(persistence, principal);
    const access = await requireOrganizationRole(
      persistence,
      user,
      input.workspaceId,
      kind === "status" ? ["ADMIN", "PAYMENT_OPERATOR"] : ["ADMIN"],
    );
    const service = createTreasuryService(persistence, access, principal.privyUserId);
    if (kind === "setup") return noStoreJson(await service.setup({
      idempotencyKey: input.idempotencyKey,
      authorizationSignature: input.walletAuthorizationSignature,
      requestExpiry: input.walletAuthorizationExpiry,
    }));
    if (kind === "reconcile") return noStoreJson(await service.reconcile());
    const current = await service.state();
    return noStoreJson(
      current.summary.status === "NOT_STARTED" ? current : await service.reconcile(),
    );
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) {
      return noStoreJson({ error: "Check the treasury controls and try again." }, 400);
    }
    if (error instanceof DomainError) return errorResponse(error);
    return errorResponse(error);
  } finally {
    await persistence?.close();
  }
}

export async function privyWebhookHandler(request: Request) {
  let persistence: ReturnType<typeof createAuthenticatedPersistence> | undefined;
  try {
    const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    const appSecret = process.env.PRIVY_APP_SECRET;
    const signingSecret = process.env.PRIVY_WEBHOOK_SIGNING_SECRET;
    if (!appId || !appSecret || !signingSecret)
      return noStoreJson({ error: "Webhook verification is unavailable." }, 503);
    const raw = await request.text();
    const deliveryId = request.headers.get("svix-id") ?? "";
    const client = new PrivyClient({ appId, appSecret, webhookSigningSecret: signingSecret });
    const verified = client.webhooks().verify({
      payload: raw,
      headers: {
        "svix-id": deliveryId,
        "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
        "svix-signature": request.headers.get("svix-signature") ?? "",
      },
    }) as unknown as Record<string, unknown>;
    const eventType = typeof verified.type === "string" ? verified.type : "unsupported";
    const data = verified.data && typeof verified.data === "object"
      ? (verified.data as Record<string, unknown>)
      : {};
    const resourceId = typeof data.id === "string"
      ? data.id
      : typeof data.intent_id === "string"
        ? data.intent_id
        : undefined;
    persistence = createAuthenticatedPersistence();
    const stored = await persistence.treasury.receiveWebhook({
      delivery_id: deliveryId,
      event_type: eventType.slice(0, 240),
      resource_id: resourceId?.slice(0, 240),
      payload_hash: `0x${createHash("sha256").update(raw).digest("hex")}`,
    });
    if (
      !stored.duplicate ||
      ["RECEIVED", "FAILED_RETRYABLE"].includes(stored.receipt.processing_status)
    ) {
      try {
        if (eventType.startsWith("intent.") && resourceId) {
          const operation = await persistence.treasury.operationByIntent(resourceId);
          if (operation) {
            const current = await createPrivyTreasuryAdapter().getIntent(resourceId);
            if (current.status === "pending") {
              await persistence.treasury.updateOperation(operation.id, {
                status: "AWAITING_APPROVAL",
                expires_at: current.expiresAt,
              });
            } else if (current.status === "executed") {
              // The event prompts a fresh resource read; it is never treated as readiness proof.
              await persistence.treasury.updateOperation(operation.id, {
                status: "IN_PROGRESS",
                privy_intent_id: null,
              });
              await persistence.treasury.saveTreasury({
                organization_id: operation.organization_id,
                status: "NEEDS_ATTENTION",
                last_error_code: "RECONCILIATION_REQUIRED",
              });
            } else {
              await persistence.treasury.updateOperation(operation.id, {
                status: "FAILED_FINAL",
                safe_error_code:
                  current.status === "expired" ? "INTENT_EXPIRED" : "INTENT_REJECTED",
              });
              await persistence.treasury.saveTreasury({
                organization_id: operation.organization_id,
                status: "FAILED",
                last_error_code:
                  current.status === "expired" ? "INTENT_EXPIRED" : "INTENT_REJECTED",
              });
            }
          }
        }
        await persistence.treasury.updateWebhook(stored.receipt.id, {
          processing_status:
            eventType.startsWith("intent.") ? "PROCESSED" : "IGNORED",
          processed_at: new Date(),
        });
      } catch {
        await persistence.treasury.updateWebhook(stored.receipt.id, {
          processing_status: "FAILED_RETRYABLE",
        });
        return noStoreJson({ error: "Webhook processing is unavailable." }, 503);
      }
    }
    return noStoreJson({ received: true });
  } catch {
    return noStoreJson({ error: "Webhook verification failed." }, 400);
  } finally {
    await persistence?.close();
  }
}
