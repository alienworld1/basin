import { and, desc, eq, lt, or } from "drizzle-orm";

import type { Database } from "../client";
import {
  ApprovedPayee,
  ApprovedPayeeGeneration,
  BasinIdentity,
  ExpectedPayment,
  Organization,
  Payment,
  PaymentAuthoritySnapshot,
  Receipt,
  Workspace,
} from "../schema/tables";
import { safely } from "../errors";

const pageSize = 25;

export function activityRepository(db: Database) {
  return {
    organizationRows(
      organizationId: bigint,
      cursor?: { occurredAt: Date; id: bigint },
    ) {
      return safely(async () =>
        db
          .select({
            payment: Payment,
            receipt: Receipt,
            payee: BasinIdentity,
            relationship: ApprovedPayee,
            expectedPayment: ExpectedPayment,
          })
          .from(Payment)
          .innerJoin(
            ApprovedPayee,
            eq(ApprovedPayee.id, Payment.approved_payee_id),
          )
          .innerJoin(
            BasinIdentity,
            eq(BasinIdentity.id, ApprovedPayee.basin_identity_id),
          )
          .leftJoin(Receipt, eq(Receipt.payment_id, Payment.id))
          .leftJoin(
            ExpectedPayment,
            eq(ExpectedPayment.payment_record_id, Payment.id),
          )
          .where(
            and(
              eq(Payment.organization_id, organizationId),
              cursor
                ? or(
                    lt(Payment.updated_at, cursor.occurredAt),
                    and(
                      eq(Payment.updated_at, cursor.occurredAt),
                      lt(Payment.id, cursor.id),
                    ),
                  )
                : undefined,
            ),
          )
          .orderBy(desc(Payment.updated_at), desc(Payment.id))
          .limit(pageSize + 1),
      );
    },
    recipientRows(
      workspaceId: bigint,
      cursor?: { occurredAt: Date; id: bigint },
    ) {
      return safely(async () =>
        db
          .select({
            payment: Payment,
            receipt: Receipt,
            payer: Workspace,
            payee: BasinIdentity,
            relationship: ApprovedPayee,
          })
          .from(Receipt)
          .innerJoin(Payment, eq(Payment.id, Receipt.payment_id))
          .innerJoin(Organization, eq(Organization.id, Payment.organization_id))
          .innerJoin(Workspace, eq(Workspace.id, Organization.workspace_id))
          .innerJoin(
            ApprovedPayee,
            eq(ApprovedPayee.id, Payment.approved_payee_id),
          )
          .innerJoin(
            BasinIdentity,
            eq(BasinIdentity.id, ApprovedPayee.basin_identity_id),
          )
          .where(
            and(
              eq(BasinIdentity.workspace_id, workspaceId),
              cursor
                ? or(
                    lt(Receipt.settled_at, cursor.occurredAt),
                    and(
                      eq(Receipt.settled_at, cursor.occurredAt),
                      lt(Receipt.id, cursor.id),
                    ),
                  )
                : undefined,
            ),
          )
          .orderBy(desc(Receipt.settled_at), desc(Receipt.id))
          .limit(pageSize + 1),
      );
    },
    receiptForOrganization(organizationId: bigint, receiptId: bigint) {
      return safely(
        async () =>
          (
            await db
              .select({
                receipt: Receipt,
                payment: Payment,
                snapshot: PaymentAuthoritySnapshot,
                generation: ApprovedPayeeGeneration,
                payee: BasinIdentity,
                relationship: ApprovedPayee,
              })
              .from(Receipt)
              .innerJoin(Payment, eq(Payment.id, Receipt.payment_id))
              .innerJoin(
                PaymentAuthoritySnapshot,
                eq(PaymentAuthoritySnapshot.id, Receipt.authority_snapshot_id),
              )
              .innerJoin(
                ApprovedPayeeGeneration,
                eq(
                  ApprovedPayeeGeneration.id,
                  PaymentAuthoritySnapshot.approved_payee_generation_id,
                ),
              )
              .innerJoin(
                ApprovedPayee,
                eq(ApprovedPayee.id, Payment.approved_payee_id),
              )
              .innerJoin(
                BasinIdentity,
                eq(BasinIdentity.id, ApprovedPayee.basin_identity_id),
              )
              .where(
                and(
                  eq(Receipt.id, receiptId),
                  eq(Payment.organization_id, organizationId),
                ),
              )
              .limit(1)
          )[0],
      );
    },
    receiptForRecipient(workspaceId: bigint, receiptId: bigint) {
      return safely(
        async () =>
          (
            await db
              .select({
                receipt: Receipt,
                payment: Payment,
                snapshot: PaymentAuthoritySnapshot,
                generation: ApprovedPayeeGeneration,
                payee: BasinIdentity,
                relationship: ApprovedPayee,
              })
              .from(Receipt)
              .innerJoin(Payment, eq(Payment.id, Receipt.payment_id))
              .innerJoin(
                PaymentAuthoritySnapshot,
                eq(PaymentAuthoritySnapshot.id, Receipt.authority_snapshot_id),
              )
              .innerJoin(
                ApprovedPayeeGeneration,
                eq(
                  ApprovedPayeeGeneration.id,
                  PaymentAuthoritySnapshot.approved_payee_generation_id,
                ),
              )
              .innerJoin(
                ApprovedPayee,
                eq(ApprovedPayee.id, Payment.approved_payee_id),
              )
              .innerJoin(
                BasinIdentity,
                eq(BasinIdentity.id, ApprovedPayee.basin_identity_id),
              )
              .where(
                and(
                  eq(Receipt.id, receiptId),
                  eq(BasinIdentity.workspace_id, workspaceId),
                ),
              )
              .limit(1)
          )[0],
      );
    },
  };
}
