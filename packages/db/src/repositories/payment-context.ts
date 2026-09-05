import { and, desc, eq } from "drizzle-orm";
import { DomainError } from "@basin/domain";
import type { Transaction } from "../client";
import {
  ApprovedPayee,
  ApprovedPayeeGeneration,
  ApprovedSecurityRoot,
  Obligation,
  Payment,
  PaymentEvent,
} from "../schema/tables";
import { found } from "../errors";
import { eventForStatus } from "@basin/domain";
import type { PaymentStatus } from "@basin/domain";

export async function lockedPayment(
  tx: Transaction,
  organizationId: bigint,
  paymentId: bigint,
) {
  return found(
    (
      await tx
        .select()
        .from(Payment)
        .where(
          and(
            eq(Payment.organization_id, organizationId),
            eq(Payment.id, paymentId),
          ),
        )
        .for("update")
    )[0],
  );
}
export async function assertPaymentPreflight(
  tx: Transaction,
  obligation: Obligation,
  amount: string,
) {
  const now = new Date();
  const [context] = await tx
    .select({
      relationship: ApprovedPayee,
      generation: ApprovedPayeeGeneration,
      root: ApprovedSecurityRoot,
    })
    .from(ApprovedPayee)
    .innerJoin(
      ApprovedPayeeGeneration,
      eq(ApprovedPayeeGeneration.approved_payee_id, ApprovedPayee.id),
    )
    .innerJoin(
      ApprovedSecurityRoot,
      eq(
        ApprovedSecurityRoot.approved_payee_generation_id,
        ApprovedPayeeGeneration.id,
      ),
    )
    .where(
      and(
        eq(ApprovedPayee.id, obligation.approved_payee_id),
        eq(ApprovedPayee.organization_id, obligation.organization_id),
        eq(ApprovedPayeeGeneration.id, obligation.approved_payee_generation_id),
      ),
    );
  if (
    !context ||
    context.relationship.status !== "ACTIVE" ||
    context.generation.ended_at ||
    context.generation.expires_at <= now ||
    obligation.status !== "ACTIVE" ||
    obligation.valid_until <= now ||
    !obligation.creation_transaction_hash ||
    BigInt(amount) > BigInt(obligation.remaining_amount_base_units)
  ) {
    throw new DomainError(
      "BLOCKED",
      "This payment is outside the current authorization. Refresh and check the amount still authorized.",
    );
  }
  // This cache is a preflight aid. Only the Router can atomically authorize aggregate spend.
}
export async function appendPaymentEvent(
  tx: Transaction,
  paymentId: bigint,
  from: PaymentStatus | null,
  to: PaymentStatus,
  reason?: string,
  metadata?: { transaction_hash: string; block_number: string },
) {
  // The payment row lock serializes event ordering; only the latest sequence is needed.
  const [last] = await tx
    .select({ sequence: PaymentEvent.sequence })
    .from(PaymentEvent)
    .where(eq(PaymentEvent.payment_id, paymentId))
    .orderBy(desc(PaymentEvent.sequence))
    .limit(1);
  await tx.insert(PaymentEvent).values({
    payment_id: paymentId,
    sequence: (last?.sequence ?? 0) + 1,
    type: eventForStatus[to],
    from_status: from,
    to_status: to,
    reason_code: reason,
    safe_metadata: metadata,
    occurred_at: new Date(),
  });
}
