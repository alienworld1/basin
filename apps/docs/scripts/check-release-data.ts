import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RELEASE_DATA } from "../lib/release-data";

const repository = join(import.meta.dirname, "../../..");
const router = JSON.parse(readFileSync(join(repository, "packages/contracts/deployments/sepolia.router.v1.json"), "utf8"));
const activation = JSON.parse(readFileSync(join(repository, "packages/contracts/deployments/sepolia.activation.json"), "utf8"));
const sdk = JSON.parse(readFileSync(join(repository, "packages/sdk/package.json"), "utf8"));
const matches = (actual: string, expected: string) => actual.toLowerCase() === expected.toLowerCase();
if (sdk.name !== RELEASE_DATA.sdk.name || sdk.version !== RELEASE_DATA.sdk.version) throw new Error("Release metadata mismatch: basin-sdk package metadata.");
if (router.chainId !== RELEASE_DATA.protocol.chainId || router.version !== RELEASE_DATA.protocol.version) throw new Error("Release metadata mismatch: Router protocol version.");
if (!matches(router.routerAddress, RELEASE_DATA.deployments.router) || !matches(router.assetAddress, RELEASE_DATA.deployments.asset) || !matches(activation.routerAddress, RELEASE_DATA.deployments.activation) || !matches(activation.basinRegistryAddress, RELEASE_DATA.deployments.basinRegistry)) throw new Error("Release metadata mismatch: deployment address.");
console.log("Release metadata matches checked-in SDK and deployment manifests.");
