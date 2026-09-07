import { createEnsAdapter, ENSV2_SEPOLIA_DEPLOYMENT } from "../src/index";
import { readLiveEnvironment } from "./environment";

await createEnsAdapter(readLiveEnvironment()).assertInfrastructure();
process.stdout.write(
  `${JSON.stringify({
    status: "ok",
    network: "Ethereum Sepolia",
    chainId: ENSV2_SEPOLIA_DEPLOYMENT.chainId,
    namespace: ENSV2_SEPOLIA_DEPLOYMENT.namespace,
    sourceCommit: ENSV2_SEPOLIA_DEPLOYMENT.sourceCommit,
  })}\n`,
);
