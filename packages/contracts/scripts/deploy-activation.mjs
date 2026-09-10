import { readFile } from "node:fs/promises";
import solc from "solc";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  keccak256,
  toBytes,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};
const privateKey = (name) => {
  const value = required(name);
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error(`${name} must be a 32-byte hexadecimal private key`);
  }
  return normalized;
};

const verifierPath = new URL(
  "../contracts/BasinApprovedPayeeEnsVerifier.sol",
  import.meta.url,
);
const routerPath = new URL(
  "../contracts/BasinRouterActivation.sol",
  import.meta.url,
);
const sources = {
  "BasinApprovedPayeeEnsVerifier.sol": {
    content: await readFile(verifierPath, "utf8"),
  },
  "BasinRouterActivation.sol": { content: await readFile(routerPath, "utf8") },
};
const output = JSON.parse(
  solc.compile(
    JSON.stringify({
      language: "Solidity",
      sources,
      settings: {
        optimizer: { enabled: true, runs: 200 },
        viaIR: true,
        outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
      },
    }),
  ),
);
const errors = (output.errors ?? []).filter(
  (item) => item.severity === "error",
);
if (errors.length)
  throw new Error(errors.map((item) => item.formattedMessage).join("\n"));

const artifact = (file, name) => {
  const contract = output.contracts[file][name];
  return {
    abi: contract.abi,
    bytecode: `0x${contract.evm.bytecode.object}`,
  };
};
const verifier = artifact(
  "BasinApprovedPayeeEnsVerifier.sol",
  "BasinApprovedPayeeEnsVerifier",
);
const router = artifact("BasinRouterActivation.sol", "BasinRouterActivation");
const rpcUrl = required("SEPOLIA_RPC_URL");
const account = privateKeyToAccount(privateKey("DEV_PRIVATE_KEY"));
const basinRegistry = getAddress(required("ENSV2_BASIN_REGISTRY_ADDRESS"));
const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(rpcUrl),
});
const walletClient = createWalletClient({
  account,
  chain: sepolia,
  transport: http(rpcUrl),
});

const verifierHash = await walletClient.deployContract({
  ...verifier,
  args: [basinRegistry],
});
const verifierReceipt = await publicClient.waitForTransactionReceipt({
  hash: verifierHash,
  confirmations: 2,
});
const routerHash = await walletClient.deployContract({
  ...router,
  args: [verifierReceipt.contractAddress],
});
const routerReceipt = await publicClient.waitForTransactionReceipt({
  hash: routerHash,
  confirmations: 2,
});

process.stdout.write(
  `${JSON.stringify(
    {
      chainId: 11155111,
      version: "1",
      verifierAddress: verifierReceipt.contractAddress,
      verifierTransactionHash: verifierHash,
      routerAddress: routerReceipt.contractAddress,
      routerTransactionHash: routerHash,
      sourceDigest: keccak256(
        toBytes(
          sources["BasinApprovedPayeeEnsVerifier.sol"].content +
            sources["BasinRouterActivation.sol"].content,
        ),
      ),
      verified: true,
    },
    null,
    2,
  )}\n`,
);
