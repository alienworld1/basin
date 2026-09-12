import "server-only";

import { formatUsdcBaseUnits } from "@basin/domain";
import type { createPersistence } from "@basin/db";

import type {
  ActivityListDto,
  ActivityRowDto,
} from "../../shared/activity-types";
import { encodeActivityCursor } from "./input";

type Persistence = ReturnType<typeof createPersistence>;
type Access = Awaited<
  ReturnType<Persistence["workspaces"]["readWorkspaceAccess"]>
>;

function statusFor(
  payment: { status: string; blocked_reason: string | null },
  receiptId?: bigint,
): Pick<ActivityRowDto, "status" | "statusLabel" | "safeReason"> {
  if (payment.status === "SETTLED" && receiptId)
    return { status: "SETTLED", statusLabel: "Settled" };
  if (payment.status === "SETTLED")
    return {
      status: "ATTENTION",
      statusLabel: "Needs attention",
      safeReason: "This payment receipt needs attention.",
    };
  if (payment.status === "BLOCKED")
    return {
      status: "ATTENTION",
      statusLabel: "Needs attention",
      safeReason: "This payment needs attention.",
    };
  if (payment.status === "FAILED")
    return {
      status: "FAILED",
      statusLabel: "Not settled",
      safeReason: "This payment was not settled.",
    };
  return { status: "PROCESSING", statusLabel: "Processing" };
}

export function createActivityService(
  persistence: Persistence,
  access: Access,
) {
  return {
    async list(cursor?: {
      occurredAt: Date;
      id: bigint;
    }): Promise<ActivityListDto> {
      if (access.workspace.type === "ORGANIZATION") {
        if (!access.organizationId)
          throw new Error("Organization access is incomplete.");
        const rows = await persistence.activity.organizationRows(
          access.organizationId,
          cursor,
        );
        const page = rows.slice(0, 25);
        return {
          viewer: "ORGANIZATION",
          canReconcile: ["ADMIN", "PAYMENT_OPERATOR"].includes(
            access.memberRole ?? "",
          ),
          rows: page.map(
            ({ payment, receipt, payee, relationship, expectedPayment }) => ({
              id: payment.id.toString(),
              direction: "OUTGOING",
              counterpartyName: payee.label,
              counterpartyIdentity: payee.ens_name,
              relationshipName: relationship.relationship_name ?? undefined,
              amount: formatUsdcBaseUnits(payment.amount_base_units),
              amountBaseUnits: payment.amount_base_units,
              assetSymbol: "USDC",
              purpose: payment.purpose,
              reference: payment.external_reference ?? undefined,
              ...statusFor(payment, receipt?.id),
              occurredAt: (
                payment.settled_at ?? payment.updated_at
              ).toISOString(),
              receiptId: receipt?.id.toString(),
              expectedPaymentId: expectedPayment?.id.toString(),
            }),
          ),
          nextCursor:
            rows.length > 25 && page.length
              ? encodeActivityCursor(
                  page.at(-1)!.payment.updated_at,
                  page.at(-1)!.payment.id,
                )
              : undefined,
        };
      }
      const rows = await persistence.activity.recipientRows(
        access.workspace.id,
        cursor,
      );
      const page = rows.slice(0, 25);
      return {
        viewer: "RECIPIENT",
        canReconcile: false,
        rows: page.map(({ payment, receipt, payer, payee, relationship }) => ({
          id: payment.id.toString(),
          direction: "INCOMING",
          counterpartyName: payer.display_name,
          counterpartyIdentity: payee.ens_name,
          relationshipName: relationship.relationship_name ?? undefined,
          amount: formatUsdcBaseUnits(receipt.amount_base_units),
          amountBaseUnits: receipt.amount_base_units,
          assetSymbol: "USDC",
          purpose: receipt.purpose,
          reference: receipt.external_reference ?? undefined,
          status: "SETTLED",
          statusLabel: "Received",
          occurredAt: receipt.settled_at.toISOString(),
          receiptId: receipt.id.toString(),
        })),
        nextCursor:
          rows.length > 25 && page.length
            ? encodeActivityCursor(
                page.at(-1)!.receipt.settled_at,
                page.at(-1)!.receipt.id,
              )
            : undefined,
      };
    },
  };
}
