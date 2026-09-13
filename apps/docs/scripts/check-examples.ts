import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(import.meta.dirname, "../content/build-with-basin/install.mdx"), "utf8");
if (!source.includes('from "basin-sdk"') || !source.includes('from "viem"')) throw new Error("Executable example failure: build-with-basin/install.");
const declarations = readFileSync(join(import.meta.dirname, "../../../packages/sdk/dist/index.d.ts"), "utf8");
for (const exportName of ["createBasinClient", "BASIN_SEPOLIA_V1", "ReceiptVerification"]) if (!declarations.includes(exportName)) throw new Error(`SDK declaration mismatch: ${exportName}.`);
console.log("SDK examples reference the released public package surface.");
