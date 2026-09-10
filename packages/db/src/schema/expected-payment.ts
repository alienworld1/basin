import { sql } from "drizzle-orm";
import { check, foreignKey, index, text, unique } from "drizzle-orm/pg-core";
import {
  basin,
  expectedPaymentReasonCode,
  expectedPaymentStatus,
  id,
  reference,
  time,
  uint,
} from "./common";
import { ApprovedPayee } from "./approved-payee";
import { ApprovedPayeeGeneration } from "./approved-payee-generation";
import { Obligation } from "./obligation";
import { Organization } from "./organization";
import { OrganizationMember } from "./organization-member";
import { Payment } from "./payment";

export const ExpectedPayment = basin.table(
  "expected_payment",
  {
    id: id(),
    organization_id: reference()
      .references(() => Organization.id, { onDelete: "restrict" })
      .notNull(),
    approved_payee_id: reference()
      .references(() => ApprovedPayee.id, { onDelete: "restrict" })
      .notNull(),
    approved_payee_generation_id: reference()
      .references(() => ApprovedPayeeGeneration.id, { onDelete: "restrict" })
      .notNull(),
    amount_base_units: uint().notNull(),
    asset_address: text().notNull(),
    purpose: text().notNull(),
    external_reference: text(),
    status: expectedPaymentStatus().default("EXPECTED").notNull(),
    status_reason_code: expectedPaymentReasonCode(),
    obligation_record_id: reference().references(() => Obligation.id, {
      onDelete: "restrict",
    }),
    payment_record_id: reference().references(() => Payment.id, {
      onDelete: "restrict",
    }),
    created_by_member_id: reference()
      .references(() => OrganizationMember.id, { onDelete: "restrict" })
      .notNull(),
    cancelled_by_member_id: reference().references(
      () => OrganizationMember.id,
      { onDelete: "restrict" },
    ),
    cancelled_at: time(),
    satisfied_at: time(),
    created_at: time().defaultNow().notNull(),
    updated_at: time().defaultNow().notNull(),
  },
  (t) => [
    unique().on(
      t.id,
      t.organization_id,
      t.approved_payee_id,
      t.approved_payee_generation_id,
    ),
    unique().on(t.obligation_record_id),
    unique().on(t.payment_record_id),
    index().on(t.organization_id, t.status, t.created_at, t.id),
    index().on(t.approved_payee_id, t.created_at, t.id),
    index().on(t.created_by_member_id),
    index().on(t.cancelled_by_member_id),
    foreignKey({
      columns: [t.approved_payee_id, t.organization_id],
      foreignColumns: [ApprovedPayee.id, ApprovedPayee.organization_id],
    }).onDelete("restrict"),
    foreignKey({
      columns: [t.approved_payee_generation_id, t.approved_payee_id],
      foreignColumns: [
        ApprovedPayeeGeneration.id,
        ApprovedPayeeGeneration.approved_payee_id,
      ],
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        t.obligation_record_id,
        t.organization_id,
        t.approved_payee_id,
        t.approved_payee_generation_id,
      ],
      foreignColumns: [
        Obligation.id,
        Obligation.organization_id,
        Obligation.approved_payee_id,
        Obligation.approved_payee_generation_id,
      ],
    }).onDelete("restrict"),
    check("expected_payment_amount_positive", sql`${t.amount_base_units} > 0`),
    check(
      "expected_payment_asset_address_shape",
      sql`${t.asset_address} ~ '^0x[0-9a-f]{40}$'`,
    ),
    check(
      "expected_payment_purpose_length",
      sql`length(${t.purpose}) <= 240 and length(btrim(${t.purpose})) > 0`,
    ),
    check(
      "expected_payment_reference_length",
      sql`${t.external_reference} is null or (length(${t.external_reference}) between 1 and 160 and length(btrim(${t.external_reference})) > 0)`,
    ),
    check(
      "expected_payment_attention_reason",
      sql`(${t.status} = 'ATTENTION') = (${t.status_reason_code} is not null)`,
    ),
    check(
      "expected_payment_cancellation",
      sql`(${t.status} = 'CANCELLED') = (${t.cancelled_at} is not null and ${t.cancelled_by_member_id} is not null) and (${t.status} != 'CANCELLED' or (${t.obligation_record_id} is null and ${t.payment_record_id} is null))`,
    ),
    check(
      "expected_payment_satisfaction",
      sql`(${t.status} = 'SATISFIED') = (${t.satisfied_at} is not null)`,
    ),
    check(
      "expected_payment_lifecycle_links",
      sql`(${t.status} != 'READY' or ${t.obligation_record_id} is not null) and (${t.status} != 'PROCESSING' or ${t.payment_record_id} is not null) and (${t.status} != 'SATISFIED' or ${t.payment_record_id} is not null)`,
    ),
  ],
);

export type ExpectedPayment = typeof ExpectedPayment.$inferSelect;
export type NewExpectedPayment = typeof ExpectedPayment.$inferInsert;
