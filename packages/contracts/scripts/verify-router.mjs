import { readFile } from "node:fs/promises";
import { createPublicClient, getAddress, http, keccak256 } from "viem";
import { sepolia } from "viem/chains";

const manifest = JSON.parse(await readFile(new URL("../deployments/sepolia.router.v1.json", import.meta.url), "utf8"));
const rpcUrl = process.env.SEPOLIA_RPC_URL?.trim();
if (!rpcUrl) throw new Error("Missing SEPOLIA_RPC_URL");
const client = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
const abi = [
  { type: "function", name: "asset", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "ensVerifier", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "VERSION", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
];
const router = getAddress(manifest.routerAddress);
const [chainId, code, asset, verifier, version, routerReceipt, verifierReceipt] = await Promise.all([
  client.getChainId(), client.getCode({ address: router }),
  client.readContract({ address: router, abi, functionName: "asset" }),
  client.readContract({ address: router, abi, functionName: "ensVerifier" }),
  client.readContract({ address: router, abi, functionName: "VERSION" }),
  client.getTransactionReceipt({ hash: manifest.routerTransactionHash }),
  client.getTransactionReceipt({ hash: manifest.verifierTransactionHash }),
]);
if (chainId !== manifest.chainId || !code || keccak256(code) !== manifest.runtimeCodeHash ||
  getAddress(asset) !== getAddress(manifest.assetAddress) || getAddress(verifier) !== getAddress(manifest.verifierAddress) ||
  version !== manifest.version || routerReceipt.status !== "success" || verifierReceipt.status !== "success") {
  throw new Error("Router deployment read-back verification failed");
}
process.stdout.write(JSON.stringify({ chainId, routerAddress: router, asset: getAddress(asset), verifier: getAddress(verifier), version, runtimeCodeHash: keccak256(code), routerBlockNumber: routerReceipt.blockNumber.toString(), verifierBlockNumber: verifierReceipt.blockNumber.toString(), verified: true }, null, 2) + "\n");
