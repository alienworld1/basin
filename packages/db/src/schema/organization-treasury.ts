import { sql } from "drizzle-orm";
import { check, integer, text, unique } from "drizzle-orm/pg-core";
import { basin, id, reference, time, treasuryStatus, uint } from "./common";
import { Organization } from "./organization";

export const OrganizationTreasury = basin.table(
  "organization_treasury",
  {
    id: id(),
    organization_id: reference().references(() => Organization.id, { onDelete: "restrict" }).notNull(),
    status: treasuryStatus().default("NOT_STARTED").notNull(),
    privy_wallet_id: text(),
    wallet_address: text(),
    chain_type: text(),
    owner_quorum_id: text(),
    owner_quorum_threshold: integer(),
    routine_signer_id: text(),
    routine_policy_id: text(),
    routine_policy_owner_id: text(),
    routine_policy_fingerprint: text(),
    router_address: text(),
    router_version: text(),
    routine_per_tx_limit_base_units: uint(),
    last_verified_at: time(),
    last_error_code: text(),
    created_at: time().defaultNow().notNull(),
    updated_at: time().defaultNow().notNull(),
  },
  (t) => [
    unique().on(t.organization_id),
    unique().on(t.privy_wallet_id),
    unique().on(t.wallet_address),
    check("organization_treasury_chain_type", sql`${t.chain_type} is null or ${t.chain_type} = 'ethereum'`),
    check("organization_treasury_owner_threshold", sql`${t.owner_quorum_threshold} is null or ${t.owner_quorum_threshold} > 0`),
    check("organization_treasury_wallet_address", sql`${t.wallet_address} is null or ${t.wallet_address} ~ '^0x[0-9a-f]{40}$'`),
    check("organization_treasury_policy_fingerprint", sql`${t.routine_policy_fingerprint} is null or ${t.routine_policy_fingerprint} ~ '^0x[0-9a-f]{64}$'`),
    check("organization_treasury_limit", sql`${t.routine_per_tx_limit_base_units} is null or ${t.routine_per_tx_limit_base_units} > 0`),
  ],
);
export type OrganizationTreasury = typeof OrganizationTreasury.$inferSelect;
export type NewOrganizationTreasury = typeof OrganizationTreasury.$inferInsert;
