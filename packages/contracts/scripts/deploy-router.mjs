import { readFile, writeFile } from "node:fs/promises";
import solc from "solc";
import { createPublicClient, createWalletClient, getAddress, http, keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};
const ownerKey = () => {
  const value = required("OWNER_PRIVATE_KEY");
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) throw new Error("OWNER_PRIVATE_KEY must be a 32-byte hexadecimal private key");
  return normalized;
};
// Validate the only permitted signing input before compiling or touching the network.
const ownerPrivateKey = ownerKey();
const paths = ["BasinRouterActivation.sol", "BasinApprovedPayeeEnsVerifier.sol", "BasinRouter.sol"];
const sources = Object.fromEntries(await Promise.all(paths.map(async (name) => [name, { content: await readFile(new URL(`../contracts/${name}`, import.meta.url), "utf8") }])));
const output = JSON.parse(solc.compile(JSON.stringify({ language: "Solidity", sources, settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } } })));
const diagnostics = output.errors ?? [];
const errors = diagnostics.filter((item) => item.severity === "error");
if (errors.length) throw new Error(errors.map((item) => item.formattedMessage).join("\n"));
const unsafeWarnings = diagnostics.filter((item) => item.severity === "warning" && /code size|unreachable|unused/i.test(item.formattedMessage));
if (unsafeWarnings.length) throw new Error(unsafeWarnings.map((item) => item.formattedMessage).join("\n"));
const artifact = (file, name) => {
  const contract = output.contracts[file][name];
  return { abi: contract.abi, bytecode: `0x${contract.evm.bytecode.object}` };
};
const verifier = artifact("BasinApprovedPayeeEnsVerifier.sol", "BasinApprovedPayeeEnsVerifier");
const router = artifact("BasinRouter.sol", "BasinRouter");
const rpcUrl = required("SEPOLIA_RPC_URL");
const account = privateKeyToAccount(ownerPrivateKey);
const registry = getAddress(required("ENSV2_BASIN_REGISTRY_ADDRESS"));
const asset = getAddress(required("SETTLEMENT_ASSET_ADDRESS"));
const expectedSymbol = required("SETTLEMENT_ASSET_SYMBOL");
const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
const walletClient = createWalletClient({ account, chain: sepolia, transport: http(rpcUrl) });
if ((await publicClient.getChainId()) !== 11155111) throw new Error("RPC is not Ethereum Sepolia");
const [registryCode, assetCode, balance, symbol] = await Promise.all([
  publicClient.getCode({ address: registry }), publicClient.getCode({ address: asset }), publicClient.getBalance({ address: account.address }),
  publicClient.readContract({ address: asset, abi: [{ type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] }], functionName: "symbol" }),
]);
if (!registryCode || !assetCode) throw new Error("Configured registry or settlement asset has no bytecode");
if (balance === 0n) throw new Error("Deployment account has no Sepolia ETH");
if (symbol !== expectedSymbol) throw new Error("Configured settlement asset symbol does not match");
const verifierHash = await walletClient.deployContract({ ...verifier, args: [registry] });
const verifierReceipt = await publicClient.waitForTransactionReceipt({ hash: verifierHash, confirmations: 2 });
if (!verifierReceipt.contractAddress) throw new Error("Verifier deployment did not create a contract");
const routerHash = await walletClient.deployContract({ ...router, args: [verifierReceipt.contractAddress, asset] });
const routerReceipt = await publicClient.waitForTransactionReceipt({ hash: routerHash, confirmations: 2 });
if (!routerReceipt.contractAddress) throw new Error("Router deployment did not create a contract");
const [runtimeCode, deployedAsset, deployedVerifier, version] = await Promise.all([
  publicClient.getCode({ address: routerReceipt.contractAddress }),
  publicClient.readContract({ address: routerReceipt.contractAddress, abi: router.abi, functionName: "asset" }),
  publicClient.readContract({ address: routerReceipt.contractAddress, abi: router.abi, functionName: "ensVerifier" }),
  publicClient.readContract({ address: routerReceipt.contractAddress, abi: router.abi, functionName: "VERSION" }),
]);
if (!runtimeCode || deployedAsset.toLowerCase() !== asset.toLowerCase() || deployedVerifier.toLowerCase() !== verifierReceipt.contractAddress.toLowerCase() || version !== "1") throw new Error("Router read-back verification failed");
const sourceDigest = keccak256(toBytes(paths.map((name) => sources[name].content).join("\n")));
const manifest = { chainId: 11155111, version, routerAddress: routerReceipt.contractAddress, verifierAddress: verifierReceipt.contractAddress, assetAddress: asset, assetSymbol: symbol, deployerAddress: account.address, verifierTransactionHash: verifierHash, routerTransactionHash: routerHash, verifierBlockNumber: verifierReceipt.blockNumber.toString(), routerBlockNumber: routerReceipt.blockNumber.toString(), runtimeCodeHash: keccak256(runtimeCode), sourceDigest, compiler: "solc 0.8.30", optimizer: { enabled: true, runs: 200, viaIR: true }, verification: "read-back verified" };
await writeFile(new URL("../deployments/sepolia.router.v1.json", import.meta.url), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
