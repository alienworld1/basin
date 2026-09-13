import { createHash } from "node:crypto";
import { and, desc, eq, gt, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  assertExpectedPaymentTransition,
  DomainError,
  recordId,
  type ExpectedPaymentReasonCode,
} from "@basin/domain";

import type { Database, Transaction } from "../client";
import { expectedPaymentInput } from "../inputs";
import {
  ApprovedPayee,
  ApprovedPayeeGeneration,
  ApprovedSecurityRoot,
  BasinIdentity,
  ExpectedPayment,
  ExpectedPaymentOperation,
  Obligation,
  Organization,
  OrganizationMember,
  Payment,
  Receipt,
  Workspace,
} from "../schema/tables";
import { found, requireMatch, safely } from "../errors";

const operationHash = (value: unknown) =>
  `0x${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;

const statusOrder = sql<number>`case ${ExpectedPayment.status}
  when 'EXPECTED' then 0 when 'READY' then 1 when 'PROCESSING' then 2
  when 'ATTENTION' then 3 when 'SATISFIED' then 4 else 5 end`;

async function lockExpectedPayment(
  tx: Transaction,
  organizationId: bigint,
  expectedPaymentId: bigint,
) {
  return found(
    (
      await tx
        .select()
        .from(ExpectedPayment)
        .where(
          and(
            eq(ExpectedPayment.id, expectedPaymentId),
            eq(ExpectedPayment.organization_id, organizationId),
          ),
        )
        .for("update")
    )[0],
  );
}

export type ExpectedPaymentCreate = {
  organization_id: bigint;
  approved_payee_id: bigint;
  approved_payee_generation_id: bigint;
  amount_base_units: string;
  asset_address: string;
  purpose: string;
  external_reference?: string;
  created_by_member_id: bigint;
  idempotency_key: string;
};

export function expectedPaymentRepository(db: Database) {
  const PayeeWorkspace = alias(Workspace, "expected_payment_payee_workspace");
  const OrganizationWorkspace = alias(
    Workspace,
    "expected_payment_organization_workspace",
  );

  const baseSelection = {
    expectedPayment: ExpectedPayment,
    relationship: ApprovedPayee,
    generation: ApprovedPayeeGeneration,
    identity: BasinIdentity,
    organization: Organization,
    payeeWorkspace: PayeeWorkspace,
    organizationWorkspace: OrganizationWorkspace,
    receiptId: Receipt.id,
  };

  const baseQuery = () =>
    db
      .select(baseSelection)
      .from(ExpectedPayment)
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
        BasinIdentity,
        eq(BasinIdentity.id, ApprovedPayee.basin_identity_id),
      )
      .innerJoin(
        PayeeWorkspace,
        eq(PayeeWorkspace.id, BasinIdentity.workspace_id),
      )
      .innerJoin(
        Organization,
        eq(Organization.id, ExpectedPayment.organization_id),
      )
      .innerJoin(
        OrganizationWorkspace,
        eq(OrganizationWorkspace.id, Organization.workspace_id),
      )
      .leftJoin(Payment, eq(Payment.id, ExpectedPayment.payment_record_id))
      .leftJoin(Receipt, eq(Receipt.payment_id, Payment.id));

  return {
    create(values: ExpectedPaymentCreate) {
      return safely(() =>
        db.transaction(async (tx) => {
          const { idempotency_key, ...paymentValues } = values;
          const parsed = expectedPaymentInput.parse(paymentValues);
          const requestHash = operationHash([
            parsed.organization_id.toString(),
            parsed.approved_payee_id.toString(),
            parsed.approved_payee_generation_id.toString(),
            parsed.amount_base_units,
            parsed.asset_address,
            parsed.purpose,
            parsed.external_reference ?? null,
          ]);
          await tx
            .insert(ExpectedPaymentOperation)
            .values({
              organization_id: parsed.organization_id,
              action: "CREATE",
              idempotency_key,
              request_hash: requestHash,
            })
            .onConflictDoNothing();
          const operation = found(
            (
              await tx
                .select()
                .from(ExpectedPaymentOperation)
                .where(
                  and(
                    eq(
                      ExpectedPaymentOperation.organization_id,
                      parsed.organization_id,
                    ),
                    eq(ExpectedPaymentOperation.action, "CREATE"),
                    eq(
                      ExpectedPaymentOperation.idempotency_key,
                      idempotency_key,
                    ),
                  ),
                )
                .for("update")
            )[0],
          );
          if (operation.request_hash !== requestHash) {
            throw new DomainError(
              "CONFLICT",
              "This request was already used for different payment details.",
            );
          }
          if (operation.expected_payment_id) {
            return {
              payment: await lockExpectedPayment(
                tx,
                parsed.organization_id,
                operation.expected_payment_id,
              ),
              created: false,
            };
          }
          const member = found(
            (
              await tx
                .select()
                .from(OrganizationMember)
                .where(
                  and(
                    eq(OrganizationMember.id, parsed.created_by_member_id),
                    eq(
                      OrganizationMember.organization_id,
                      parsed.organization_id,
                    ),
                    eq(OrganizationMember.role, "ADMIN"),
                    eq(OrganizationMember.status, "ACTIVE"),
                  ),
                )
                .for("update")
            )[0],
          );
          requireMatch(member.id === parsed.created_by_member_id);
          const relationship = found(
            (
              await tx
                .select()
                .from(ApprovedPayee)
                .where(
                  and(
                    eq(ApprovedPayee.id, parsed.approved_payee_id),
                    eq(ApprovedPayee.organization_id, parsed.organization_id),
                    eq(ApprovedPayee.status, "ACTIVE"),
                  ),
                )
                .for("update")
            )[0],
          );
          const generation = found(
            (
              await tx
                .select()
                .from(ApprovedPayeeGeneration)
                .where(
                  and(
                    eq(
                      ApprovedPayeeGeneration.id,
                      parsed.approved_payee_generation_id,
                    ),
                    eq(
                      ApprovedPayeeGeneration.approved_payee_id,
                      relationship.id,
                    ),
                    isNull(ApprovedPayeeGeneration.ended_at),
                  ),
                )
                .for("update")
            )[0],
          );
          requireMatch(generation.expires_at > new Date());
          const payment = found(
            (await tx.insert(ExpectedPayment).values(parsed).returning())[0],
          );
          await tx
            .update(ExpectedPaymentOperation)
            .set({
              expected_payment_id: payment.id,
              completed_at: new Date(),
            })
            .where(eq(ExpectedPaymentOperation.id, operation.id));
          return { payment, created: true };
        }),
      );
    },

    cancel(values: {
      organization_id: bigint;
      expected_payment_id: bigint;
      member_id: bigint;
      idempotency_key: string;
    }) {
      return safely(() =>
        db.transaction(async (tx) => {
          recordId.parse(values.organization_id);
          recordId.parse(values.expected_payment_id);
          recordId.parse(values.member_id);
          const requestHash = operationHash([
            values.organization_id.toString(),
            values.expected_payment_id.toString(),
          ]);
          await tx
            .insert(ExpectedPaymentOperation)
            .values({
              organization_id: values.organization_id,
              action: "CANCEL",
              idempotency_key: values.idempotency_key,
              request_hash: requestHash,
            })
            .onConflictDoNothing();
          const operation = found(
            (
              await tx
                .select()
                .from(ExpectedPaymentOperation)
                .where(
                  and(
                    eq(
                      ExpectedPaymentOperation.organization_id,
                      values.organization_id,
                    ),
                    eq(ExpectedPaymentOperation.action, "CANCEL"),
                    eq(
                      ExpectedPaymentOperation.idempotency_key,
                      values.idempotency_key,
                    ),
                  ),
                )
                .for("update")
            )[0],
          );
          if (operation.request_hash !== requestHash) {
            throw new DomainError(
              "CONFLICT",
              "This cancellation request was already used for another item.",
            );
          }
          if (operation.expected_payment_id) {
            return lockExpectedPayment(
              tx,
              values.organization_id,
              operation.expected_payment_id,
            );
          }
          found(
            (
              await tx
                .select()
                .from(OrganizationMember)
                .where(
                  and(
                    eq(OrganizationMember.id, values.member_id),
                    eq(
                      OrganizationMember.organization_id,
                      values.organization_id,
                    ),
                    eq(OrganizationMember.role, "ADMIN"),
                    eq(OrganizationMember.status, "ACTIVE"),
                  ),
                )
                .for("update")
            )[0],
          );
          const current = await lockExpectedPayment(
            tx,
            values.organization_id,
            values.expected_payment_id,
          );
          if (
            current.status !== "EXPECTED" ||
            current.obligation_record_id ||
            current.payment_record_id
          ) {
            throw new DomainError(
              "CONFLICT",
              "This expected payment has changed. Refresh and review it.",
            );
          }
          assertExpectedPaymentTransition(current.status, "CANCELLED");
          const now = new Date();
          const updated = found(
            (
              await tx
                .update(ExpectedPayment)
                .set({
                  status: "CANCELLED",
                  cancelled_by_member_id: values.member_id,
                  cancelled_at: now,
                  updated_at: now,
                })
                .where(eq(ExpectedPayment.id, current.id))
                .returning()
            )[0],
          );
          await tx
            .update(ExpectedPaymentOperation)
            .set({ expected_payment_id: updated.id, completed_at: now })
            .where(eq(ExpectedPaymentOperation.id, operation.id));
          return updated;
        }),
      );
    },

    refreshRelationship(values: {
      organization_id: bigint;
      expected_payment_id: bigint;
      member_id: bigint;
      idempotency_key: string;
    }) {
      return safely(() =>
        db.transaction(async (tx) => {
          recordId.parse(values.organization_id);
          recordId.parse(values.expected_payment_id);
          recordId.parse(values.member_id);
          const requestHash = operationHash([
            values.organization_id.toString(),
            values.expected_payment_id.toString(),
            "REFRESH_RELATIONSHIP",
          ]);
          await tx
            .insert(ExpectedPaymentOperation)
            .values({
              organization_id: values.organization_id,
              action: "REFRESH_RELATIONSHIP",
              idempotency_key: values.idempotency_key,
              request_hash: requestHash,
            })
            .onConflictDoNothing();
          const operation = found(
            (
              await tx
                .select()
                .from(ExpectedPaymentOperation)
                .where(
                  and(
                    eq(
                      ExpectedPaymentOperation.organization_id,
                      values.organization_id,
                    ),
                    eq(
                      ExpectedPaymentOperation.action,
                      "REFRESH_RELATIONSHIP",
                    ),
                    eq(
                      ExpectedPaymentOperation.idempotency_key,
                      values.idempotency_key,
                    ),
                  ),
                )
                .for("update")
            )[0],
          );
          if (operation.request_hash !== requestHash)
            throw new DomainError(
              "CONFLICT",
              "This request was already used for another payment.",
            );
          if (operation.expected_payment_id)
            return lockExpectedPayment(
              tx,
              values.organization_id,
              operation.expected_payment_id,
            );
          found(
            (
              await tx
                .select()
                .from(OrganizationMember)
                .where(
                  and(
                    eq(OrganizationMember.id, values.member_id),
                    eq(
                      OrganizationMember.organization_id,
                      values.organization_id,
                    ),
                    eq(OrganizationMember.role, "ADMIN"),
                    eq(OrganizationMember.status, "ACTIVE"),
                  ),
                )
                .for("update")
            )[0],
          );
          const current = await lockExpectedPayment(
            tx,
            values.organization_id,
            values.expected_payment_id,
          );
          requireMatch(
            ["EXPECTED", "ATTENTION"].includes(current.status) &&
              !current.obligation_record_id &&
              !current.payment_record_id,
          );
          const relationship = found(
            (
              await tx
                .select()
                .from(ApprovedPayee)
                .where(
                  and(
                    eq(ApprovedPayee.id, current.approved_payee_id),
                    eq(
                      ApprovedPayee.organization_id,
                      values.organization_id,
                    ),
                    eq(ApprovedPayee.status, "ACTIVE"),
                    isNull(ApprovedPayee.revoked_at),
                  ),
                )
                .for("update")
            )[0],
          );
          const generation = found(
            (
              await tx
                .select({ generation: ApprovedPayeeGeneration })
                .from(ApprovedPayeeGeneration)
                .innerJoin(
                  ApprovedSecurityRoot,
                  eq(
                    ApprovedSecurityRoot.approved_payee_generation_id,
                    ApprovedPayeeGeneration.id,
                  ),
                )
                .where(
                  and(
                    eq(
                      ApprovedPayeeGeneration.approved_payee_id,
                      relationship.id,
                    ),
                    isNull(ApprovedPayeeGeneration.ended_at),
                  ),
                )
                .for("update")
            )[0],
          ).generation;
          requireMatch(generation.expires_at > new Date());
          const now = new Date();
          const updated = found(
            (
              await tx
                .update(ExpectedPayment)
                .set({
                  approved_payee_generation_id: generation.id,
                  status: "EXPECTED",
                  status_reason_code: null,
                  updated_at: now,
                })
                .where(eq(ExpectedPayment.id, current.id))
                .returning()
            )[0],
          );
          await tx
            .update(ExpectedPaymentOperation)
            .set({ expected_payment_id: updated.id, completed_at: now })
            .where(eq(ExpectedPaymentOperation.id, operation.id));
          return updated;
        }),
      );
    },

    listForOrganization(organizationId: bigint, cursor?: bigint, limit = 25) {
      return safely(async () => {
        recordId.parse(organizationId);
        const cursorRow = cursor
          ? await db
              .select({ id: ExpectedPayment.id, rank: statusOrder })
              .from(ExpectedPayment)
              .where(
                and(
                  eq(ExpectedPayment.organization_id, organizationId),
                  eq(ExpectedPayment.id, recordId.parse(cursor)),
                ),
              )
              .then((rows) => rows[0])
          : undefined;
        return baseQuery()
          .where(
            and(
              eq(ExpectedPayment.organization_id, organizationId),
              cursorRow
                ? or(
                    sql`${statusOrder} > ${cursorRow.rank}`,
                    and(
                      sql`${statusOrder} = ${cursorRow.rank}`,
                      lt(ExpectedPayment.id, cursorRow.id),
                    ),
                  )
                : undefined,
            ),
          )
          .orderBy(statusOrder, desc(ExpectedPayment.id))
          .limit(Math.min(Math.max(limit, 1), 50));
      });
    },

    listForPersonalWorkspace(workspaceId: bigint, cursor?: bigint, limit = 25) {
      return safely(async () => {
        recordId.parse(workspaceId);
        const cursorRow = cursor
          ? await db
              .select({ id: ExpectedPayment.id, rank: statusOrder })
              .from(ExpectedPayment)
              .innerJoin(
                ApprovedPayee,
                eq(ApprovedPayee.id, ExpectedPayment.approved_payee_id),
              )
              .innerJoin(
                BasinIdentity,
                eq(BasinIdentity.id, ApprovedPayee.basin_identity_id),
              )
              .where(
                and(
                  eq(BasinIdentity.workspace_id, workspaceId),
                  eq(ExpectedPayment.id, recordId.parse(cursor)),
                ),
              )
              .then((rows) => rows[0])
          : undefined;
        return baseQuery()
          .where(
            and(
              eq(BasinIdentity.workspace_id, workspaceId),
              cursorRow
                ? or(
                    sql`${statusOrder} > ${cursorRow.rank}`,
                    and(
                      sql`${statusOrder} = ${cursorRow.rank}`,
                      lt(ExpectedPayment.id, cursorRow.id),
                    ),
                  )
                : undefined,
            ),
          )
          .orderBy(statusOrder, desc(ExpectedPayment.id))
          .limit(Math.min(Math.max(limit, 1), 50));
      });
    },

    detailForOrganization(organizationId: bigint, expectedPaymentId: bigint) {
      return safely(async () =>
        found(
          (
            await baseQuery().where(
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

    detailForPersonalWorkspace(workspaceId: bigint, expectedPaymentId: bigint) {
      return safely(async () =>
        found(
          (
            await baseQuery().where(
              and(
                eq(BasinIdentity.workspace_id, recordId.parse(workspaceId)),
                eq(ExpectedPayment.id, recordId.parse(expectedPaymentId)),
              ),
            )
          )[0],
        ),
      );
    },

    eligibleRelationships(organizationId: bigint) {
      return safely(() =>
        db
          .select({
            relationship: ApprovedPayee,
            generation: ApprovedPayeeGeneration,
            identity: BasinIdentity,
            payeeWorkspace: PayeeWorkspace,
          })
          .from(ApprovedPayee)
          .innerJoin(
            ApprovedPayeeGeneration,
            and(
              eq(ApprovedPayeeGeneration.approved_payee_id, ApprovedPayee.id),
              isNull(ApprovedPayeeGeneration.ended_at),
            ),
          )
          .innerJoin(
            BasinIdentity,
            eq(BasinIdentity.id, ApprovedPayee.basin_identity_id),
          )
          .innerJoin(
            PayeeWorkspace,
            eq(PayeeWorkspace.id, BasinIdentity.workspace_id),
          )
          .where(
            and(
              eq(ApprovedPayee.organization_id, recordId.parse(organizationId)),
              eq(ApprovedPayee.status, "ACTIVE"),
              isNull(ApprovedPayee.revoked_at),
              isNotNull(ApprovedPayee.relationship_name),
              gt(ApprovedPayeeGeneration.expires_at, new Date()),
            ),
          )
          .orderBy(desc(ApprovedPayee.id)),
      );
    },

    linkObligation(values: {
      organization_id: bigint;
      expected_payment_id: bigint;
      obligation_record_id: bigint;
      canonical_metadata_hash: string;
    }) {
      return safely(() =>
        db.transaction(async (tx) => {
          const current = await lockExpectedPayment(
            tx,
            values.organization_id,
            values.expected_payment_id,
          );
          const obligation = found(
            (
              await tx
                .select()
                .from(Obligation)
                .where(
                  eq(
                    Obligation.id,
                    recordId.parse(values.obligation_record_id),
                  ),
                )
                .for("update")
            )[0],
          );
          requireMatch(
            current.status !== "CANCELLED" &&
              (!current.obligation_record_id ||
                current.obligation_record_id === obligation.id) &&
              obligation.status === "ACTIVE" &&
              obligation.valid_until > new Date() &&
              obligation.organization_id === current.organization_id &&
              obligation.approved_payee_id === current.approved_payee_id &&
              obligation.approved_payee_generation_id ===
                current.approved_payee_generation_id &&
              obligation.asset_address === current.asset_address &&
              obligation.max_amount_base_units === current.amount_base_units &&
              obligation.remaining_amount_base_units ===
                current.amount_base_units &&
              obligation.purpose === current.purpose &&
              obligation.external_reference === current.external_reference &&
              obligation.metadata_hash === values.canonical_metadata_hash,
          );
          assertExpectedPaymentTransition(current.status, "READY");
          return found(
            (
              await tx
                .update(ExpectedPayment)
                .set({
                  obligation_record_id: obligation.id,
                  status: "READY",
                  status_reason_code: null,
                  updated_at: new Date(),
                })
                .where(eq(ExpectedPayment.id, current.id))
                .returning()
            )[0],
          );
        }),
      );
    },

    linkPayment(values: {
      organization_id: bigint;
      expected_payment_id: bigint;
      payment_record_id: bigint;
    }) {
      return safely(() =>
        db.transaction(async (tx) => {
          const current = await lockExpectedPayment(
            tx,
            values.organization_id,
            values.expected_payment_id,
          );
          const payment = found(
            (
              await tx
                .select()
                .from(Payment)
                .where(eq(Payment.id, recordId.parse(values.payment_record_id)))
                .for("update")
            )[0],
          );
          requireMatch(
            current.obligation_record_id &&
              (!current.payment_record_id ||
                current.payment_record_id === payment.id) &&
              !["FAILED", "SETTLED"].includes(payment.status) &&
              payment.obligation_record_id === current.obligation_record_id &&
              payment.organization_id === current.organization_id &&
              payment.approved_payee_id === current.approved_payee_id &&
              payment.approved_payee_generation_id ===
                current.approved_payee_generation_id &&
              payment.asset_address === current.asset_address &&
              payment.amount_base_units === current.amount_base_units &&
              payment.purpose === current.purpose &&
              payment.external_reference === current.external_reference,
          );
          if (
            current.status === "PROCESSING" &&
            current.payment_record_id === payment.id
          )
            return current;
          assertExpectedPaymentTransition(current.status, "PROCESSING");
          return found(
            (
              await tx
                .update(ExpectedPayment)
                .set({
                  payment_record_id: payment.id,
                  status: "PROCESSING",
                  status_reason_code: null,
                  updated_at: new Date(),
                })
                .where(eq(ExpectedPayment.id, current.id))
                .returning()
            )[0],
          );
        }),
      );
    },

    projectAttention(values: {
      organization_id: bigint;
      expected_payment_id: bigint;
      reason: ExpectedPaymentReasonCode;
    }) {
      return safely(() =>
        db.transaction(async (tx) => {
          const current = await lockExpectedPayment(
            tx,
            values.organization_id,
            values.expected_payment_id,
          );
          if (
            current.status === "ATTENTION" &&
            current.status_reason_code === values.reason
          ) {
            return current;
          }
          if (current.status !== "ATTENTION")
            assertExpectedPaymentTransition(current.status, "ATTENTION");
          return found(
            (
              await tx
                .update(ExpectedPayment)
                .set({
                  status: "ATTENTION",
                  status_reason_code: values.reason,
                  updated_at: new Date(),
                })
                .where(eq(ExpectedPayment.id, current.id))
                .returning()
            )[0],
          );
        }),
      );
    },

    projectReady(organizationId: bigint, expectedPaymentId: bigint) {
      return safely(() =>
        db.transaction(async (tx) => {
          const current = await lockExpectedPayment(
            tx,
            organizationId,
            expectedPaymentId,
          );
          if (current.status === "READY" && !current.status_reason_code)
            return current;
          requireMatch(
            current.obligation_record_id && !current.payment_record_id,
          );
          assertExpectedPaymentTransition(current.status, "READY");
          return found(
            (
              await tx
                .update(ExpectedPayment)
                .set({
                  status: "READY",
                  status_reason_code: null,
                  updated_at: new Date(),
                })
                .where(eq(ExpectedPayment.id, current.id))
                .returning()
            )[0],
          );
        }),
      );
    },

    satisfy(organizationId: bigint, expectedPaymentId: bigint) {
      return safely(() =>
        db.transaction(async (tx) => {
          const current = await lockExpectedPayment(
            tx,
            organizationId,
            expectedPaymentId,
          );
          requireMatch(Boolean(current.payment_record_id));
          const evidence = found(
            (
              await tx
                .select({ payment: Payment, receipt: Receipt })
                .from(Payment)
                .innerJoin(Receipt, eq(Receipt.payment_id, Payment.id))
                .where(eq(Payment.id, current.payment_record_id!))
                .for("update")
            )[0],
          );
          requireMatch(
            evidence.payment.status === "SETTLED" &&
              evidence.payment.settled_at &&
              evidence.receipt.settled_at.getTime() ===
                evidence.payment.settled_at.getTime() &&
              evidence.receipt.amount_base_units ===
                current.amount_base_units &&
              evidence.receipt.asset_address === current.asset_address,
          );
          if (current.status === "SATISFIED") return current;
          assertExpectedPaymentTransition(current.status, "SATISFIED");
          return found(
            (
              await tx
                .update(ExpectedPayment)
                .set({
                  status: "SATISFIED",
                  status_reason_code: null,
                  satisfied_at: evidence.payment.settled_at,
                  updated_at: new Date(),
                })
                .where(eq(ExpectedPayment.id, current.id))
                .returning()
            )[0],
          );
        }),
      );
    },
  };
}
