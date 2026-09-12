import assert from "node:assert/strict";
import { test } from "node:test";
import { connectRuntimeDatabase } from "../src/client";

test("runtime connections reuse a small pool after a request closes", async () => {
  const url = "postgresql://basin:local-only@127.0.0.1:5432/basin_runtime";
  const first = connectRuntimeDatabase(url);
  await first.close();
  const second = connectRuntimeDatabase(url);

  assert.equal(first.pool, second.pool);
  assert.equal(second.pool.options.max, 5);
});
