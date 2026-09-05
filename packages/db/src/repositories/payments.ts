import { createHash, randomBytes } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  amount,
  address,
  assertPaymentTransition,
  DomainError,
  executionPaths,
  externalReference,
  paymentStatuses,
  purpose,
  recordId,
} from "@basin/domain";
import { IdempotencyKey, Payment, PaymentEvent } from "../schema/tables";
import type { Database } from "../client";
import type { VerifiedExecution } from "../evidence";
import { requireEvidence } from "../evidence-registry";
import { found, requireMatch, safely } from "../errors";
import { lockedObligation } from "./obligations";
import {
  appendPaymentEvent,
  assertPaymentPreflight,
  lockedPayment,
} from "./payment-context";

const createInput = z.strictObject({
  key: z.string().trim().min(1).max(240),
  obligation_record_id: recordId,
  approved_payee_id: recordId,
  approved_payee_generation_id: recordId,
  amount_base_units: amount,
  asset_address: address,
  purpose,
  external_reference: externalReference.nullish(),
});
const transitionInput = z.strictObject({
  payment_id: recordId,
  expected_status: z.enum(paymentStatuses),
  to_status: z.enum(paymentStatuses).exclude(["DRAFT", "SETTLED", "EXECUTING"]),
  reason: z.string().trim().min(1).max(240).optional(),
});
const executionInput = z.strictObject({
  payment_id: recordId,
  execution_path: z.enum(executionPaths),
});

export function paymentRepository(db: Database) {
  return {
    createOrResume(organizationId: bigint, input: unknown) {
      return safely(async () => {
        recordId.parse(organizationId);
        const { key, ...request } = createInput.parse(input);
        const normalized = {
          ...request,
          external_reference: request.external_reference ?? null,
        };
        const requestHash = `0x${createHash("sha256")
          .update(
            JSON.stringify(normalized, (_, value) =>
              typeof value === "bigint" ? value.toString() : value,
            ),
          )
          .digest("hex")}`;
        return db.transaction(async (tx) => {
          await tx
            .insert(IdempotencyKey)
            .values({
              organization_id: organizationId,
              scope: "CREATE_PAYMENT",
              key,
              request_hash: requestHash,
              status: "IN_PROGRESS",
            })
            .onConflictDoNothing();
          const coordination = found(
            (
              await tx
                .select()
                .from(IdempotencyKey)
                .where(
                  and(
                    eq(IdempotencyKey.organization_id, organizationId),
                    eq(IdempotencyKey.scope, "CREATE_PAYMENT"),
                    eq(IdempotencyKey.key, key),
                  ),
                )
                .for("update")
            )[0],
          );
          if (coordination.request_hash !== requestHash)
            throw new DomainError(
              "CONFLICT",
              "This request was already used for a different payment.",
            );
          if (coordination.payment_id)
            return lockedPayment(tx, organizationId, coordination.payment_id);
          const obligation = await lockedObligation(
            tx,
            organizationId,
            request.obligation_record_id,
          );
          requireMatch(
            request.approved_payee_id === obligation.approved_payee_id &&
              request.approved_payee_generation_id ===
                obligation.approved_payee_generation_id &&
              request.asset_address === obligation.asset_address,
          );
          await assertPaymentPreflight(
            tx,
            obligation,
            request.amount_base_units,
          );
          const payment = found(
            (
              await tx
                .insert(Payment)
                .values({
                  ...normalized,
                  organization_id: organizationId,
                  payment_id: `0x${randomBytes(32).toString("hex")}`,
                  status: "DRAFT",
                })
                .returning()
            )[0],
          );
          await appendPaymentEvent(tx, payment.id, null, "DRAFT");
          await tx
            .update(IdempotencyKey)
            .set({
              status: "COMPLETED",
              payment_id: payment.id,
              updated_at: new Date(),
            })
            .where(eq(IdempotencyKey.id, coordination.id));
          return payment;
        });
      });
    },
    transition(organizationId: bigint, input: unknown) {
      return safely(async () => {
        recordId.parse(organizationId);
        const values = transitionInput.parse(input);
        return db.transaction(async (tx) => {
          const payment = await lockedPayment(
            tx,
            organizationId,
            values.payment_id,
          );
          if (payment.status !== values.expected_status)
            throw new DomainError(
              "CONFLICT",
              "This payment has changed. Refresh and try again.",
            );
          assertPaymentTransition(payment.status, values.to_status);
          requireMatch(values.to_status !== "BLOCKED" || values.reason);
          if (values.to_status === "READY")
            await assertPaymentPreflight(
              tx,
              await lockedObligation(
                tx,
                organizationId,
                payment.obligation_record_id,
              ),
              payment.amount_base_units,
            );
          const result = found(
            (
              await tx
                .update(Payment)
                .set({
                  status: values.to_status,
                  blocked_reason:
                    values.to_status === "BLOCKED" ? values.reason : null,
                  updated_at: new Date(),
                })
                .where(eq(Payment.id, payment.id))
                .returning()
            )[0],
          );
          await appendPaymentEvent(
            tx,
            payment.id,
            payment.status,
            values.to_status,
            values.reason,
          );
          return result;
        });
      });
    },
    beginExecution(organizationId: bigint, evidence: VerifiedExecution) {
      return safely(async () => {
        recordId.parse(organizationId);
        requireEvidence(evidence, "execution");
        const values = executionInput.parse(evidence);
        return db.transaction(async (tx) => {
          const payment = await lockedPayment(
            tx,
            organizationId,
            values.payment_id,
          );
          assertPaymentTransition(payment.status, "EXECUTING");
          await assertPaymentPreflight(
            tx,
            await lockedObligation(
              tx,
              organizationId,
              payment.obligation_record_id,
            ),
            payment.amount_base_units,
          );
          const result = found(
            (
              await tx
                .update(Payment)
                .set({ status: "EXECUTING", updated_at: new Date() })
                .where(eq(Payment.id, payment.id))
                .returning()
            )[0],
          );
          await appendPaymentEvent(
            tx,
            payment.id,
            payment.status,
            "EXECUTING",
            values.execution_path,
          );
          return result;
        });
      });
    },
    read(organizationId: bigint, paymentId: bigint) {
      return safely(async () => {
        recordId.parse(organizationId);
        recordId.parse(paymentId);
        return found(
          (
            await db
              .select()
              .from(Payment)
              .where(
                and(
                  eq(Payment.organization_id, organizationId),
                  eq(Payment.id, paymentId),
                ),
              )
          )[0],
        );
      });
    },
    events(organizationId: bigint, paymentId: bigint) {
      return safely(async () => {
        recordId.parse(organizationId);
        recordId.parse(paymentId);
        return db
          .select({ event: PaymentEvent })
          .from(PaymentEvent)
          .innerJoin(Payment, eq(Payment.id, PaymentEvent.payment_id))
          .where(
            and(
              eq(Payment.organization_id, organizationId),
              eq(Payment.id, paymentId),
            ),
          )
          .orderBy(asc(PaymentEvent.sequence));
      });
    },
  };
}
