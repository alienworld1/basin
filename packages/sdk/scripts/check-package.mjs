import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "basin-sdk-package-"));

try {
  execFileSync("pnpm", ["pack", "--pack-destination", directory], {
    stdio: "inherit",
  });
  const archive = readdirSync(directory).find((file) => file.endsWith(".tgz"));
  if (!archive) throw new Error("pnpm did not produce an SDK package archive.");

  execFileSync("pnpm", ["exec", "attw", join(directory, archive), "--profile", "esm-only"], {
    stdio: "inherit",
  });
} finally {
  rmSync(directory, { force: true, recursive: true });
}
