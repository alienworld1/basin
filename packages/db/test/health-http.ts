import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import { isolatedDatabase } from "./database";

const web = resolve("../../apps/web");
const port = 3319;
async function withServer(url: string, verify: () => Promise<void>) {
  const server = spawn(
    process.execPath,
    [
      resolve(web, "node_modules/next/dist/bin/next"),
      "start",
      "--port",
      String(port),
    ],
    {
      cwd: web,
      env: { ...process.env, DATABASE_URL: url },
      stdio: "ignore",
    },
  );
  try {
    let ready = false;
    for (let attempt = 0; attempt < 75; attempt++) {
      if (server.exitCode != null)
        throw new Error(
          "The verification server exited before becoming ready.",
        );
      try {
        await fetch(`http://127.0.0.1:${port}/api/health`);
        ready = true;
        break;
      } catch {
        await new Promise((done) => setTimeout(done, 200));
      }
    }
    assert.ok(ready, "Verification server must start within 15 seconds.");
    await verify();
  } finally {
    if (server.exitCode == null) {
      server.kill("SIGTERM");
      await once(server, "exit");
    }
  }
}
async function expectHealth(database: string, status: number) {
  const response = await fetch(`http://127.0.0.1:${port}/api/health`);
  const text = await response.text();
  const body = JSON.parse(text);
  assert.equal(response.status, status);
  assert.equal(body.checks.database, database);
  assert.equal(body.status, status === 200 ? "ok" : "degraded");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.doesNotMatch(
    text,
    /postgresql:|postgres:|127\.0\.0\.1|basin_test_|SELECT|drizzle|password|connectionString/,
  );
}
const database = await isolatedDatabase();
try {
  await withServer(database.url, async () => {
    await expectHealth("migration_required", 503);
    await database.migrate();
    await expectHealth("ok", 200);
    for (const path of ["/", "/app"]) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`);
      assert.equal(response.status, 200);
      assert.doesNotMatch(
        await response.text(),
        /basin_test_|fixture:|destination_ciphertext|DATABASE_URL/,
      );
    }
  });
  await withServer("postgresql://unused@127.0.0.1:1/unavailable", async () =>
    expectHealth("unavailable", 503),
  );
  await withServer(database.url, async () => expectHealth("ok", 200));
  process.stdout.write(
    "HTTP health: migration required, live migration recovery, outage, restart recovery, and product routes passed.\n",
  );
} finally {
  await database.dispose();
}
