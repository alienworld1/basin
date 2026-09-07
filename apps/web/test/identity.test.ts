import assert from "node:assert/strict";
import test from "node:test";

import {
  availabilityQuery,
  identityClaimRequest,
  identityStatusQuery,
  readStrictIdentityQuery,
} from "../src/server/identities/input";

test("identity claim accepts only a lossless workspace ID and raw label", () => {
  assert.deepEqual(
    identityClaimRequest.parse({ workspaceId: "42", label: " Alice " }),
    { workspaceId: "42", label: " Alice " },
  );
  assert.throws(() =>
    identityClaimRequest.parse({
      workspaceId: "42",
      label: "alice",
      controller: "0x1111111111111111111111111111111111111111",
    }),
  );
  assert.throws(() =>
    identityClaimRequest.parse({ workspaceId: "0", label: "alice" }),
  );
});

test("availability query rejects duplicates and unknown overrides", () => {
  const validUrl = new URL(
    "https://basin.test/api/identities/availability?workspace=7&label=alice",
  );
  assert.deepEqual(
    availabilityQuery.parse(
      readStrictIdentityQuery(validUrl, ["workspace", "label"]),
    ),
    { workspace: "7", label: "alice" },
  );
  assert.throws(() =>
    readStrictIdentityQuery(
      new URL(
        "https://basin.test/api/identities/availability?workspace=7&workspace=8&label=alice",
      ),
      ["workspace", "label"],
    ),
  );
  assert.throws(() =>
    readStrictIdentityQuery(
      new URL(
        "https://basin.test/api/identities/availability?workspace=7&label=alice&chain=1",
      ),
      ["workspace", "label"],
    ),
  );
});

test("status query constrains the recovery transaction shape", () => {
  const transaction = `0x${"a".repeat(64)}`;
  assert.deepEqual(
    identityStatusQuery.parse({
      workspace: "8",
      name: "alice.basin.eth",
      transaction,
    }),
    { workspace: "8", name: "alice.basin.eth", transaction },
  );
  assert.throws(() =>
    identityStatusQuery.parse({
      workspace: "8",
      name: "alice.basin.eth",
      transaction: "0x1234",
    }),
  );
});
