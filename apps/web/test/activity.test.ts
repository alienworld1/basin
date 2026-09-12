import assert from "node:assert/strict";
import test from "node:test";

import {
  activityQuery,
  decodeActivityCursor,
  encodeActivityCursor,
  strictQuery,
} from "../src/server/activity/input";
import {
  activityHandler,
  reconcileActivityHandler,
} from "../src/server/activity/http";
import { receiptHandler } from "../src/server/receipts/http";

test("activity cursors are opaque, versioned, and retain timestamp tie-breakers", () => {
  const occurredAt = new Date("2026-09-12T12:00:00.000Z");
  const cursor = encodeActivityCursor(occurredAt, 42n);
  assert.doesNotMatch(cursor, /^42$/);
  assert.deepEqual(decodeActivityCursor(cursor), { occurredAt, id: 42n });
  assert.throws(() => decodeActivityCursor("not-a-cursor"));
  assert.throws(() =>
    activityQuery.parse({ workspaceId: "1", cursor: "x".repeat(301) }),
  );
});

test("activity queries reject duplicate and unsupported parameters", () => {
  assert.throws(() =>
    strictQuery(
      new URL("https://basin.test/api/activity?workspaceId=1&workspaceId=2"),
      ["workspaceId", "cursor"],
    ),
  );
  assert.throws(() =>
    strictQuery(
      new URL("https://basin.test/api/activity?workspaceId=1&destination=0x1"),
      ["workspaceId", "cursor"],
    ),
  );
});

test("activity and receipt handlers authenticate before accessing tenant data", async () => {
  const activity = await activityHandler(
    new Request("https://basin.test/api/activity?workspaceId=1"),
  );
  const reconciliation = await reconcileActivityHandler(
    new Request("https://basin.test/api/activity/reconcile", {
      method: "POST",
      headers: {
        Origin: "https://basin.test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ workspaceId: "1" }),
    }),
  );
  const receipt = await receiptHandler(
    new Request("https://basin.test/api/receipts/1?workspaceId=1"),
    "1",
    "detail",
  );
  assert.equal(activity.status, 401);
  assert.equal(reconciliation.status, 401);
  assert.equal(receipt.status, 401);
  assert.equal(activity.headers.get("cache-control"), "no-store");
  assert.equal(receipt.headers.get("cache-control"), "no-store");
});
