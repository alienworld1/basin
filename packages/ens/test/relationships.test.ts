import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveRelationshipName,
  normalizeBasinIdentityInput,
} from "../src/relationships";

test("identity lookup accepts exact Basin locators and derives fixed relationship names", () => {
  for (const input of ["alice", "alice.basin.eth", "basin://alice"]) {
    assert.equal(normalizeBasinIdentityInput(input).name, "alice.basin.eth");
  }
  assert.equal(
    deriveRelationshipName("alice.basin.eth", "Acme"),
    "alice.acme.basin.eth",
  );
});

test("identity lookup rejects addresses, nested names, URLs and reserved labels", () => {
  for (const input of [
    "0x1111111111111111111111111111111111111111",
    "alice.acme.basin.eth",
    "alice.eth",
    "basin://alice/path",
    "https://alice.basin.eth",
    "admin",
  ]) {
    assert.throws(
      () => normalizeBasinIdentityInput(input),
      /Enter a Basin identity, such as name\.basin\.eth\./,
    );
  }
});
