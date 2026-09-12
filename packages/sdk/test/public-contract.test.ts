import assert from "node:assert/strict";
import test from "node:test";
import { BasinSdkError, createBasinClient } from "../src/index.js";

const publicClient = {
  getChainId: async () => 11155111,
  getBlock: async () => ({
    number: 1n,
    hash: "0x0000000000000000000000000000000000000000000000000000000000000000",
    timestamp: 1n,
  }),
} as never;

test("normalizes Basin identity input without an RPC read", () => {
  const client = createBasinClient({ publicClient });
  assert.equal(
    client.identity.normalize("Ledger.basin.eth"),
    "ledger.basin.eth",
  );
});

test("rejects an unsupported deployment eagerly", () => {
  assert.throws(
    () =>
      createBasinClient({
        publicClient,
        deployment: { protocolVersion: "1", chainId: 1n } as never,
      }),
    (error: unknown) =>
      error instanceof BasinSdkError && error.code === "UNSUPPORTED_NETWORK",
  );
});
