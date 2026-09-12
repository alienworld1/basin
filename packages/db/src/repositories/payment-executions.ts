import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { DomainError, recordId } from "@basin/domain";
import type { Database } from "../client";
import { found, safely } from "../errors";
import {
  PaymentExecutionOperation,
  Payment,
  ExpectedPayment,
  ApprovedPayee,
  ApprovedPayeeGeneration,
  ApprovedSecurityRoot,
  BasinIdentity,
  Organization,
  OrganizationTreasury,
  SettlementVersion,
  Workspace,
} from "../schema/tables";

export function paymentExecutionRepository(db: Database) {
  return {
    unresolvedExpectedPaymentIds(organizationId: bigint, limit = 10) {
      return safely(async () =>
        db
          .select({
            expectedPaymentId: PaymentExecutionOperation.expected_payment_id,
          })
          .from(PaymentExecutionOperation)
          .where(
            and(
              eq(
                PaymentExecutionOperation.organization_id,
                recordId.parse(organizationId),
              ),
              inArray(PaymentExecutionOperation.status, [
                "SUBMITTED",
                "UNKNOWN_EXTERNAL_STATE",
              ]),
            ),
          )
          .orderBy(desc(PaymentExecutionOperation.updated_at))
          .limit(limit),
      );
    },
    context(organizationId: bigint, expectedPaymentId: bigint) {
      const organizationWorkspace = alias(
        Workspace,
        "payment_execution_organization_workspace",
      );
      return safely(async () =>
        found(
          (
            await db
              .select({
                expected: ExpectedPayment,
                payment: Payment,
                relationship: ApprovedPayee,
                generation: ApprovedPayeeGeneration,
                root: ApprovedSecurityRoot,
                identity: BasinIdentity,
                organization: Organization,
                treasury: OrganizationTreasury,
                payeeWorkspace: Workspace,
                organizationWorkspace,
                settlement: SettlementVersion,
              })
              .from(ExpectedPayment)
              .leftJoin(
                Payment,
                eq(Payment.id, ExpectedPayment.payment_record_id),
              )
              .innerJoin(
                ApprovedPayee,
                eq(ApprovedPayee.id, ExpectedPayment.approved_payee_id),
              )
              .innerJoin(
                ApprovedPayeeGeneration,
                eq(
                  ApprovedPayeeGeneration.id,
                  ExpectedPayment.approved_payee_generation_id,
                ),
              )
              .innerJoin(
                ApprovedSecurityRoot,
                eq(
                  ApprovedSecurityRoot.approved_payee_generation_id,
                  ApprovedPayeeGeneration.id,
                ),
              )
              .innerJoin(
                BasinIdentity,
                eq(BasinIdentity.id, ApprovedPayee.basin_identity_id),
              )
              .innerJoin(
                Workspace,
                eq(Workspace.id, BasinIdentity.workspace_id),
              )
              .innerJoin(
                Organization,
                eq(Organization.id, ExpectedPayment.organization_id),
              )
              .innerJoin(
                organizationWorkspace,
                eq(organizationWorkspace.id, Organization.workspace_id),
              )
              .leftJoin(
                OrganizationTreasury,
                eq(OrganizationTreasury.organization_id, Organization.id),
              )
              .innerJoin(
                SettlementVersion,
                and(
                  eq(
                    SettlementVersion.approved_security_root_id,
                    ApprovedSecurityRoot.id,
                  ),
                  isNull(SettlementVersion.superseded_at),
                ),
              )
              .where(
                and(
                  eq(
                    ExpectedPayment.organization_id,
                    recordId.parse(organizationId),
                  ),
                  eq(ExpectedPayment.id, recordId.parse(expectedPaymentId)),
                ),
              )
          )[0],
        ),
      );
    },
    settlementByCommitment(values: {
      generation_id: bigint;
      settlement_epoch: string;
      commitment: string;
    }) {
      return safely(
        async () =>
          (
            await db
              .select()
              .from(SettlementVersion)
              .where(
                and(
                  eq(
                    SettlementVersion.approved_payee_generation_id,
                    values.generation_id,
                  ),
                  eq(
                    SettlementVersion.settlement_epoch,
                    values.settlement_epoch,
                  ),
                  eq(SettlementVersion.commitment, values.commitment),
                ),
              )
          )[0] ?? null,
      );
    },
    settlementById(id: bigint) {
      return safely(async () =>
        found(
          (
            await db
              .select()
              .from(SettlementVersion)
              .where(eq(SettlementVersion.id, recordId.parse(id)))
          )[0],
        ),
      );
    },
    prepare(values: {
      organization_id: bigint;
      expected_payment_id: bigint;
      payment_id: bigint;
      actor_member_id: bigint;
      idempotency_key: string;
      request_hash: string;
      review_snapshot: string;
      review_expires_at: Date;
      settlement_version_id: bigint;
    }) {
      return safely(async () =>
        db.transaction(async (tx) => {
          await tx
            .insert(PaymentExecutionOperation)
            .values(values)
            .onConflictDoNothing();
          const op =
            (
              await tx
                .select()
                .from(PaymentExecutionOperation)
                .where(
                  and(
                    eq(
                      PaymentExecutionOperation.organization_id,
                      values.organization_id,
                    ),
                    eq(
                      PaymentExecutionOperation.idempotency_key,
                      values.idempotency_key,
                    ),
                  ),
                )
                .for("update")
            )[0] ??
            found(
              (
                await tx
                  .select()
                  .from(PaymentExecutionOperation)
                  .where(
                    eq(
                      PaymentExecutionOperation.expected_payment_id,
                      values.expected_payment_id,
                    ),
                  )
                  .for("update")
              )[0],
            );
          if (
            op.request_hash !== values.request_hash &&
            [
              "SUBMITTING",
              "SUBMITTED",
              "UNKNOWN_EXTERNAL_STATE",
              "CONFIRMED",
            ].includes(op.status)
          )
            throw new DomainError(
              "CONFLICT",
              "This payment request was already used for different details.",
            );
          if (
            [
              "SUBMITTING",
              "SUBMITTED",
              "UNKNOWN_EXTERNAL_STATE",
              "CONFIRMED",
            ].includes(op.status)
          )
            return op;
          return found(
            (
              await tx
                .update(PaymentExecutionOperation)
                .set({
                  status: "READY",
                  validation_step: "PAYMENT_ACCESS",
                  idempotency_key: values.idempotency_key,
                  review_snapshot: values.review_snapshot,
                  review_expires_at: values.review_expires_at,
                  review_version: op.review_version + 1,
                  settlement_version_id: values.settlement_version_id,
                  request_hash: values.request_hash,
                  failure_code: null,
                  privy_transaction_id: null,
                  transaction_hash: null,
                  submission_block_number: null,
                  submitted_at: null,
                  completed_at: null,
                  updated_at: new Date(),
                })
                .where(eq(PaymentExecutionOperation.id, op.id))
                .returning()
            )[0],
          );
        }),
      );
    },
    read(organizationId: bigint, expectedPaymentId: bigint) {
      return safely(async () =>
        found(
          (
            await db
              .select()
              .from(PaymentExecutionOperation)
              .where(
                and(
                  eq(PaymentExecutionOperation.organization_id, organizationId),
                  eq(
                    PaymentExecutionOperation.expected_payment_id,
                    expectedPaymentId,
                  ),
                ),
              )
          )[0],
        ),
      );
    },
    readMaybe(organizationId: bigint, expectedPaymentId: bigint) {
      return safely(
        async () =>
          (
            await db
              .select()
              .from(PaymentExecutionOperation)
              .where(
                and(
                  eq(PaymentExecutionOperation.organization_id, organizationId),
                  eq(
                    PaymentExecutionOperation.expected_payment_id,
                    expectedPaymentId,
                  ),
                ),
              )
          )[0] ?? null,
      );
    },
    update(
      id: bigint,
      values: Partial<typeof PaymentExecutionOperation.$inferInsert>,
      expectedStatuses?: Array<
        typeof PaymentExecutionOperation.$inferSelect.status
      >,
    ) {
      return safely(async () => {
        const where = expectedStatuses
          ? and(
              eq(PaymentExecutionOperation.id, recordId.parse(id)),
              inArray(PaymentExecutionOperation.status, expectedStatuses),
            )
          : eq(PaymentExecutionOperation.id, recordId.parse(id));
        const next = (
          await db
            .update(PaymentExecutionOperation)
            .set({ ...values, updated_at: new Date() })
            .where(where)
            .returning()
        )[0];
        if (!next)
          throw new DomainError(
            "CONFLICT",
            "This payment changed. Refresh and review it again.",
          );
        return next;
      });
    },
  };
}
