import { sql } from "drizzle-orm";
import { check, text, unique } from "drizzle-orm/pg-core";
import { basin, id, reference, time, webhookProcessingStatus } from "./common";
import { Organization } from "./organization";

export const PrivyWebhookReceipt = basin.table("privy_webhook_receipt", {
  id: id(),
  delivery_id: text().notNull(),
  event_type: text().notNull(),
  resource_id: text(),
  organization_id: reference().references(() => Organization.id, { onDelete: "restrict" }),
  payload_hash: text().notNull(),
  processing_status: webhookProcessingStatus().default("RECEIVED").notNull(),
  received_at: time().defaultNow().notNull(),
  processed_at: time(),
}, (t) => [
  unique().on(t.delivery_id),
  check("privy_webhook_delivery_length", sql`length(${t.delivery_id}) between 1 and 240`),
  check("privy_webhook_payload_hash", sql`${t.payload_hash} ~ '^0x[0-9a-f]{64}$'`),
]);
export type PrivyWebhookReceipt = typeof PrivyWebhookReceipt.$inferSelect;
