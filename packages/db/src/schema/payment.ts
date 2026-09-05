import { sql } from "drizzle-orm";
import { text, check, index, unique, foreignKey } from "drizzle-orm/pg-core";
import { basin, id, reference, uint, time, paymentStatus } from "./common";
import { ApprovedPayee } from "./approved-payee";
import { ApprovedPayeeGeneration } from "./approved-payee-generation";
import { Obligation } from "./obligation";
import { Organization } from "./organization";

export const Payment = basin.table(
  "payment",
  {
    id: id(),
    payment_id: text().notNull(),
    organization_id: reference()
      .references(() => Organization.id, { onDelete: "restrict" })
      .notNull(),
    approved_payee_id: reference()
      .references(() => ApprovedPayee.id, { onDelete: "restrict" })
      .notNull(),
    approved_payee_generation_id: reference()
      .references(() => ApprovedPayeeGeneration.id, { onDelete: "restrict" })
      .notNull(),
    obligation_record_id: reference()
      .references(() => Obligation.id, { onDelete: "restrict" })
      .notNull(),
    amount_base_units: uint().notNull(),
    asset_address: text().notNull(),
    purpose: text().notNull(),
    external_reference: text(),
    status: paymentStatus().notNull(),
    blocked_reason: text(),
    created_at: time().defaultNow().notNull(),
    updated_at: time().defaultNow().notNull(),
    settled_at: time(),
  },
  (t) => [
    unique().on(t.payment_id),
    index().on(t.organization_id),
    index().on(t.approved_payee_id),
    index().on(t.approved_payee_generation_id),
    index().on(t.obligation_record_id),
    check(
      "payment_payment_id_shape",
      sql`${t.payment_id} ~ '^0x[0-9a-f]{64}$'`,
    ),
    check("payment_amount_base_units_range", sql`${t.amount_base_units} > 0`),
    check(
      "payment_asset_address_shape",
      sql`${t.asset_address} ~ '^0x[0-9a-f]{40}$'`,
    ),
    check(
      "payment_purpose_length",
      sql`length(${t.purpose}) <= 240 and length(btrim(${t.purpose})) > 0`,
    ),
    check(
      "payment_external_reference_length",
      sql`length(${t.external_reference}) <= 160`,
    ),
    check(
      "payment_blocked_reason_length",
      sql`length(${t.blocked_reason}) between 1 and 240`,
    ),
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
    check(
      "payment_state_fields",
      sql`(${t.status} = 'SETTLED') = (${t.settled_at} is not null) and (${t.status} != 'BLOCKED' or ${t.blocked_reason} is not null)`,
    ),
    index().on(t.organization_id, t.status, t.created_at),
  ],
);
export type Payment = typeof Payment.$inferSelect;
export type NewPayment = typeof Payment.$inferInsert;
