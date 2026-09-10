import assert from "node:assert/strict";
import test from "node:test";

import {
  assertExpectedPaymentTransition,
  formatUsdcBaseUnits,
  parseUsdcAmount,
} from "@basin/domain";

import { expectedPaymentHandler } from "../src/server/expected-payments/http";
import { createExpectedPaymentService } from "../src/server/expected-payments/service";
import {
  createExpectedPaymentInput,
  expectedPaymentListInput,
} from "../src/server/expected-payments/input";

const key = "91a58b23-33ae-4426-a57e-2c098fe30e91";

test("expected-payment input accepts only payer-authored economic intent", () => {
  assert.deepEqual(
    createExpectedPaymentInput.parse({
      workspaceId: "2",
      approvedPayeeId: "7",
      amount: "500.123456",
      purpose: " September engineering ",
      reference: "INV-1048",
      idempotencyKey: key,
    }),
    {
      workspaceId: "2",
      approvedPayeeId: "7",
      amount: "500.123456",
      purpose: " September engineering ",
      reference: "INV-1048",
      idempotencyKey: key,
    },
  );
  for (const field of [
    "destination",
    "wallet",
    "asset",
    "status",
    "generationId",
  ]) {
    assert.throws(() =>
      createExpectedPaymentInput.parse({
        workspaceId: "2",
        approvedPayeeId: "7",
        amount: "500",
        purpose: "September engineering",
        idempotencyKey: key,
        [field]: "unsupported",
      }),
    );
  }
});

test("USDC decimal parsing is lossless and rejects unsafe forms", () => {
  assert.equal(parseUsdcAmount("500"), "500000000");
  assert.equal(parseUsdcAmount("0.000001"), "1");
  assert.equal(formatUsdcBaseUnits("500123456"), "500.123456");
  for (const value of [
    "",
    "0",
    "-1",
    "+1",
    "1e3",
    "1,000",
    "1.0000001",
    " 1",
    "1 ",
  ]) {
    assert.throws(() => parseUsdcAmount(value));
  }
  assert.throws(() => parseUsdcAmount("9".repeat(73)));
});

test("list pagination is bounded", () => {
  assert.equal(expectedPaymentListInput.parse({ workspaceId: "1" }).limit, 25);
  assert.equal(
    expectedPaymentListInput.parse({ workspaceId: "1", limit: "50" }).limit,
    50,
  );
  assert.throws(() =>
    expectedPaymentListInput.parse({ workspaceId: "1", limit: "51" }),
  );
});

test("expected-payment lifecycle reserves evidence-backed states", () => {
  assert.doesNotThrow(() =>
    assertExpectedPaymentTransition("EXPECTED", "READY"),
  );
  assert.doesNotThrow(() =>
    assertExpectedPaymentTransition("PROCESSING", "SATISFIED"),
  );
  assert.throws(() => assertExpectedPaymentTransition("EXPECTED", "SATISFIED"));
  assert.throws(() => assertExpectedPaymentTransition("CANCELLED", "READY"));
});

test("every expected-payment handler authenticates before data access", async () => {
  for (const kind of ["list", "detail", "create", "cancel"] as const) {
    const response = await expectedPaymentHandler(
      new Request("https://basin.test/api/expected-payments?workspaceId=1", {
        method: kind === "list" || kind === "detail" ? "GET" : "POST",
      }),
      kind,
      kind === "detail" || kind === "cancel" ? "1" : undefined,
    );
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});

test("operator and personal perspectives reject payer-side mutations before persistence", async () => {
  const workspace = {
    id: 2n,
    type: "ORGANIZATION" as const,
    display_name: "Acme",
    owner_user_id: 1n,
    created_at: new Date(),
    updated_at: new Date(),
  };
  const operator = createExpectedPaymentService(
    {} as never,
    {
      workspace,
      organizationId: 3n,
      memberId: 4n,
      memberRole: "PAYMENT_OPERATOR",
    },
    1n,
  );
  await assert.rejects(
    operator.create({
      approvedPayeeId: 5n,
      amount: "1",
      purpose: "Work",
      idempotencyKey: key,
    }),
  );
  await assert.rejects(operator.cancel(6n, key));
});
