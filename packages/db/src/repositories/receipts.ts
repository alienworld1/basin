import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  assertPaymentTransition,
  chainInteger,
  displayName,
  hash,
  recordId,
} from "@basin/domain";
import {
  ApprovedPayee,
  ApprovedPayeeGeneration,
  ApprovedSecurityRoot,
  BasinIdentity,
  Obligation,
  Organization,
  Payment,
  PaymentAuthoritySnapshot,
  PaymentEvent,
  Receipt,
  SettlementVersion,
  Workspace,
} from "../schema/tables";
import { paymentAuthoritySnapshotInput, receiptInput } from "../inputs";
import type { Database } from "../client";
import type { VerifiedSettlement } from "../evidence";
import { requireEvidence } from "../evidence-registry";
import { found, requireMatch, safely } from "../errors";
import { appendPaymentEvent, lockedPayment } from "./payment-context";
import { lockedObligation } from "./obligations";
import { validateSettlementSnapshot } from "./settlement-validation";

const settlementInput = z.strictObject({
  payment_id: recordId,
  snapshot: paymentAuthoritySnapshotInput,
  transaction_hash: hash,
  block_number: chainInteger,
  settled_at: z.date(),
  chain_id: z.literal(11155111),
  payer_organization_name: displayName,
  payee_display_name: displayName,
  asset_symbol: z.literal("USDC"),
});
export function receiptRepository(db: Database) {
  return {
    finalizeFromRouter(organizationId: bigint, evidence: VerifiedSettlement) {
      return safely(async () => {
        recordId.parse(organizationId);
        requireEvidence(evidence, "settlement");
        const values = settlementInput.parse(evidence);
        return db.transaction(async (tx) => {
          const payment = await lockedPayment(
            tx,
            organizationId,
            values.payment_id,
          );
          if (payment.status === "SETTLED") {
            const existing = found(
              (
                await tx
                  .select()
                  .from(Receipt)
                  .where(eq(Receipt.payment_id, payment.id))
              )[0],
            );
            requireMatch(existing.transaction_hash === values.transaction_hash);
            return existing;
          }
          assertPaymentTransition(payment.status, "SETTLED");
          const obligation = await lockedObligation(
            tx,
            organizationId,
            payment.obligation_record_id,
          );
          const snapshot = values.snapshot;
          const generation = found(
            (
              await tx
                .select()
                .from(ApprovedPayeeGeneration)
                .where(
                  eq(
                    ApprovedPayeeGeneration.id,
                    snapshot.approved_payee_generation_id,
                  ),
                )
            )[0],
          );
          const root = found(
            (
              await tx
                .select()
                .from(ApprovedSecurityRoot)
                .where(
                  eq(
                    ApprovedSecurityRoot.id,
                    snapshot.approved_security_root_id,
                  ),
                )
            )[0],
          );
          const settlement = found(
            (
              await tx
                .select()
                .from(SettlementVersion)
                .where(eq(SettlementVersion.id, snapshot.settlement_version_id))
            )[0],
          );
          const relationship = found(
            (
              await tx
                .select()
                .from(ApprovedPayee)
                .where(
                  and(
                    eq(ApprovedPayee.id, payment.approved_payee_id),
                    eq(ApprovedPayee.organization_id, organizationId),
                  ),
                )
            )[0],
          );
          const identity = found(
            (
              await tx
                .select()
                .from(BasinIdentity)
                .where(eq(BasinIdentity.id, relationship.basin_identity_id))
            )[0],
          );
          const execution = found(
            (
              await tx
                .select()
                .from(PaymentEvent)
                .where(
                  and(
                    eq(PaymentEvent.payment_id, payment.id),
                    eq(PaymentEvent.to_status, "EXECUTING"),
                  ),
                )
                .orderBy(desc(PaymentEvent.sequence))
                .limit(1)
            )[0],
          );
          requireMatch(execution.reason_code === snapshot.execution_path);
          requireMatch(
            settlement.chain_id === values.chain_id &&
              root.acceptance_chain_id === values.chain_id,
          );
          validateSettlementSnapshot(
            snapshot,
            payment,
            obligation,
            generation,
            root,
            settlement,
            identity,
            values.settled_at,
          );
          const authority = found(
            (
              await tx
                .insert(PaymentAuthoritySnapshot)
                .values(snapshot)
                .returning()
            )[0],
          );
          const receipt = found(
            (
              await tx
                .insert(Receipt)
                .values(
                  receiptInput.parse({
                    payment_id: payment.id,
                    authority_snapshot_id: authority.id,
                    payer_organization_name: values.payer_organization_name,
                    payee_display_name: values.payee_display_name,
                    amount_base_units: payment.amount_base_units,
                    asset_address: payment.asset_address,
                    asset_symbol: values.asset_symbol,
                    purpose: payment.purpose,
                    external_reference: payment.external_reference,
                    obligation_protocol_id: snapshot.obligation_protocol_id,
                    obligation_metadata_hash: snapshot.obligation_metadata_hash,
                    security_root_commitment: snapshot.security_root_commitment,
                    transaction_hash: values.transaction_hash,
                    chain_id: values.chain_id,
                    router_address: snapshot.router_address,
                    router_version: snapshot.router_version,
                    settled_at: values.settled_at,
                  }),
                )
                .returning()
            )[0],
          );
          await tx
            .update(Payment)
            .set({
              status: "SETTLED",
              settled_at: values.settled_at,
              updated_at: new Date(),
            })
            .where(eq(Payment.id, payment.id));
          await appendPaymentEvent(
            tx,
            payment.id,
            payment.status,
            "SETTLED",
            undefined,
            {
              transaction_hash: values.transaction_hash,
              block_number: values.block_number,
            },
          );
          // Confirmed Router results may arrive out of order. Never resurrect cached capacity
          // or a terminal obligation; each receipt still keeps its exact before/after evidence.
          if (
            BigInt(snapshot.obligation_remaining_after_base_units) <
            BigInt(obligation.remaining_amount_base_units)
          ) {
            const terminal = ["CANCELLED", "EXPIRED", "CONSUMED"].includes(
              obligation.status,
            );
            await tx
              .update(Obligation)
              .set({
                remaining_amount_base_units:
                  snapshot.obligation_remaining_after_base_units,
                status: terminal
                  ? obligation.status
                  : snapshot.obligation_remaining_after_base_units === "0"
                    ? "CONSUMED"
                    : "ACTIVE",
                updated_at: new Date(),
              })
              .where(eq(Obligation.id, obligation.id));
          }
          return receipt;
        });
      });
    },
    read(organizationId: bigint, paymentId: bigint) {
      return safely(async () => {
        recordId.parse(organizationId);
        recordId.parse(paymentId);
        // One query; private descriptors and recipient signatures are excluded from this summary.
        const rows = await db
          .select({
            receipt: Receipt,
            snapshot: PaymentAuthoritySnapshot,
            payer: {
              id: Organization.id,
              workspace_name: Workspace.display_name,
            },
            payee: { id: BasinIdentity.id, ens_name: BasinIdentity.ens_name },
            generation: ApprovedPayeeGeneration,
            activation: {
              id: ApprovedSecurityRoot.id,
              commitment: ApprovedSecurityRoot.security_root_commitment,
              transaction_hash:
                ApprovedSecurityRoot.activation_transaction_hash,
              block_number: ApprovedSecurityRoot.activation_block_number,
              log_index: ApprovedSecurityRoot.activation_log_index,
            },
            settlement: {
              id: SettlementVersion.id,
              epoch: SettlementVersion.settlement_epoch,
              commitment: SettlementVersion.commitment,
            },
            obligation: Obligation,
            payment: Payment,
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
            ApprovedSecurityRoot,
            eq(
              ApprovedSecurityRoot.id,
              PaymentAuthoritySnapshot.approved_security_root_id,
            ),
          )
          .innerJoin(
            SettlementVersion,
            eq(
              SettlementVersion.id,
              PaymentAuthoritySnapshot.settlement_version_id,
            ),
          )
          .innerJoin(
            Obligation,
            eq(Obligation.id, Payment.obligation_record_id),
          )
          .innerJoin(
            ApprovedPayee,
            eq(ApprovedPayee.id, Payment.approved_payee_id),
          )
          .innerJoin(
            BasinIdentity,
            eq(BasinIdentity.id, ApprovedPayee.basin_identity_id),
          )
          .innerJoin(Organization, eq(Organization.id, Payment.organization_id))
          .innerJoin(Workspace, eq(Workspace.id, Organization.workspace_id))
          .where(
            and(
              eq(Payment.organization_id, organizationId),
              eq(Payment.id, paymentId),
            ),
          );
        return found(rows[0]);
      });
    },
  };
}
