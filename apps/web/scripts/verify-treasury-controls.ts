import { createPersistence } from "@basin/db";
import { recordId } from "@basin/domain";
import { getServerEnvironment } from "../src/server/config/environment";
import { basinRouterManifest } from "../src/server/config/basin-router-manifest";

async function main() {
  const workspaceArgument = process.argv[2];
  if (!workspaceArgument || !/^[1-9]\d*$/.test(workspaceArgument)) {
    throw new Error("Usage: pnpm --filter web verify:treasury <workspace-id>");
  }
  if (!basinRouterManifest) {
    throw new Error(
      "Transaction verification is unavailable until the reviewed Basin Router deployment manifest is configured.",
    );
  }

  const persistence = createPersistence(getServerEnvironment().DATABASE_URL);
  try {
    const context = await persistence.treasury.byWorkspace(
      recordId.parse(BigInt(workspaceArgument)),
    );
    if (context.treasury?.status !== "READY") {
      throw new Error("Treasury controls are not READY after verified Privy read-back.");
    }
    if (
      context.treasury.router_address !== basinRouterManifest.address.toLowerCase() ||
      context.treasury.router_version !== basinRouterManifest.version
    ) {
      throw new Error("Treasury controls do not match the reviewed Router deployment.");
    }
    console.info(
      "Treasury evidence is ready. Run the approved executeObligation transaction and the reviewed disallowed cases against Sepolia.",
    );
  } finally {
    await persistence.close();
  }
}

void main();
