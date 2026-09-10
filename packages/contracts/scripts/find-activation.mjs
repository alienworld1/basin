import {
  createPublicClient,
  getContractAddress,
  http,
  keccak256,
  parseAbi,
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
const account = privateKeyToAccount(privateKey("DEV_PRIVATE_KEY"));
const client = createPublicClient({
  chain: sepolia,
  transport: http(required("SEPOLIA_RPC_URL")),
});
const nonce = await client.getTransactionCount({ address: account.address });
const candidates = [];
for (let offset = 1; offset <= Math.min(nonce, 8); offset += 1) {
  const deploymentNonce = nonce - offset;
  const address = getContractAddress({
    from: account.address,
    nonce: BigInt(deploymentNonce),
  });
  const code = await client.getCode({ address });
  if (!code || code === "0x") continue;
  try {
    const verifierAddress = await client.readContract({
      address,
      abi: parseAbi(["function ensVerifier() view returns (address)"]),
      functionName: "ensVerifier",
    });
    candidates.push({
      type: "router",
      address,
      verifierAddress,
      deploymentNonce,
      runtimeCodeHash: keccak256(code),
    });
    continue;
  } catch {}
  try {
    const basinRegistry = await client.readContract({
      address,
      abi: parseAbi(["function basinRegistry() view returns (address)"]),
      functionName: "basinRegistry",
    });
    candidates.push({
      type: "verifier",
      address,
      basinRegistry,
      deploymentNonce,
      runtimeCodeHash: keccak256(code),
    });
  } catch {}
}
process.stdout.write(
  `${JSON.stringify({ deployer: account.address, nonce, candidates }, null, 2)}\n`,
);
