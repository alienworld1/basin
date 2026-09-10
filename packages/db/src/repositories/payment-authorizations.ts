import { and, eq } from "drizzle-orm";

import type { Database } from "../client";
import { PaymentAuthorizationOperation } from "../schema/tables";
import { ExpectedPayment, ApprovedPayee, ApprovedPayeeGeneration, ApprovedSecurityRoot, BasinIdentity, Organization, OrganizationTreasury, OrganizationNamespace } from "../schema/tables";
import { found, safely } from "../errors";

export function paymentAuthorizationRepository(db: Database) {
  return {
    prepare(values: {
      organization_id: bigint;
      expected_payment_id: bigint;
      actor_member_id: bigint;
      idempotency_key: string;
      request_hash: string;
      obligation_id: string;
      metadata_hash: string;
      valid_until: Date;
    }) {
      return safely(async () =>
        db.transaction(async (tx) => {
          await tx.insert(PaymentAuthorizationOperation).values(values).onConflictDoNothing();
          const operation = found((await tx.select().from(PaymentAuthorizationOperation).where(and(
            eq(PaymentAuthorizationOperation.organization_id, values.organization_id),
            eq(PaymentAuthorizationOperation.idempotency_key, values.idempotency_key),
          )).for("update"))[0]);
          if (operation.request_hash !== values.request_hash) throw new Error("idempotency context mismatch");
          return operation;
        }),
      );
    },
    read(organizationId: bigint, expectedPaymentId: bigint) {
      return safely(async () => found((await db.select().from(PaymentAuthorizationOperation).where(and(
        eq(PaymentAuthorizationOperation.organization_id, organizationId),
        eq(PaymentAuthorizationOperation.expected_payment_id, expectedPaymentId),
      )))[0]));
    },
    context(organizationId: bigint, expectedPaymentId: bigint) {
      return safely(async () => found((await db.select({
        expected: ExpectedPayment,
        relationship: ApprovedPayee,
        generation: ApprovedPayeeGeneration,
        root: ApprovedSecurityRoot,
        identity: BasinIdentity,
        organization: Organization,
        namespace: OrganizationNamespace,
        treasury: OrganizationTreasury,
      }).from(ExpectedPayment)
        .innerJoin(ApprovedPayee, eq(ApprovedPayee.id, ExpectedPayment.approved_payee_id))
        .innerJoin(ApprovedPayeeGeneration, eq(ApprovedPayeeGeneration.id, ExpectedPayment.approved_payee_generation_id))
        .innerJoin(ApprovedSecurityRoot, eq(ApprovedSecurityRoot.approved_payee_generation_id, ApprovedPayeeGeneration.id))
        .innerJoin(BasinIdentity, eq(BasinIdentity.id, ApprovedPayee.basin_identity_id))
        .innerJoin(Organization, eq(Organization.id, ExpectedPayment.organization_id))
        .innerJoin(OrganizationNamespace, eq(OrganizationNamespace.organization_id, Organization.id))
        .leftJoin(OrganizationTreasury, eq(OrganizationTreasury.organization_id, Organization.id))
        .where(and(eq(ExpectedPayment.organization_id, organizationId), eq(ExpectedPayment.id, expectedPaymentId))))[0]));
    },
    update(id: bigint, values: Partial<typeof PaymentAuthorizationOperation.$inferInsert>) {
      return safely(async () => found((await db.update(PaymentAuthorizationOperation).set({ ...values, updated_at: new Date() }).where(eq(PaymentAuthorizationOperation.id, id)).returning())[0]));
    },
  };
}
